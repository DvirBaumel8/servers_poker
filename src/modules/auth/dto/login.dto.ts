import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Length,
  Matches,
  IsUrl,
  IsOptional,
} from "class-validator";

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class RegisterDto {
  @IsEmail({}, { message: "Please provide a valid email address" })
  email: string;

  @IsString()
  @MinLength(2, { message: "Name must be at least 2 characters" })
  @MaxLength(100, { message: "Name cannot exceed 100 characters" })
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/, {
    message:
      "Name must start with a letter or number and contain only letters, numbers, spaces, dots, underscores, and hyphens",
  })
  name: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @MaxLength(72, { message: "Password cannot exceed 72 characters" })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
  })
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
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @MaxLength(72, { message: "Password cannot exceed 72 characters" })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
  })
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

/**
 * Developer registration - combines user registration + bot creation in one call.
 * Allows developers to start building bots without going through the UI.
 */
export class RegisterDeveloperDto {
  @IsEmail({}, { message: "Please provide a valid email address" })
  email: string;

  @IsString()
  @MinLength(2, { message: "Name must be at least 2 characters" })
  @MaxLength(100, { message: "Name cannot exceed 100 characters" })
  name: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @MaxLength(72, { message: "Password cannot exceed 72 characters" }) // bcrypt limit
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
  })
  password: string;

  @IsString()
  @MinLength(3, { message: "Bot name must be at least 3 characters" })
  @MaxLength(30, { message: "Bot name cannot exceed 30 characters" })
  @Matches(/^[a-zA-Z][a-zA-Z0-9_-]*$/, {
    message:
      "Bot name must start with a letter and contain only letters, numbers, underscores, and hyphens",
  })
  botName: string;

  @IsUrl(
    {
      protocols: ["http", "https"],
      require_protocol: true,
      require_tld: false,
    },
    { message: "Bot endpoint must be a valid HTTP or HTTPS URL" },
  )
  botEndpoint: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "Bot description cannot exceed 500 characters" })
  @Matches(/^[^<>]*$/, {
    message: "Bot description must not contain HTML tags",
  })
  botDescription?: string;
}

export class RegisterDeveloperResponseDto {
  accessToken: string;
  expiresIn: number;
  apiKey: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  bot: {
    id: string;
    name: string;
    endpoint: string;
  };
  warnings?: string[];
}
