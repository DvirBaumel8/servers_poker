import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  SCOPES_KEY,
  ApiScope,
  getUserScopes,
} from "../decorators/scopes.decorator";

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<ApiScope[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    const userScopes = getUserScopes(user.role);
    const hasAllScopes = requiredScopes.every((scope) =>
      userScopes.includes(scope),
    );

    if (!hasAllScopes) {
      const missingScopes = requiredScopes.filter(
        (scope) => !userScopes.includes(scope),
      );
      throw new ForbiddenException(
        `Missing required scopes: ${missingScopes.join(", ")}`,
      );
    }

    return true;
  }
}
