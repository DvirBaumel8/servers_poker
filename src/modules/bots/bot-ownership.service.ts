import { Injectable, ForbiddenException } from "@nestjs/common";
import { BotRepository } from "../../repositories/bot.repository";
import { Bot } from "../../entities/bot.entity";

/**
 * Service for centralizing bot ownership validation.
 * Use this to reduce duplication of ownership checks across controllers and services.
 */
@Injectable()
export class BotOwnershipService {
  constructor(private readonly botRepository: BotRepository) {}

  /**
   * Get a bot by ID and verify ownership.
   * Throws NotFoundException if bot doesn't exist.
   * Throws ForbiddenException if user doesn't own the bot (unless admin).
   *
   * @example
   * const bot = await this.botOwnership.getBotWithOwnershipCheck(botId, userId, isAdmin);
   */
  async getBotWithOwnershipCheck(
    botId: string,
    userId: string,
    isAdmin: boolean = false,
    errorMessage: string = "You do not own this bot",
  ): Promise<Bot> {
    const bot = await this.botRepository.findByIdOrThrow(botId);

    if (bot.user_id !== userId && !isAdmin) {
      throw new ForbiddenException(errorMessage);
    }

    return bot;
  }

  /**
   * Verify ownership of a bot without fetching it again.
   * Use when you already have the bot entity.
   */
  assertOwnership(
    bot: Bot,
    userId: string,
    isAdmin: boolean = false,
    errorMessage: string = "You do not own this bot",
  ): void {
    if (bot.user_id !== userId && !isAdmin) {
      throw new ForbiddenException(errorMessage);
    }
  }

  /**
   * Check if user owns the bot (or is admin).
   * Returns boolean instead of throwing.
   */
  isOwnerOrAdmin(bot: Bot, userId: string, isAdmin: boolean = false): boolean {
    return bot.user_id === userId || isAdmin;
  }
}
