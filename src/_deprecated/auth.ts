/**
 * auth.ts — Authentication & Authorization middleware
 *
 * All protected routes require:
 *   Authorization: Bearer <api_key>
 *
 * Middleware functions return the authenticated user or throw with
 * a structured error that the router catches and serializes.
 */

import * as db from "./db";
import { Request } from "express";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Extract and validate the API key from the Authorization header.
 * Returns the user row, or throws AuthError.
 */
export function requireAuth(req: Request): any {
  const header = req.headers["authorization"] || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AuthError("Missing Authorization: Bearer <api_key> header");
  }

  const api_key = match[1].trim();
  const user = db.getUserByApiKey(api_key);
  if (!user) {
    throw new AuthError("Invalid API key");
  }

  return user;
}

/**
 * Verify that a bot belongs to the authenticated user.
 * Returns the bot row, or throws AuthError.
 */
export function requireBotOwnership(user: any, bot_id: string): any {
  const bot = db.getBotById(bot_id);
  if (!bot) {
    throw new AuthError("Bot not found", 404);
  }
  if (bot.user_id !== user.id) {
    throw new AuthError("You do not own this bot", 403);
  }
  return bot;
}
