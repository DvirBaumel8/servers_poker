import { IsEmail, IsString, MinLength, Length } from "class-validator";

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class VerifyEmailDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

export class ApiKeyAuthDto {
  @IsString()
  apiKey: string;
}

export class UserDto {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: Date;
}

export class AuthResponseDto {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  apiKey?: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export class MeResponseDto {
  user: UserDto;
}

export class RegenerateApiKeyResponseDto {
  apiKey: string;
}
