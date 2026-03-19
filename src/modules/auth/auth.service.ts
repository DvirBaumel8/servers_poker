import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UserRepository } from "../../repositories/user.repository";
import { User } from "../../entities/user.entity";
import { LoginDto, RegisterDto, AuthResponseDto } from "./dto/login.dto";
import { JwtPayload } from "./strategies/jwt.strategy";

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.userRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    const { raw: apiKey, hash: apiKeyHash } =
      this.userRepository.generateApiKey();

    const user = await this.userRepository.create({
      email: dto.email,
      name: dto.name,
      api_key_hash: apiKeyHash,
      role: "user",
    });

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

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.active) {
      throw new UnauthorizedException("Account is deactivated");
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
