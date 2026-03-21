import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { AuthService } from "../../../src/modules/auth/auth.service";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";

vi.mock("bcrypt", () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

describe("AuthService", () => {
  let service: AuthService;
  let mockUserRepository: {
    findByEmail: ReturnType<typeof vi.fn>;
    findByApiKey: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    generateApiKey: ReturnType<typeof vi.fn>;
  };
  let mockBotRepository: {
    findByName: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let mockJwtService: {
    sign: ReturnType<typeof vi.fn>;
  };
  let mockConfigService: {
    get: ReturnType<typeof vi.fn>;
  };
  let mockEmailService: {
    generateVerificationCode: ReturnType<typeof vi.fn>;
    sendVerificationCode: ReturnType<typeof vi.fn>;
    sendWelcomeEmail: ReturnType<typeof vi.fn>;
    sendPasswordResetCode: ReturnType<typeof vi.fn>;
  };
  let mockUrlValidator: {
    validateWithHealthCheck: ReturnType<typeof vi.fn>;
  };
  let mockDataSource: {
    transaction: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    password_hash: "hashed-password",
    role: "user",
    active: true,
    email_verified: true,
    verification_code: null,
    verification_code_expires_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockUserRepository = {
      findByEmail: vi.fn(),
      findByApiKey: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      generateApiKey: vi.fn().mockReturnValue({
        raw: "api-key-raw",
        hash: "api-key-hash",
      }),
    };

    mockBotRepository = {
      findByName: vi.fn(),
      create: vi.fn(),
    };

    mockJwtService = {
      sign: vi.fn().mockReturnValue("jwt-token"),
    };

    mockConfigService = {
      get: vi.fn().mockReturnValue("24h"),
    };

    mockEmailService = {
      generateVerificationCode: vi.fn().mockReturnValue("123456"),
      sendVerificationCode: vi.fn().mockResolvedValue(true),
      sendWelcomeEmail: vi.fn().mockResolvedValue(true),
      sendPasswordResetCode: vi.fn().mockResolvedValue(true),
    };

    mockUrlValidator = {
      validateWithHealthCheck: vi.fn().mockResolvedValue({ valid: true }),
    };

    mockDataSource = {
      transaction: vi
        .fn()
        .mockImplementation(
          async (
            callback: (
              manager: Record<string, never>,
            ) => unknown | Promise<unknown>,
          ) => {
            return callback({});
          },
        ),
    };

    service = new AuthService(
      mockUserRepository as never,
      mockBotRepository as never,
      mockJwtService as JwtService,
      mockConfigService as ConfigService,
      mockEmailService as never,
      mockUrlValidator as never,
      mockDataSource as never,
    );

    (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue(
      "hashed-password",
    );
    (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  describe("register", () => {
    it("should register new user successfully", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue({
        ...mockUser,
        email: "new@example.com",
        email_verified: false,
      });

      const result = await service.register({
        email: "new@example.com",
        password: "password123",
        name: "New User",
      });

      expect(result.requiresVerification).toBe(true);
      expect(result.email).toBe("new@example.com");
      expect(mockEmailService.sendVerificationCode).toHaveBeenCalled();
    });

    it("should throw ConflictException for existing verified email", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: "test@example.com",
          password: "password123",
          name: "Test",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw ConflictException for existing unverified email", async () => {
      const unverifiedUser = { ...mockUser, email_verified: false };
      mockUserRepository.findByEmail.mockResolvedValue(unverifiedUser);

      await expect(
        service.register({
          email: "test@example.com",
          password: "newpassword",
          name: "Test",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("should use transaction for atomic check and insert (race condition fix)", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue({
        ...mockUser,
        email: "new@example.com",
        email_verified: false,
      });

      await service.register({
        email: "new@example.com",
        password: "password123",
        name: "New User",
      });

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it("should handle database unique constraint violation", async () => {
      mockDataSource.transaction.mockRejectedValue({
        code: "23505",
        message: "duplicate key value violates unique constraint",
      });

      await expect(
        service.register({
          email: "duplicate@example.com",
          password: "password123",
          name: "Duplicate",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("verifyEmail", () => {
    it("should verify email successfully", async () => {
      const unverifiedUser = {
        ...mockUser,
        email_verified: false,
        verification_code: "123456",
        verification_code_expires_at: new Date(Date.now() + 600000),
      };
      mockUserRepository.findByEmail.mockResolvedValue(unverifiedUser);
      mockUserRepository.update.mockResolvedValue(unverifiedUser);

      const result = await service.verifyEmail({
        email: "test@example.com",
        code: "123456",
      });

      expect(result.accessToken).toBe("jwt-token");
      expect(result.apiKey).toBe("api-key-raw");
    });

    it("should throw BadRequestException for non-existent user", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.verifyEmail({
          email: "nonexistent@example.com",
          code: "123456",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException for already verified email", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.verifyEmail({ email: "test@example.com", code: "123456" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException for expired code", async () => {
      const expiredUser = {
        ...mockUser,
        email_verified: false,
        verification_code: "123456",
        verification_code_expires_at: new Date(Date.now() - 600000),
      };
      mockUserRepository.findByEmail.mockResolvedValue(expiredUser);

      await expect(
        service.verifyEmail({ email: "test@example.com", code: "123456" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException for invalid code", async () => {
      const unverifiedUser = {
        ...mockUser,
        email_verified: false,
        verification_code: "123456",
        verification_code_expires_at: new Date(Date.now() + 600000),
      };
      mockUserRepository.findByEmail.mockResolvedValue(unverifiedUser);

      await expect(
        service.verifyEmail({ email: "test@example.com", code: "wrong-code" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("resendVerificationCode", () => {
    it("should resend code for unverified user", async () => {
      const unverifiedUser = { ...mockUser, email_verified: false };
      mockUserRepository.findByEmail.mockResolvedValue(unverifiedUser);
      mockUserRepository.update.mockResolvedValue(unverifiedUser);

      const result = await service.resendVerificationCode({
        email: "test@example.com",
      });

      expect(result.message).toContain("Verification code sent");
    });

    it("should return generic message for non-existent user", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      const result = await service.resendVerificationCode({
        email: "nonexistent@example.com",
      });

      expect(result.message).toBe(
        "If the email exists, a verification code was sent",
      );
    });

    it("should throw for already verified user", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.resendVerificationCode({ email: "test@example.com" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("login", () => {
    it("should login successfully with valid credentials", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue(mockUser);

      const result = await service.login({
        email: "test@example.com",
        password: "password123",
      });

      expect(result.accessToken).toBe("jwt-token");
      expect(result.user.email).toBe("test@example.com");
    });

    it("should throw UnauthorizedException for non-existent user", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: "nonexistent@example.com", password: "test" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException for invalid password", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(
        service.login({ email: "test@example.com", password: "wrong" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException for deactivated user", async () => {
      mockUserRepository.findByEmail.mockResolvedValue({
        ...mockUser,
        active: false,
      });

      await expect(
        service.login({ email: "test@example.com", password: "password123" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException for unverified email", async () => {
      mockUserRepository.findByEmail.mockResolvedValue({
        ...mockUser,
        email_verified: false,
      });

      await expect(
        service.login({ email: "test@example.com", password: "password123" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("forgotPassword", () => {
    it("should send reset code for valid user", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue(mockUser);

      const result = await service.forgotPassword({
        email: "test@example.com",
      });

      expect(result.message).toContain("reset code has been sent");
      expect(mockEmailService.sendPasswordResetCode).toHaveBeenCalled();
    });

    it("should return same message for non-existent user", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: "nonexistent@example.com",
      });

      expect(result.message).toContain("reset code has been sent");
    });
  });

  describe("resetPassword", () => {
    it("should reset password successfully", async () => {
      const userWithResetCode = {
        ...mockUser,
        password_reset_code: "654321",
        password_reset_expires_at: new Date(Date.now() + 900000),
      };
      mockUserRepository.findByEmail.mockResolvedValue(userWithResetCode);
      mockUserRepository.update.mockResolvedValue(userWithResetCode);

      const result = await service.resetPassword({
        email: "test@example.com",
        code: "654321",
        newPassword: "newpassword123",
      });

      expect(result.message).toBe("Password has been reset successfully");
    });

    it("should throw for non-existent user", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          email: "nonexistent@example.com",
          code: "654321",
          newPassword: "newpassword",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw for expired reset code", async () => {
      const userWithExpiredCode = {
        ...mockUser,
        password_reset_code: "654321",
        password_reset_expires_at: new Date(Date.now() - 900000),
      };
      mockUserRepository.findByEmail.mockResolvedValue(userWithExpiredCode);

      await expect(
        service.resetPassword({
          email: "test@example.com",
          code: "654321",
          newPassword: "newpassword",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw for invalid reset code", async () => {
      const userWithResetCode = {
        ...mockUser,
        password_reset_code: "654321",
        password_reset_expires_at: new Date(Date.now() + 900000),
      };
      mockUserRepository.findByEmail.mockResolvedValue(userWithResetCode);

      await expect(
        service.resetPassword({
          email: "test@example.com",
          code: "wrong-code",
          newPassword: "newpassword",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("registerDeveloper", () => {
    it("should register developer with bot successfully", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockBotRepository.findByName.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue(mockUser);
      mockBotRepository.create.mockResolvedValue({
        id: "bot-123",
        name: "TestBot",
        endpoint: "http://localhost:4000/action",
      });

      const result = await service.registerDeveloper({
        email: "dev@example.com",
        password: "password123",
        name: "Developer",
        botName: "TestBot",
        botEndpoint: "http://localhost:4000/action",
      });

      expect(result.accessToken).toBe("jwt-token");
      expect(result.apiKey).toBe("api-key-raw");
      expect(result.bot.name).toBe("TestBot");
    });

    it("should throw ConflictException for existing email", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.registerDeveloper({
          email: "test@example.com",
          password: "password123",
          name: "Developer",
          botName: "TestBot",
          botEndpoint: "http://localhost:4000/action",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw ConflictException for existing bot name", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockBotRepository.findByName.mockResolvedValue({ id: "existing-bot" });

      await expect(
        service.registerDeveloper({
          email: "dev@example.com",
          password: "password123",
          name: "Developer",
          botName: "ExistingBot",
          botEndpoint: "http://localhost:4000/action",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw BadRequestException for invalid endpoint", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockBotRepository.findByName.mockResolvedValue(null);
      mockUrlValidator.validateWithHealthCheck.mockResolvedValue({
        valid: false,
        error: "Invalid URL",
      });

      await expect(
        service.registerDeveloper({
          email: "dev@example.com",
          password: "password123",
          name: "Developer",
          botName: "TestBot",
          botEndpoint: "invalid-url",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("validateApiKey", () => {
    it("should return user for valid API key", async () => {
      mockUserRepository.findByApiKey.mockResolvedValue(mockUser);

      const result = await service.validateApiKey("valid-api-key");

      expect(result).toEqual({
        user: mockUser,
        expiresIn: undefined,
      });
    });

    it("should return null for invalid API key", async () => {
      mockUserRepository.findByApiKey.mockResolvedValue(null);

      const result = await service.validateApiKey("invalid-api-key");

      expect(result).toEqual({ user: null });
    });
  });

  describe("regenerateApiKey", () => {
    it("should generate new API key", async () => {
      mockUserRepository.update.mockResolvedValue(mockUser);

      const result = await service.regenerateApiKey("user-123");

      expect(result.apiKey).toBe("api-key-raw");
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        "user-123",
        expect.objectContaining({ api_key_hash: "api-key-hash" }),
      );
    });
  });
});
