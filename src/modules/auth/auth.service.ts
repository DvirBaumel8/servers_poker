import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { UserRepository } from "../../repositories/user.repository";
import { User } from "../../entities/user.entity";
import {
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  VerifyEmailDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from "./dto/login.dto";
import { JwtPayload } from "./strategies/jwt.strategy";
import { EmailService } from "../../services/email.service";

interface RegisterResponse {
  message: string;
  email: string;
  requiresVerification: boolean;
}

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const existingUser = await this.userRepository.findByEmail(dto.email);
    if (existingUser) {
      if (existingUser.email_verified) {
        throw new ConflictException("Email already registered");
      }
      // Update password and resend verification code for unverified user
      const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
      await this.userRepository.update(existingUser.id, {
        password_hash: passwordHash,
        name: dto.name,
      });
      await this.sendVerificationCode(existingUser);
      return {
        message: "Verification code sent to your email",
        email: dto.email,
        requiresVerification: true,
      };
    }

    const { hash: apiKeyHash } = this.userRepository.generateApiKey();
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const verificationCode = this.emailService.generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await this.userRepository.create({
      email: dto.email,
      name: dto.name,
      password_hash: passwordHash,
      api_key_hash: apiKeyHash,
      role: "user",
      email_verified: false,
      verification_code: verificationCode,
      verification_code_expires_at: verificationExpires,
    });

    await this.emailService.sendVerificationCode(user.email, verificationCode);
    this.logger.log(`Verification code sent to ${user.email}`);

    return {
      message: "Verification code sent to your email",
      email: user.email,
      requiresVerification: true,
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findByEmail(dto.email);
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
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      // Don't reveal if email exists
      return { message: "If the email exists, a verification code was sent" };
    }

    if (user.email_verified) {
      throw new BadRequestException("Email already verified");
    }

    await this.sendVerificationCode(user);
    return { message: "Verification code sent to your email" };
  }

  private async sendVerificationCode(user: User): Promise<void> {
    const verificationCode = this.emailService.generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000);

    await this.userRepository.update(user.id, {
      verification_code: verificationCode,
      verification_code_expires_at: verificationExpires,
    });

    await this.emailService.sendVerificationCode(user.email, verificationCode);
    this.logger.log(`Verification code resent to ${user.email}`);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!isPasswordValid) {
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

    await this.userRepository.update(user.id, { last_login_at: new Date() });

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

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepository.findByEmail(dto.email);

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
    const user = await this.userRepository.findByEmail(dto.email);
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

  async validateApiKey(apiKey: string): Promise<User | null> {
    return this.userRepository.findByApiKey(apiKey);
  }

  async regenerateApiKey(userId: string): Promise<{ apiKey: string }> {
    const { raw, hash } = this.userRepository.generateApiKey();
    await this.userRepository.update(userId, { api_key_hash: hash });
    return { apiKey: raw };
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
}
