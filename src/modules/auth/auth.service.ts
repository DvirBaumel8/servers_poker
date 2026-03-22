import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { UserRepository } from "../../repositories/user.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { User } from "../../entities/user.entity";
import {
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  VerifyEmailDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RegisterDeveloperDto,
  RegisterDeveloperResponseDto,
} from "./dto/login.dto";
import { JwtPayload } from "./strategies/jwt.strategy";
import { EmailService } from "../../services/email.service";
import { getLikelyEmailSuggestion, normalizeEmail } from "./email-guard";
import { mapPostgresError, PG_ERROR_CODES } from "../../common/utils";

interface RegisterResponse {
  message: string;
  email: string;
  requiresVerification: boolean;
  verificationCode?: string;
}

const SALT_ROUNDS = 12;

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const FAILED_ATTEMPT_RESET_MS = 30 * 60 * 1000; // Reset counter after 30 minutes of no failures

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly botRepository: BotRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly dataSource: DataSource,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const email = normalizeEmail(dto.email);
    const suggestedEmail = getLikelyEmailSuggestion(email);
    if (suggestedEmail) {
      throw new BadRequestException(
        `Please double-check your email address. Did you mean ${suggestedEmail}?`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const verificationCode = this.emailService.generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Use transaction to prevent race condition (TOCTOU vulnerability)
    // Also rely on database UNIQUE constraint as final safeguard
    let user: User;
    try {
      user = await this.dataSource.transaction(async (manager) => {
        // Check within transaction for atomicity
        const existingUser = await this.userRepository.findByEmail(
          email,
          manager,
        );
        if (existingUser) {
          throw new ConflictException(
            "Email already registered. Please verify your email or resend the verification code.",
          );
        }

        return await this.userRepository.create(
          {
            id: uuidv4(),
            email,
            name: dto.name,
            password_hash: passwordHash,
            role: "user",
            email_verified: false,
            verification_code: verificationCode,
            verification_code_expires_at: verificationExpires,
          },
          manager,
        );
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw mapPostgresError(error, {
        [PG_ERROR_CODES.UNIQUE_VIOLATION]:
          "Email already registered. Please verify your email or resend the verification code.",
      });
    }

    await this.emailService.sendVerificationCode(user.email, verificationCode);
    this.logger.log(`Verification code sent to ${user.email}`);

    return {
      message: "Verification code sent to your email",
      email: user.email,
      requiresVerification: true,
      ...(this.shouldExposeVerificationCode() ? { verificationCode } : {}),
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findByEmail(
      normalizeEmail(dto.email),
    );
    if (!user) {
      throw new BadRequestException("User not found");
    }

    if (user.email_verified) {
      throw new BadRequestException("Email already verified");
    }

    if (!user.verification_code || !user.verification_code_expires_at) {
      throw new BadRequestException(
        "No verification code found. Please request a new one.",
      );
    }

    if (new Date() > user.verification_code_expires_at) {
      throw new BadRequestException(
        "Verification code expired. Please request a new one.",
      );
    }

    if (user.verification_code !== dto.code) {
      throw new BadRequestException("Invalid verification code");
    }

    await this.userRepository.update(user.id, {
      email_verified: true,
      verification_code: null,
      verification_code_expires_at: null,
    });

    await this.emailService.sendWelcomeEmail(user.email, user.name);

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async resendVerificationCode(
    dto: ResendVerificationDto,
  ): Promise<{ message: string; verificationCode?: string }> {
    const user = await this.userRepository.findByEmail(
      normalizeEmail(dto.email),
    );
    if (!user) {
      // Don't reveal if email exists
      return { message: "If the email exists, a verification code was sent" };
    }

    if (user.email_verified) {
      throw new BadRequestException("Email already verified");
    }

    const verificationCode = await this.sendVerificationCode(user);
    return {
      message: "Verification code sent to your email",
      ...(this.shouldExposeVerificationCode() ? { verificationCode } : {}),
    };
  }

  private async sendVerificationCode(user: User): Promise<string> {
    const verificationCode = this.emailService.generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000);

    await this.userRepository.update(user.id, {
      verification_code: verificationCode,
      verification_code_expires_at: verificationExpires,
    });

    await this.emailService.sendVerificationCode(user.email, verificationCode);
    this.logger.log(`Verification code resent to ${user.email}`);
    return verificationCode;
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findByEmail(
      normalizeEmail(dto.email),
    );
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingMs = new Date(user.locked_until).getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      this.logger.warn(`Login attempt on locked account: ${user.email}`);
      throw new UnauthorizedException(
        `Account is temporarily locked. Try again in ${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""}`,
      );
    }

    // Reset failed attempts if last failure was long ago
    if (
      user.last_failed_login_at &&
      Date.now() - new Date(user.last_failed_login_at).getTime() >
        FAILED_ATTEMPT_RESET_MS
    ) {
      await this.userRepository.update(user.id, {
        failed_login_attempts: 0,
        last_failed_login_at: null,
      });
      user.failed_login_attempts = 0;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!isPasswordValid) {
      await this.handleFailedLogin(user);
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.active) {
      throw new UnauthorizedException("Account is deactivated");
    }

    if (!user.email_verified) {
      throw new UnauthorizedException(
        "Please verify your email before logging in",
      );
    }

    // Successful login - reset failed attempts and update last login
    await this.userRepository.update(user.id, {
      last_login_at: new Date(),
      failed_login_attempts: 0,
      locked_until: null,
      last_failed_login_at: null,
    });

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  private async handleFailedLogin(user: User): Promise<void> {
    const newFailedAttempts = (user.failed_login_attempts || 0) + 1;

    const updateData: Partial<User> = {
      failed_login_attempts: newFailedAttempts,
      last_failed_login_at: new Date(),
    };

    if (newFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      updateData.locked_until = new Date(Date.now() + LOCKOUT_DURATION_MS);
      this.logger.warn(
        `Account locked due to ${newFailedAttempts} failed login attempts: ${user.email}`,
      );
    }

    await this.userRepository.update(user.id, updateData);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepository.findByEmail(
      normalizeEmail(dto.email),
    );

    // Always return same message to prevent email enumeration
    const successMessage =
      "If an account exists with this email, a reset code has been sent";

    if (!user || !user.email_verified) {
      return { message: successMessage };
    }

    const resetCode = this.emailService.generateVerificationCode();
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.userRepository.update(user.id, {
      password_reset_code: resetCode,
      password_reset_expires_at: resetExpires,
    });

    await this.emailService.sendPasswordResetCode(user.email, resetCode);
    this.logger.log(`Reset code sent to ${user.email}`);

    return { message: successMessage };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepository.findByEmail(
      normalizeEmail(dto.email),
    );
    if (!user) {
      throw new BadRequestException("Invalid reset request");
    }

    if (!user.password_reset_code || !user.password_reset_expires_at) {
      throw new BadRequestException(
        "No reset code found. Please request a new one.",
      );
    }

    if (new Date() > user.password_reset_expires_at) {
      throw new BadRequestException(
        "Reset code expired. Please request a new one.",
      );
    }

    const codeBuffer = Buffer.from(dto.code.padEnd(6, "0"));
    const storedBuffer = Buffer.from(
      (user.password_reset_code || "").padEnd(6, "0"),
    );
    if (!timingSafeEqual(codeBuffer, storedBuffer)) {
      throw new BadRequestException("Invalid reset code");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);

    await this.userRepository.update(user.id, {
      password_hash: passwordHash,
      password_reset_code: null,
      password_reset_expires_at: null,
    });

    this.logger.log(`Credential reset successful for ${user.email}`);

    return { message: "Password has been reset successfully" };
  }

  async registerDeveloper(
    dto: RegisterDeveloperDto,
  ): Promise<RegisterDeveloperResponseDto> {
    const email = normalizeEmail(dto.email);
    const suggestedEmail = getLikelyEmailSuggestion(email);
    if (suggestedEmail) {
      throw new BadRequestException(
        `Please double-check your email address. Did you mean ${suggestedEmail}?`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const defaultStrategy = {
      version: 1,
      tier: "quick",
      personality: {
        aggression: 20,
        bluffFrequency: 10,
        riskTolerance: 30,
        tightness: 40,
      },
    };

    let user: User;
    let bot: any;
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const existingUser = await this.userRepository.findByEmail(
          email,
          manager,
        );
        if (existingUser) {
          throw new ConflictException("Email already registered");
        }

        const existingBot = await this.botRepository.findByName(
          dto.botName,
          manager,
        );
        if (existingBot) {
          throw new ConflictException(
            `Bot name '${dto.botName}' already exists`,
          );
        }

        const verificationCode = this.emailService.generateVerificationCode();
        const codeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const newUser = await this.userRepository.create(
          {
            id: uuidv4(),
            email,
            name: dto.name,
            password_hash: passwordHash,
            role: "user",
            email_verified: false,
            verification_code: verificationCode,
            verification_code_expires_at: codeExpiry,
          },
          manager,
        );

        const newBot = await this.botRepository.create(
          {
            id: uuidv4(),
            name: dto.botName,
            description: dto.botDescription,
            user_id: newUser.id,
            strategy: defaultStrategy,
            active: true,
          },
          manager,
        );

        return { user: newUser, bot: newBot };
      });
      user = result.user;
      bot = result.bot;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message.toLowerCase() : "";
      if (errorMessage.includes("bot") || errorMessage.includes("name")) {
        throw mapPostgresError(error, {
          [PG_ERROR_CODES.UNIQUE_VIOLATION]: `Bot name '${dto.botName}' already exists`,
        });
      }
      throw mapPostgresError(error, {
        [PG_ERROR_CODES.UNIQUE_VIOLATION]: "Email already registered",
      });
    }

    await this.emailService.sendVerificationCode(
      user.email,
      user.verification_code!,
    );

    this.logger.log(
      `Developer registered: ${user.email} with bot ${bot.name} — verification email sent`,
    );

    return {
      message: "Registration successful. Please verify your email to log in.",
      ...(this.shouldExposeVerificationCode()
        ? { verificationCode: user.verification_code }
        : {}),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      bot: {
        id: bot.id,
        name: bot.name,
      },
    };
  }

  private async generateTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const expiresInStr = this.configService.get<string>(
      "JWT_EXPIRES_IN",
      "24h",
    );
    const expiresInMs = this.parseExpiresIn(expiresInStr);

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = randomBytes(32).toString("hex");
    const refreshTokenHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    const refreshTokenExpiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ); // 7 days

    await this.userRepository.update(user.id, {
      refresh_token_hash: refreshTokenHash,
      refresh_token_expires_at: refreshTokenExpiresAt,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: expiresInMs,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthResponseDto> {
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");

    const user = await this.userRepository.findByRefreshTokenHash(tokenHash);
    if (!user) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (
      !user.refresh_token_expires_at ||
      new Date() > user.refresh_token_expires_at
    ) {
      await this.userRepository.update(user.id, {
        refresh_token_hash: null,
        refresh_token_expires_at: null,
      });
      throw new UnauthorizedException("Refresh token expired");
    }

    if (!user.active) {
      throw new UnauthorizedException("Account is deactivated");
    }

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async revokeRefreshToken(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      refresh_token_hash: null,
      refresh_token_expires_at: null,
    });
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 86400;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 3600;
      case "d":
        return value * 86400;
      default:
        return 86400;
    }
  }

  private shouldExposeVerificationCode(): boolean {
    return this.configService.get<string>("nodeEnv") !== "production";
  }
}
