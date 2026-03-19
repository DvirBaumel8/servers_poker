# Deprecated Files

These files are from the **old custom HTTP server implementation** that ran parallel to the NestJS implementation.

**DO NOT USE THESE FILES IN PRODUCTION.**

The system has been fully migrated to NestJS (see `src/main.ts` and `src/modules/`).

## Why are these kept?

1. **Reference**: Some game logic patterns may be useful for debugging
2. **Rollback safety**: In case of critical bugs, we have the old code available
3. **Historical context**: Understanding the evolution of the codebase

## Files

| File | Description | NestJS Replacement |
|------|-------------|-------------------|
| `server.ts` | Old HTTP server with manual routing | `src/main.ts` + NestJS modules |
| `game.ts` | PokerGame class | `src/services/live-game-manager.service.ts` |
| `ws.ts` | WebSocket server | `src/modules/games/games.gateway.ts` |
| `db.ts` | SQLite database layer | TypeORM entities + repositories |
| `auth.ts` | API key authentication | `src/modules/auth/` |
| `tournament.ts` | TournamentDirector | `src/modules/tournaments/tournament-director.service.ts` |
| `rateLimit.ts` | Rate limiting | NestJS Throttler module |
| `routes/` | Route handlers | NestJS controllers |

## Removal Timeline

These files can be safely deleted after:
1. All E2E tests pass with NestJS
2. Production deployment is stable for 2 weeks
3. No referenced imports remain in active code

---

*Deprecated on: 2024-03-19*
*Migration: Dual Architecture Problem resolution*
