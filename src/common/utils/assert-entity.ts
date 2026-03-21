import { NotFoundException, ForbiddenException } from "@nestjs/common";

/**
 * Asserts that an entity exists, throwing NotFoundException if null.
 * Use this to reduce boilerplate null checks across services.
 *
 * @example
 * const bot = await this.botRepository.findById(id);
 * assertFound(bot, "Bot", id);
 * // bot is now typed as non-null
 */
export function assertFound<T>(
  entity: T | null | undefined,
  entityName: string,
  id: string,
): asserts entity is T {
  if (!entity) {
    throw new NotFoundException(`${entityName} ${id} not found`);
  }
}

/**
 * Asserts that the user has access to a resource (owner or admin).
 * Throws ForbiddenException if access is denied.
 *
 * @example
 * assertOwnershipOrAdmin(bot.user_id, userId, isAdmin);
 */
export function assertOwnershipOrAdmin(
  ownerId: string,
  userId: string,
  isAdmin: boolean = false,
  message: string = "Access denied",
): void {
  if (ownerId !== userId && !isAdmin) {
    throw new ForbiddenException(message);
  }
}

/**
 * Asserts that the user is accessing their own resource or is an admin.
 * For use in user profile endpoints.
 *
 * @example
 * assertSelfOrAdmin(targetUserId, currentUser.id, currentUser.role === 'admin');
 */
export function assertSelfOrAdmin(
  targetId: string,
  currentUserId: string,
  isAdmin: boolean = false,
): void {
  if (targetId !== currentUserId && !isAdmin) {
    throw new ForbiddenException("Access denied");
  }
}
