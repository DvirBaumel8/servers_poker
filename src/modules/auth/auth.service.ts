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
import { UrlValidatorService } from "../../common/validators/url-validator.service";
import { getLikelyEmailSuggestion, normalizeEmail } from "./email-guard";

interface RegisterResponse {
  message: string;
  email: string;
  requiresVerification: boolean;
  verificationCode?: string;
}

const SALT_ROUNDS = 12;
const _MAX_BOTS_PER_ACCOUNT = 10;

// Account lockout configuration
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const FAILED_ATTEMPT_RESET_MS = 30 * 60 * 1000; // Reset counter after 30 minutes of no failures

// API key configuration
const API_KEY_EXPIRY_DAYS = 90; // API keys expire after 90 days
const API_KEY_WARNING_DAYS = 14; // Warn when key expires in 14 days

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly botRepository: BotRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly urlValidator: UrlValidatorService,
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

    // Pre-hash password before transaction to minimize lock time
    const { hash: apiKeyHash } = this.userRepository.generateApiKey();
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
            email,
            name: dto.name,
            password_hash: passwordHash,
            api_key_hash: apiKeyHash,
            role: "user",
            email_verified: false,
            verification_code: verificationCode,
            verification_code_expires_at: verificationExpires,
          },
          manager,
        );
      });
    } catch (error) {
      // Catch database unique constraint violation (PostgreSQL error code 23505)
      if (
        error instanceof ConflictException ||
        (error as any)?.code === "23505" ||
        (error as any)?.message?.includes("duplicate key")
      ) {
        throw new ConflictException(
          "Email already registered. Please verify your email or resend the verification code.",
        );
      }
      throw error;
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

    // Generate new API key for the verified user
    const { raw: apiKey, hash: apiKeyHash } =
      this.userRepository.generateApiKey();

    await this.userRepository.update(user.id, {
      email_verified: true,
      verification_code: null,
      verification_code_expires_at: null,
      api_key_hash: apiKeyHash,
    });

    // Send welcome email
    await this.emailService.sendWelcomeEmail(user.email, user.name);

    const tokens = this.generateTokens(user);

    return {
      ...tokens,
      apiKey,
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

    const tokens = this.generateTokens(user);

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
    this.logger.log(`Password reset code sent to ${user.email}`);

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

    if (user.password_reset_code !== dto.code) {
      throw new BadRequestException("Invalid reset code");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);

    await this.userRepository.update(user.id, {
      password_hash: passwordHash,
      password_reset_code: null,
      password_reset_expires_at: null,
    });

    this.logger.log(`Password reset successful for ${user.email}`);

    return { message: "Password has been reset successfully" };
  }

  /**
   * Developer registration - creates user + bot in one call.
   * Skips email verification for developer convenience.
   * Validates bot endpoint with health check.
   */
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

    // 1. Validate bot endpoint URL (do before transaction)
    const urlValidation = await this.urlValidator.validateWithHealthCheck(
      dto.botEndpoint,
      5000,
    );
    if (!urlValidation.valid) {
      throw new BadRequestException(urlValidation.error);
    }

    // 2. Pre-hash password before transaction to minimize lock time
    const { raw: apiKey, hash: apiKeyHash } =
      this.userRepository.generateApiKey();
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    // 3. Use transaction to create user + bot atomically
    let user: User;
    let bot: any;
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        // Check email within transaction
        const existingUser = await this.userRepository.findByEmail(
          email,
          manager,
        );
        if (existingUser) {
          throw new ConflictException("Email already registered");
        }

        // Check bot name within transaction
        const existingBot = await this.botRepository.findByName(
          dto.botName,
          manager,
        );
        if (existingBot) {
          throw new ConflictException(
            `Bot name '${dto.botName}' already exists`,
          );
        }

        // Create user
        const newUser = await this.userRepository.create(
          {
            email,
            name: dto.name,
            password_hash: passwordHash,
            api_key_hash: apiKeyHash,
            role: "user",
            email_verified: true, // Skip verification for API registration
          },
          manager,
        );

        // Create bot
        const newBot = await this.botRepository.create(
          {
            name: dto.botName,
            endpoint: dto.botEndpoint,
            description: dto.botDescription,
            user_id: newUser.id,
            active: true,
          },
          manager,
        );

        return { user: newUser, bot: newBot };
      });
      user = result.user;
      bot = result.bot;
    } catch (error) {
      // Catch database unique constraint violations
      if (
        error instanceof ConflictException ||
        (error as any)?.code === "23505"
      ) {
        if ((error as any)?.message?.includes("email")) {
          throw new ConflictException("Email already registered");
        }
        if (
          (error as any)?.message?.includes("bot") ||
          (error as any)?.message?.includes("name")
        ) {
          throw new ConflictException(
            `Bot name '${dto.botName}' already exists`,
          );
        }
        throw error;
      }
      throw error;
    }

    // 4. Generate JWT tokens
    const tokens = this.generateTokens(user);

    this.logger.log(`Developer registered: ${user.email} with bot ${bot.name}`);

    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      apiKey,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      bot: {
        id: bot.id,
        name: bot.name,
        endpoint: bot.endpoint,
      },
      warnings: urlValidation.warnings,
    };
  }

  async validateApiKey(
    apiKey: string,
  ): Promise<{ user: User | null; expired?: boolean; expiresIn?: number }> {
    const user = await this.userRepository.findByApiKey(apiKey);
    if (!user) {
      return { user: null };
    }

    // Check if API key has expired
    if (
      user.api_key_expires_at &&
      new Date(user.api_key_expires_at) < new Date()
    ) {
      this.logger.warn(`Expired API key used for user: ${user.email}`);
      return { user: null, expired: true };
    }

    // Update last used timestamp
    await this.userRepository.update(user.id, {
      api_key_last_used_at: new Date(),
    });

    // Calculate days until expiry
    let expiresIn: number | undefined;
    if (user.api_key_expires_at) {
      expiresIn = Math.ceil(
        (new Date(user.api_key_expires_at).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      );
    }

    return { user, expiresIn };
  }

  async regenerateApiKey(
    userId: string,
  ): Promise<{ apiKey: string; expiresAt: Date }> {
    const { raw, hash } = this.userRepository.generateApiKey();
    const expiresAt = new Date(
      Date.now() + API_KEY_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.userRepository.update(userId, {
      api_key_hash: hash,
      api_key_created_at: new Date(),
      api_key_expires_at: expiresAt,
      api_key_last_used_at: null,
    });

    this.logger.log(
      `API key regenerated for user ${userId}, expires: ${expiresAt.toISOString()}`,
    );

    return { apiKey: raw, expiresAt };
  }

  async getApiKeyStatus(userId: string): Promise<{
    createdAt: Date | null;
    expiresAt: Date | null;
    lastUsedAt: Date | null;
    daysUntilExpiry: number | null;
    needsRotation: boolean;
  }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new BadRequestException("User not found");
    }

    let daysUntilExpiry: number | null = null;
    let needsRotation = false;

    if (user.api_key_expires_at) {
      daysUntilExpiry = Math.ceil(
        (new Date(user.api_key_expires_at).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      );
      needsRotation = daysUntilExpiry <= API_KEY_WARNING_DAYS;
    } else {
      // Legacy key without expiry - needs rotation
      needsRotation = true;
    }

    return {
      createdAt: user.api_key_created_at,
      expiresAt: user.api_key_expires_at,
      lastUsedAt: user.api_key_last_used_at,
      daysUntilExpiry,
      needsRotation,
    };
  }

  private generateTokens(user: User): {
    accessToken: string;
    expiresIn: number;
  } {
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

    return {
      accessToken,
      expiresIn: expiresInMs,
    };
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
