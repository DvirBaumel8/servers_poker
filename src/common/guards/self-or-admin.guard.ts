import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

export const SELF_OR_ADMIN_KEY = "selfOrAdmin";

/**
 * Decorator to mark routes that should allow access only to the resource owner or admin.
 * Use with @Param('id') where the param name matches the user ID being accessed.
 *
 * @example
 * @Get(':id')
 * @RequireSelfOrAdmin('id')
 * getUser(@Param('id') id: string) { ... }
 */
export function RequireSelfOrAdmin(paramName: string = "id") {
  return (
    target: object,
    _key: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    Reflect.defineMetadata(SELF_OR_ADMIN_KEY, paramName, descriptor.value);
    return descriptor;
  };
}

/**
 * Guard that ensures the current user is either:
 * 1. Accessing their own resource (user.id === param.id)
 * 2. An admin user
 *
 * Use with @RequireSelfOrAdmin() decorator.
 */
@Injectable()
export class SelfOrAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const paramName = this.reflector.get<string>(
      SELF_OR_ADMIN_KEY,
      context.getHandler(),
    );

    if (!paramName) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const targetId = request.params[paramName];

    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    if (!targetId) {
      return true;
    }

    const isOwner = user.id === targetId;
    const isAdmin = user.role === "admin";

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException("Access denied");
    }

    return true;
  }
}
