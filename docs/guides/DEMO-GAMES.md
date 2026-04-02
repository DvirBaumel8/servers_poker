# Demo Games Guide

## Fastest Way to See the Game

```bash
npm run game:watch
```

This single command:
1. ✅ Starts backend (port 3000)
2. ✅ Starts frontend (port 5173)
3. ✅ Creates a live game with 5 bots
4. ✅ Opens browser to `http://localhost:5173/games/{gameId}`

Watch bots play in real-time! No setup needed.

---

## Manual Setup (for Development)

### Step 1: Start Services

```bash
# Terminal 1: PostgreSQL
docker compose up -d postgres

# Terminal 2: Backend
npm run dev

# Terminal 3: Frontend
cd frontend && npm run dev
```

### Step 2: Create a Game

Via the UI:
- Go to `http://localhost:5173/bots/build` to create a bot
- Register if needed (email auto-verifies in dev)
- Choose personality preset or customize sliders
- Save your bot, then create a live game via API (see below)

Or via API:
```bash
curl -X POST http://localhost:3000/api/v1/testing/live-game
```

Returns `{ gameId, gameUrl }` — navigate to the URL.

### Step 3: Watch Live

The game state updates via WebSocket in real-time:
- Player actions (bet, fold, call, check, raise)
- Community cards dealt progressively
- Pot and chip updates
- Hand results

---

## How It Works

**Live Game Flow:**
1. Test user is created via `AuthService.register()`
2. 5 bots created in database (Alice, Bob, Charlie, Diana, Eve)
3. All bots use the "quick" strategy tier
4. GameInstance starts with `LiveGameManagerService`
5. WebSocket broadcasts game state to `/game` namespace
6. Frontend renders live UI with real poker table

**Architecture:**
- All strategy evaluation is **in-process** (no external servers)
- Each bot uses a personality preset (shark, rock, maniac, etc.)
- Chip conservation is validated after every action (see `src/testing/validators.ts`)
- One bot per user per table (fair play enforcement)

---

## Monitor Game State

```bash
# Via API
curl http://localhost:3000/api/v1/games/<gameId>/state | jq

# Quick status
curl -s http://localhost:3000/api/v1/games/<gameId>/state | jq '{hand: .handNumber, stage: .stage, pot: .potManager.totalChips}'

# WebSocket events
# Emitted to table:{gameId} room:
# - gameState (full state snapshot)
# - playerAction (action taken)
# - handStarted (new hand)
# - handResult (pot awarded)
```

---

## Test the Game Logic

Run 50 automated poker games and validate game invariants:

```bash
npm run test:poker -- --games=50 --bots=8

# Output:
# ✅ All games pass validation
# 📋 POKER_BUGS.md auto-generated with any issues found
# 📊 test-coverage.json with scenario metrics
```

See [TESTING.md](../TESTING.md) for details on validators and coverage.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `npm run game:watch` fails | Ensure backend/frontend ports (3000, 5173) are free |
| WebSocket connection fails | Check CORS in `.env`: `CORS_ORIGINS` must include frontend URL |
| Game freezes mid-hand | Check backend logs; may indicate game logic bug |
| Bots stuck in "waiting" | One bot per user per table rule — create new users |

---

## References

- [Testing & Invariants](../TESTING.md) — Validator suite, coverage metrics
- [Security](../SECURITY.md) — Game integrity controls
- [Architecture](../ARCHITECTURE.md) — System design details
