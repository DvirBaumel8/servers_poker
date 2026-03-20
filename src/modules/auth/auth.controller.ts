import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import {
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  UserDto,
  RegenerateApiKeyResponseDto,
  VerifyEmailDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RegisterDeveloperDto,
  RegisterDeveloperResponseDto,
} from "./dto/login.dto";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { User } from "../../entities/user.entity";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Standard registration - requires email verification.
   * Rate limited: 5 requests per IP per hour.
   */
  @Public()
  @Post("register")
  @Throttle({ default: { ttl: 3600000, limit: 5 } }) // 5 per hour
  async register(@Body() dto: RegisterDto): Promise<{
    message: string;
    email: string;
    requiresVerification: boolean;
  }> {
    return this.authService.register(dto);
  }

  /**
   * Developer registration - register user + create bot in one API call.
   * Returns JWT token, API key, and bot details immediately.
   * No email verification required.
   * Rate limited: 3 requests per IP per hour (stricter since it bypasses verification).
   */
  @Public()
  @Post("register-developer")
  @Throttle({ default: { ttl: 3600000, limit: 3 } }) // 3 per hour
  async registerDeveloper(
    @Body() dto: RegisterDeveloperDto,
  ): Promise<RegisterDeveloperResponseDto> {
    return this.authService.registerDeveloper(dto);
  }

  @Public()
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<AuthResponseDto> {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    return this.authService.resendVerificationCode(dto);
  }

  /**
   * Forgot password - sends reset code.
   * Rate limited: 3 requests per IP per 15 minutes.
   */
  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 900000, limit: 3 } }) // 3 per 15 minutes
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  /**
   * Login - authenticate user.
   * Rate limited: 10 requests per IP per 15 minutes.
   */
  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 900000, limit: 10 } }) // 10 per 15 minutes
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: User): Promise<UserDto> {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      created_at: user.created_at,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post("regenerate-api-key")
  @HttpCode(HttpStatus.OK)
  async regenerateApiKey(
    @CurrentUser() user: User,
  ): Promise<RegenerateApiKeyResponseDto> {
    return this.authService.regenerateApiKey(user.id);
  }
}
