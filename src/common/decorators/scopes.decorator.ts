import { SetMetadata } from "@nestjs/common";

/**
 * API Permission Scopes
 *
 * Spectator scopes: read-only access to public game/tournament data
 * Operator scopes: ability to manage bots, join games, register for tournaments
 * Admin scopes: full platform administration
 */
export type ApiScope =
  | "spectate:tables" // View table list and basic info
  | "spectate:games" // Watch live game state
  | "spectate:tournaments" // View tournament list and basic info
  | "spectate:leaderboard" // View global leaderboard
  | "operate:bots" // Create, update, manage own bots
  | "operate:games" // Join games with own bots
  | "operate:tournaments" // Register/unregister bots for tournaments
  | "history:own" // View hand history for own bots only
  | "admin:read" // Read all platform data
  | "admin:write"; // Write/modify any platform data

export const SCOPES_KEY = "api_scopes";

/**
 * Decorator to require specific API scopes for an endpoint.
 * User must have ALL specified scopes to access the endpoint.
 */
export const RequireScopes = (...scopes: ApiScope[]) =>
  SetMetadata(SCOPES_KEY, scopes);

/**
 * Maps user roles to their default scopes.
 * Users automatically get these scopes based on their role.
 */
export const ROLE_SCOPES: Record<string, ApiScope[]> = {
  user: [
    "spectate:tables",
    "spectate:games",
    "spectate:tournaments",
    "spectate:leaderboard",
    "operate:bots",
    "operate:games",
    "operate:tournaments",
    "history:own",
  ],
  admin: [
    "spectate:tables",
    "spectate:games",
    "spectate:tournaments",
    "spectate:leaderboard",
    "operate:bots",
    "operate:games",
    "operate:tournaments",
    "history:own",
    "admin:read",
    "admin:write",
  ],
};

/**
 * Get all scopes for a user based on their role.
 */
export function getUserScopes(role: string): ApiScope[] {
  return ROLE_SCOPES[role] || ROLE_SCOPES["user"];
}
