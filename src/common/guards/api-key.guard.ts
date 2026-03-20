import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { UserRepository } from "../../repositories/user.repository";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly userRepository: UserRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException("Missing Authorization header");
    }

    const [type, token] = authHeader.split(" ");
    if (type !== "Bearer" || !token) {
      throw new UnauthorizedException(
        "Invalid Authorization header format. Use: Bearer <api_key>",
      );
    }

    const user = await this.userRepository.findByApiKey(token);
    if (!user) {
      throw new UnauthorizedException("Invalid API key");
    }

    if (!user.active) {
      throw new UnauthorizedException("User account is deactivated");
    }

    request.user = user;
    return true;
  }
}
