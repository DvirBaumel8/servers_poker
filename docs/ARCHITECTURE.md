# Poker Engine — Architecture

## Overview

A No-Limit Texas Hold'em tournament platform where developers build bot servers that compete against each other. The game server orchestrates everything — bots are HTTP servers that receive game state and return an action.

```
┌───────────────────────────────────────────────────────┐
│                    Game Server                        │
│  POST /users/register      — create account           │
│  POST /bots                — register a bot           │
│  GET  /tournaments         — list tournaments         │
│  POST /tournaments/:id/register — enter tournament    │
│  WS   /ws?table=<id>       — real-time push           │
└──────────────┬─────────────────────────┬──────────────┘
               │  POST /action            │  POST /action
               ▼                         ▼
       ┌───────────────┐         ┌───────────────┐
       │  Bot Server A │         │  Bot Server B │
       │ (player code) │         │ (player code) │
       └───────────────┘         └───────────────┘
```

---

## File Structure

```
poker-engine/
├── server.js                    — HTTP server, routing, WebSocket, bot caller
├── tournaments.config.js        — Tournament definitions + blind structure
├── ARCHITECTURE.md              — This file: system structure and components
├── KNOWLEDGE.md                 — Design decisions and conventions
├── DATA.md                      — Data architecture: schema, recording, analytics
├── TOURNAMENT_RULES.md          — Operator-facing tournament rules reference
├── SECURITY.md                  — Security architecture and vulnerability tracker
├── BOT_DEVELOPER_GUIDE.md       — Complete guide for bot developers
├── bots/
│   ├── node/bot.js              — Node.js boilerplate
│   ├── python/bot.py            — Python boilerplate
│   └── java/Bot.java            — Java boilerplate
└── src/
    ├── deck.js                  — Card representation, deck creation, shuffle
    ├── handEvaluator.js         — Best hand from 7 cards, winner determination
    ├── betting.js               — BettingRound, PotManager (side pots)
    ├── game.js                  — PokerGame class, full hand lifecycle
    ├── tournament.js            — TournamentDirector class
    ├── recorder.js              — GameRecorder: persists all game events to DB
    ├── db.js                    — SQLite schema, migrations, all query functions
    ├── auth.js                  — requireAuth(), requireBotOwnership(), AuthError
    ├── rateLimit.js             — Sliding window rate limiter
    ├── botValidator.js          — 10-scenario validation test suite
    ├── ws.js                    — Zero-dependency WebSocket server (RFC 6455)
    └── routes/
        ├── users.js             — /users/* handlers
        ├── bots.js              — /bots/* handlers
        └── tournaments.js       — /tournaments/* handlers
```

---

## Core Components

### server.js
Entry point. Owns the HTTP server, WebSocket server, bot caller, in-memory registries (`liveGames`, `liveDirectors`, `gameStates`, `tournamentStates`), and route dispatch. Provisions tournaments from config on startup (idempotent — `INSERT OR IGNORE`).

### src/game.js — `PokerGame`
The poker engine. DB-free and tournament-agnostic.
- Auto-starts at 2+ players, runs until one player holds all chips
- Each hand: antes → blinds → pre-flop → flop → turn → river → showdown
- 3-strike bot fault tolerance with configurable timeout
- Callbacks: `onStateUpdate`, `onHandComplete`, `onPlayerJoined`, `onPlayerRemoved`

### src/tournament.js — `TournamentDirector`
Sits above `PokerGame`. Full tournament lifecycle:
- Creates/destroys `PokerGame` instances as tables form and break
- Blind level advancement every N hands (global count across all tables)
- Table balancing (gap >2 players between tables) and breaking (≤4 players)
- Final table consolidation when ≤9 players remain
- Payout calculation and distribution
- Late registration and rebuy handling
- Records seat history on every table move

### src/recorder.js — `GameRecorder`
Attaches to `PokerGame` via monkey-patching. Records everything to DB without the engine knowing. See `DATA.md` for full detail on what is captured.

### src/betting.js — `BettingRound` + `PotManager`
`BettingRound`: manages a single street — validates actions, tracks who acted, enforces min-raise. Raise amounts = **additional chips on top of the call**.

`PotManager`: accumulates bets, computes side pots for all-in situations. Each pot has `eligiblePlayerIds`. Showdown awards each pot independently.

### src/db.js
SQLite via Node's built-in `node:sqlite` (Node 22+). All queries are prepared statements. Full schema and design in `DATA.md`.

### src/ws.js
Hand-rolled RFC 6455 WebSocket server — zero npm dependencies. Upgrade handshake, frame parsing/building, ping/pong, per-table subscription management.

### src/rateLimit.js
In-memory sliding window rate limiter. Limiters: register (5/hr/IP), login (10/15min/IP), createBot (20/day/user), joinTournament (10/min/user), global (300/min/IP).

### src/botValidator.js
10 poker scenarios run against a bot endpoint: health check, pre-flop/flop/river decisions, short stack, multi-way pot, heads-up, response time. Auto-runs on bot registration; available on-demand via `POST /bots/:id/validate`.

---

## Tournament Lifecycle

```
Server startup
  └─→ tournaments.config.js provisioned (INSERT OR IGNORE)

Bot developer:
  POST /users/register  →  api_key
  POST /bots            →  bot_id  (auto-validation runs in background)
  POST /tournaments/:id/register  →  entry confirmed

TournamentDirector.start() [triggered at min_players for rolling]
  └─→ random seat assignment
  └─→ blind level 1 (25/50 + 10 ante)
  └─→ GameRecorder attached to each table's PokerGame

  Every hand (all tables):
    antes posted → SB/BB posted → deal → bet → showdown
    recorder captures everything → bot_stats updated

  Every 10 global hands:
    blind level advances → all PokerGame instances updated

  When table ≤ 4 players + absorb room:
    table breaks → players redistributed → seat_history updated

  When activeBots.size ≤ 9 and tables.size > 1:
    final table (table_number=99) → status='final_table'

  When activeBots.size === 1:
    payouts calculated → total_net updated in bot_stats
    status='finished'
```

---

## Bot Protocol

### Request (server → bot)
```json
{
  "gameId": "tourn_micro",
  "handNumber": 42,
  "stage": "flop",
  "you": {
    "name": "Bot Alpha", "chips": 4200,
    "holeCards": ["A♠","K♥"], "bet": 100, "position": "CO",
    "bestHand": { "name": "ONE_PAIR", "cards": ["A♠","K♥","A♦","Q♣","J♠"] }
  },
  "action": { "canCheck": false, "toCall": 200, "minRaise": 400, "maxRaise": 4000 },
  "table": {
    "pot": 850, "currentBet": 300,
    "communityCards": ["A♦","Q♣","J♠"],
    "smallBlind": 75, "bigBlind": 150, "ante": 25
  },
  "players": [...]
}
```

`you.bestHand` only present flop onwards. Opponent hole cards never sent.

### Response
```json
{ "type": "fold" }   { "type": "check" }
{ "type": "call" }   { "type": "raise", "amount": 300 }
```

`raise.amount` = additional chips on top of the call.

### Fault handling
| Situation | Behaviour |
|-----------|-----------|
| Timeout / error / invalid | Strike + penalty fold (is_penalty=1 in DB) |
| 3rd consecutive strike | Disconnect — sits out all future hands |
| Any successful response | Strikes reset to 0 |

---

## API Reference

### Public
```
POST /users/register
GET  /bots  |  GET /bots/:id  |  GET /bots/:id/validate
GET  /tournaments  |  GET /tournaments/:id  |  GET /tournaments/:id/results
GET  /leaderboard
GET  /health
WS   /ws?table=<tournamentId>
```

### Auth required (Bearer <api_key>)
```
GET    /users/me
POST   /bots  |  PATCH /bots/:id  |  DELETE /bots/:id
POST   /bots/:id/validate
POST   /tournaments/:id/register
GET    /tournaments/:id/history
```

---

## Position System

| Players | Positions (BTN first) |
|---------|-----------------------|
| 2 | BTN/SB, BB |
| 3 | BTN, SB, BB |
| 4–9 | BTN, SB, BB, UTG [, UTG+1, MP, MP+1, HJ, CO] |

---

## Real-Time Push

```
PokerGame.onStateUpdate   →  wss.broadcast(tableId,      { type:'state', state })
TournamentDirector.onStateUpdate  →  wss.broadcast(tournamentId, { type:'tournament_state', state })

Client: ws://host/ws?table=<id>
        or: { type:'subscribe', tableId:'<id>' }   (mid-session change)
Fallback: UI polls GET /tournaments/:id every 1000ms if WS unavailable
```

---

## Security Status

| Control | Status |
|---------|--------|
| API key hashing (SHA-256) | ✅ |
| Cryptographic key generation (32 bytes) | ✅ |
| Rate limiting (sliding window) | ✅ |
| Body size limit (64 KB) | ✅ |
| Atomic join (EXCLUSIVE transaction) | ✅ |
| TLS | ⚠️ Operator (nginx/Caddy) |
| WebSocket auth | 🔲 Planned |
| HMAC bot payload signing | 🔲 Planned |
| SSRF protection | 🔲 Planned |
| Key rotation | 🔲 Planned |

Full details: `SECURITY.md`

---

## Testing Infrastructure

```
test.js          — 16 unit tests: hand evaluator, game engine, chip conservation
scenarios.js     — 24 integration tests: registration rules, late entry, rebuys,
                   freezeouts, full tournament runs, payout correctness, data integrity
bugs.js          — 30 targeted tests: side pot logic, simultaneous busts, state
                   transitions, game invariants, query correctness, edge cases
simulate.js      — End-to-end tournament simulation runner (in-process, no HTTP)
src/simBots.js   — 7 bot personalities: caller, folder, maniac, random, smart, allin, crasher
src/logger.js    — Structured JSON logger: console + file (logs/errors.log)
```

### Running tests
```bash
node test.js                                          # unit tests
node --experimental-sqlite scenarios.js               # integration tests
node --experimental-sqlite bugs.js                    # edge case tests
node --experimental-sqlite simulate.js --bots=9 --fast --quiet   # 9-bot sim
node --experimental-sqlite simulate.js --bots=18 --fast          # 18-bot multi-table
node --experimental-sqlite simulate.js --bots=45 --tournament=tourn_standard --fast
```

### Simulation options
```
--bots=N          Number of bots (default: 9)
--tournament=ID   Tournament ID from config (default: tourn_micro)
--mix=a,b,c       Bot personality mix (default: smart,caller,maniac,random,folder,allin)
--fast            Skip 1500ms inter-hand sleep
--quiet           Suppress hand-by-hand output
```

### API additions since initial build
```
GET /tournaments/:id/history   — paginated hand history across all tables [auth]
GET /bots/:id/validate         — fetch last validation result [public]
POST /bots/:id/validate        — run validation suite on demand [auth]
GET /bots/:id/validate         — get last validation result [public]
```
