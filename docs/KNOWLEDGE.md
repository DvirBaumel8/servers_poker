# Poker Engine — Knowledge Base

A running record of non-obvious design decisions, conventions, and gotchas.
Update this whenever a decision is made, reversed, or a new gotcha is discovered.

For data-specific decisions, see DATA_DICTIONARY.md.
For tournament rules, see GAME_RULES.md.
For security details, see SECURITY.md.

---

## Architecture Decisions

### NestJS Framework Migration (COMPLETE)
Fully migrated from custom HTTP server to NestJS. Old server code has been removed.

**Status**: Production-ready. All game logic runs through NestJS.

**Key Components**:
- `LiveGameManagerService` — In-memory game state, replaces `liveGames` object
- `TournamentDirectorService` — Tournament orchestration with scheduled starts
- `GamesGateway` — WebSocket for real-time updates, event-driven via EventEmitter2
- `GamesController` — REST endpoints for tables, joining, game state

**Migration Benefits**:
- Single entry point (`src/main.ts`)
- Dependency injection for clean service composition
- Guards for JWT, API Key, and Role-based auth
- Interceptors for logging, audit, timeout handling
- Exception filters for standardized error responses
- WebSocket Gateway with Socket.IO for real-time game updates

### PostgreSQL Database Migration
Migrated from SQLite to PostgreSQL for production-grade data handling:
- `BIGINT` for all chip amounts (prevent overflow)
- `SERIALIZABLE` transactions for chip movements
- `JSONB` columns for flexible data storage (cards, hand details)
- `CHECK` constraints for chip amount validation (`chips >= 0`)
- Proper connection pooling via pg pool

### TypeORM Entity Layer
All database tables are TypeORM entities with:
- UUID primary keys (36-char strings)
- Proper foreign key relationships with CASCADE delete
- Indexed columns for common queries
- `created_at` and `updated_at` timestamps

### `PokerGame` is DB-free and tournament-agnostic
No imports from database or tournament modules in the game engine. This keeps it testable in isolation. The `GameRecorder` attaches via callbacks to persist data.

### WebSocket Gateway replaces custom ws.js
The NestJS WebSocket Gateway using Socket.IO replaces the custom RFC 6455 implementation. Benefits:
- Room-based subscriptions per table
- Authenticated connections via JWT
- Type-safe event handling
- Built-in reconnection handling

### Frontend Integration
React SPA in `/frontend` connects to NestJS backend:

**API Connection:**
- Vite dev server proxies `/api/*` to `localhost:3000`
- Base path: `/api/v1` (set in backend via `app.setGlobalPrefix`)
- Auth via JWT Bearer tokens stored in localStorage (Zustand persist)

**WebSocket Connection:**
- Connects to `/game` namespace via Socket.IO
- Events: `gameState`, `handStarted`, `handResult`, `gameFinished`, `playerLeft`, `playerAction`
- Frontend hook: `useWebSocket(tableId, { token })` handles connection lifecycle

**Development:**
- `npm run dev:all` — Runs both backend (3000) and frontend (3001) concurrently
- `npm run build:all` — Builds both for production

**Production:**
- Frontend served as static files (nginx or backend serving `/frontend/dist`)
- Or deployed separately (Vercel, Netlify) with API URL in env var

### Chip Conservation Invariants
Runtime assertions that run in production:
- `ChipInvariantChecker` validates total chips after every action
- `TransactionAuditLog` records all chip movements
- Violations throw `ChipConservationError` and halt the game

### Game State Persistence & Recovery
Server restarts no longer lose active games:

**Persistence (`GameStatePersistenceService`):**
- Game state saved to `game_state_snapshots` table every 5 seconds
- Configurable via `GAME_STATE_PERSIST_INTERVAL_MS`
- Stores: players, chips, hole cards, community cards, pot, stage, action log
- Each server instance gets unique ID for multi-server tracking

**Recovery (`GameRecoveryService`):**
- On startup, checks for recoverable games (< 30 min old by default)
- Validates: bots still active, enough players, state not stale
- Automatically recreates `GameInstance` from snapshot
- Notifies bots of recovery via optional `/recovery` endpoint
- Configuration: `GAME_AUTO_RECOVER=true`, `GAME_STATE_RECOVERY_WINDOW_MINUTES=30`

**Snapshot Lifecycle:**
- `active` → game in progress
- `recovered` → game restored on new server instance
- `completed` → game finished normally
- `orphaned` → recovery failed, game abandoned
- Old snapshots cleaned up after 7 days

### Database Migrations
TypeORM migrations manage schema changes:
- `npm run migration:run` — Execute pending migrations
- `npm run migration:generate` — Auto-generate from entity changes
- `npm run migration:revert` — Rollback last migration
- **Never use `synchronize: true` in production**

---

## Bot Protocol Decisions

### Raise amount = additional chips, not total bet
`{ type:"raise", amount:100 }` means raise 100 on top of the call. Bot puts in `toCall + 100` total. `maxRaise` = `player.chips - toCall` (max additional raise before all-in).

**Why:** More intuitive. Bot developers think "I want to raise by X", not "my total bet should be Y".

### `you.bestHand` only on flop onwards
Absent pre-flop (no community cards to evaluate). Present on flop, turn, river. Contains `{ name, cards }` — the hand name and 5 specific cards making it.

### Opponent hole cards never sent
`players[]` never includes opponent cards. Only revealed at showdown via `handResult` WebSocket event.

### Action validation is strict
Invalid actions result in automatic fold with a strike. Bots sending actions out of turn are rejected immediately.

### Response format
```json
{ "type": "fold" }
{ "type": "check" }
{ "type": "call" }
{ "type": "raise", "amount": 300 }
{ "type": "all_in" }
```

---

## Bot Connectivity & Resilience

### Timeout Mechanism
Every bot call has a configurable timeout (`BOT_TIMEOUT_MS`, default 10s):
- Game engine uses `Promise.race` to enforce timeout
- On timeout: automatic fold + strike
- 3 consecutive timeouts = disconnection

### Retry Logic (BotCallerService)
Transient failures are retried automatically:
- `BOT_MAX_RETRIES=1` (default) — one retry attempt
- Retryable errors: `ECONNRESET`, `ETIMEDOUT`, `socket hang up`, HTTP 502/503/504
- Non-retryable errors: invalid JSON, response too large, circuit breaker open
- Exponential backoff: `BOT_RETRY_DELAY_MS * attempt`

### Circuit Breaker Pattern
Prevents cascading failures when a bot is unhealthy:
- Opens after `BOT_CIRCUIT_BREAKER_THRESHOLD` consecutive failures (default 5)
- Half-opens after `BOT_CIRCUIT_BREAKER_RESET_MS` (default 30s) for retry
- Successful call resets the breaker
- Events emitted: `bot.circuitOpened`, `bot.callFailed`

### Health Check
Bots should expose `GET /health` returning HTTP 200:
- Called before game registration validation
- Pre-game health check runs on all bots before starting
- Unhealthy bots can be excluded from game start

### HTTP Keep-Alive (BotCallerService)
Connection pooling for reduced overhead:
- `http.Agent` and `https.Agent` with `keepAlive: true`
- `maxSockets: 100`, `maxFreeSockets: 20`
- Eliminates TCP handshake overhead for repeated calls to same bot
- Agents shared across all bot calls

### Periodic Health Checks (BotHealthSchedulerService)
Background monitoring of all registered bots:
- `BOT_HEALTH_CHECK_INTERVAL_MS=30000` for idle bots
- `BOT_ACTIVE_GAME_CHECK_INTERVAL_MS=10000` for in-game bots
- Events emitted: `bot.healthStateChanged`, `bot.healthCheckRoundCompleted`
- Pre-game registration via `registerBot(botId, endpoint)`

### Graceful Degradation (BotResilienceService)
Fallback strategies when bots fail:
- **conservative:** Check if possible, call small bets (<25% pot), else fold
- **aggressive:** May raise when can check, call medium bets (<50% pot)
- **random:** Random valid action (for testing)
- **check_fold:** Always check or fold (safest)

Configurable via `BOT_FALLBACK_STRATEGY` env var.

### Bot Metrics Gateway
Real-time WebSocket monitoring at `/metrics`:
- `getSnapshot` — current health/latency of all bots
- `getHealthHistory` — last health check round results
- `triggerHealthCheck` — manual health check
- Events: `snapshot`, `botStateChanged`, `circuitBreaker`, `activeGameAlert`

### Latency Tracking
Rolling window of last 100 response times per bot:
- Average latency available via `getAverageLatency(botId)`
- High latency bots (>3s average) flagged in validation reports
- Helps identify bots at risk of timeout

### Response Validation
Bot responses are validated before processing:
- Must be JSON object
- Must have `type` field (`fold`, `check`, `call`, `raise`, `bet`, `all_in`)
- `raise`/`bet` must include numeric positive `amount`
- Amount must be within `minRaise` and `maxRaise` bounds
- Invalid responses trigger automatic fold + strike

### Bot Validation Suite (BotValidatorService)
Comprehensive pre-registration validation with 13 scenarios:
- **Connectivity:** Health check endpoint
- **Basic:** Pre-flop, flop, river actions
- **Edge cases:** Short stack, all-in facing, heads-up, multi-way
- **Stress:** Response time, large numbers

Validation produces a weighted score (0-100):
- Connectivity: 30%
- Basic scenarios: 40%
- Edge cases: 20%
- Stress tests: 10%

---

## Game Engine Decisions

### Antes posted before blinds
All active players post ante first, then SB and BB. Matches standard tournament ante structure.

### 3-strike disconnection, not immediate
A bot failure (timeout, error, bad JSON) gets a strike and a penalty fold. After 3 **consecutive** failures it's disconnected. Strikes reset on any successful response.

### Penalty fold is recorded differently from intentional fold
`actions.is_penalty = true` when the server folded on the bot's behalf. Critical for detecting unstable bots vs conservative strategy.

### Auto-start deferred with `setImmediate`
`addPlayer()` triggers `startGame()` via `setImmediate` not synchronously. Allows tests to call `game.stop()` in the same tick before the loop starts.

### 1500ms sleep between hands
After each hand, the loop sleeps 1500ms. Gives the UI time to render the final state and prevents hands blurring in the log.

---

## Edge Case Handling

### Cash Game: Last player standing
When only 2 players remain and one leaves:
- Game immediately stops
- Remaining player's chips are preserved
- Game status set to "finished"
- WebSocket broadcasts final state

### Player leaves during hand
When a player leaves mid-hand:
- Automatic fold applied
- Strike counter incremented
- If 3 strikes: disconnected status set
- If last 2 players and one disconnects: immediate hand completion

### Tournament: Single table with 2 players, one leaves
- Remaining player declared winner
- Tournament status set to "finished"
- Payouts calculated and distributed
- All entries updated with finish positions

### Tournament: Multi-table, one table down to 1 player
- Player moved to another table with available seats
- Table broken (status set to "broken")
- Seat history recorded
- If no other tables have room: final table formation triggered

### Out-of-turn action requests
When a bot sends an action but it's not their turn:
- Request rejected with error response
- No strike applied (could be race condition)
- Current player's turn continues normally
- WebSocket state shows correct `currentPlayerId`

### Simultaneous disconnections
When multiple bots disconnect at once:
- Each processed sequentially via `_handLock`
- Bust order determined by chip count at disconnection
- Tournament continues with remaining players

---

## Tournament Decisions

### Global hand count for blind advancement
Blind levels advance every 10 hands counted across ALL active tables simultaneously.

### Table breaking threshold is 4 players
When a table falls to ≤4 players AND another can absorb them without exceeding 9, it breaks.

### Final table = table_number 99
Convention for easy querying. When `activeBots.size ≤ 9` and `tables.size > 1`, all tables break and table 99 is created.

### Late entries receive full starting stack
Even at level 4, late entrants get full `starting_chips`. They're severely disadvantaged but that's intentional.

### `_handLock` prevents race conditions
Multiple tables complete hands near-simultaneously. `_handLock` prevents concurrent `_onHandComplete` calls from racing on bust detection and rebalancing.

---

## Security Decisions

### JWT Authentication
- Access tokens with configurable expiration (default 24h)
- Token validation on every authenticated request
- User context injected into request via decorator

### API Key Authentication
- Keys stored as SHA-256 hashes
- Raw key returned once at registration, never stored
- Used for bot-to-server communication

### Rate Limiting
- Global rate limiting via @nestjs/throttler
- Configurable limits per endpoint
- Default: 100 requests per minute per IP

### Input Validation
- Strict DTO validation with class-validator
- Bot endpoints validated (no internal IPs)
- Body size limit enforced
- SQL injection prevention via TypeORM parameters

### Audit Logging
- All requests logged with user, IP, action
- Sensitive fields redacted (passwords, API keys)
- Chip movements tracked separately

---

## Simulation System

### Deterministic mode
Seeded RNG allows reproducible simulations for debugging.

### Bot personalities
- `caller` - Calls most bets (VPIP 60%)
- `folder` - Folds frequently (VPIP 15%)
- `maniac` - Raises aggressively (VPIP 90%)
- `random` - Random valid actions
- `smart` - Position-aware decisions
- `crasher` - Tests error handling (high error rate)
- `slow` - Tests timeout handling

### Anomaly detection
Simulation tracks and reports:
- Chip conservation violations (CRITICAL)
- Bot timeouts and errors
- Invalid actions
- Statistical anomalies in hand distribution

---

## Conventions

### Card format
Internal: `{ value, suit }` where value is 2–14 (Ace=14).
Display: `"A♠"`, `"10♦"`, `"K♥"`. Hidden: `"??"`.

### Dealer rotation
`dealerIndex` advances by 1 each hand (`% players.length`). Broke/disconnected players skipped.

### Side pots
`PotManager.calculatePots()` runs at end of each betting street. Each pot has `eligiblePlayerIds`. Showdown awards each pot independently.

### Split Pot Odd Chip Distribution
`PotManager.distributePot(potAmount, winners, playerOrder, dealerIndex)` handles split pots with proper odd chip distribution:
- Odd chips go to players closest to the dealer button (dealer + 1 first)
- Example: $101 split 2 ways = $51 + $50, not $50.50 each
- Works for 2-way, 3-way, 4-way+ splits

### Short All-In Does Not Reopen Betting
When a player goes all-in for less than the minimum raise:
- `BettingRound.wasLastRaiseFull()` returns `false`
- `BettingRound.canReraise(playerId)` returns `false` for players who already acted
- `BettingRound.getValidActionsForPlayer(player)` excludes "raise" option
- Only call/fold allowed after short all-in

### Hand Cancellation/Rollback
`PokerGameService.rollbackHand()` restores game to start-of-hand state:
- Player chips restored from snapshot taken at `startHand()`
- Pot reset to zero, folded/allIn status cleared
- Emits `game.handCancelled` event
- Use case: server error, all players disconnect mid-hand

### Dead Button Rule
Button movement skips eliminated players:
- `advanceDealer()` skips disconnected players with 0 chips
- `getBlindPositions()` returns proper SB/BB positions relative to active players
- Heads-up: dealer is also small blind (`dealerSmallBlind` property)
- Ensures BB always advances (dead button rule, not moving button)

### All timestamps are ISO 8601
Stored as `TIMESTAMP WITH TIME ZONE` in PostgreSQL. Converted to ISO strings for API responses.

---

## Developer Experience

### Philosophy: 5 Minutes to First Bot
The complexity of getting started directly impacts adoption. Goal: anyone can build and deploy a working bot in under 5 minutes.

### Documentation for AI Assistants
`docs/AI_CONTEXT.md` is specifically designed to be pasted into ChatGPT/Claude/etc. Contains complete request/response format, field explanations, working templates in both Node.js and Python, and common prompts.

**Why:** In 2026, most developers use AI to write code. Optimizing for AI-assisted development is critical.

### Zero-Config SDKs
Both JavaScript and Python SDKs (`bots/sdk/`) require zero setup:
- No npm install needed for Node.js
- No pip install needed for Python
- Single function to implement: `decide(state) -> action`
- Built-in logging, error handling, health endpoint

### Progressive Complexity
Examples (`bots/examples/`) are ordered by complexity:

**Beginner (4-15 lines):**
1. `01-check-fold.js` — 4 lines, never risks chips
2. `02-calling-station.js` — 4 lines, calls everything
3. `03-tight-passive.js` — 15 lines, premium hands only

**Intermediate (30-45 lines):**
4. `04-tight-aggressive.js` — 40 lines, classic TAG
5. `05-pot-odds-calculator.js` — 30 lines, math-based
6. `06-position-aware.js` — 45 lines, position exploits

**Advanced (100+ lines):**
7. `07-data-driven.js` — SQLite persistence, opponent tracking, player classification (LAG/TAG/LP/TP)
8. `08-monte-carlo.js` — Hand equity via 1000+ simulations, EV calculations
9. `09-adaptive-exploiter.js` — Real-time pattern detection, exploit strategies
10. `10-tournament-icm.js` — ICM calculations, bubble factor, push/fold ranges

### Testing Playground
`bots/playground/test-bot.js` lets developers test locally:
- 11 pre-built scenarios (preflop, flop, river, edge cases)
- Response validation
- Timing measurement
- Colored pass/fail output

### Strategy Helpers in SDK
Built-in functions reduce implementation complexity:
- `Strategy.preFlopStrength(holeCards, position)` — 0 to 1
- `Strategy.postFlopStrength(bestHand, opponentCount)` — 0 to 1
- `Strategy.shouldValueBet(state)` — boolean
- `Strategy.shouldCall(state, buffer)` — pot odds comparison
- `Action.potSized(pot, action)` — standard bet sizing

---

## Testing Strategy

### Three-Tier Test Structure

**Unit Tests** (`tests/unit/`):
- Pure game logic (hand evaluation, pot management, betting)
- No external dependencies or mocks
- 161+ tests covering all edge cases
- Run: `npm run test:unit`

**Integration Tests** (`tests/integration/`):
- Multiple components together with mocked services
- Mock HTTP servers for bot communication testing
- Service layer testing without database
- Run: `npm run test:integration`

**E2E Tests** (`tests/e2e/`):
- Full API testing with real PostgreSQL database
- WebSocket connection testing
- Complete user flows (register → create bot → join table)
- Run: `npm run test:e2e` (requires PostgreSQL)

### Test Utilities

- `MockBotServer` — Configurable HTTP server for simulating bots
- `createCallingBot/createFoldingBot/createAggressiveBot` — Pre-built bot behaviors
- `createSlowBot` — For timeout testing
- `createUnreliableBot` — For resilience testing

### Running Tests

```bash
# Default: unit + integration tests
npm test

# All tests including E2E (requires PostgreSQL)
npm run test:all

# With coverage report
npm run test:cov

# E2E with Docker (spins up PostgreSQL automatically)
npm run test:e2e:docker
```

See `docs/TESTING.md` for complete testing documentation.

---

## Known Gaps / Future Work

- **Scheduled tournament start** — `type:'scheduled'` exists but no timer fires at `scheduled_start_at`
- **Tournament reset** — finished tournaments can't be restarted without manual DB changes
- **Redis for session state** — currently in-memory, need Redis for horizontal scaling
- **WebSocket authentication** — JWT validation on connection implemented, need refresh handling
- **HMAC bot payload signing** — planned for additional security
- **Key rotation** — API key rotation mechanism not yet implemented
- **Hand-for-hand bubble play** — not implemented for tournament bubble
- **Dead button rule** — need to choose and implement consistently

For comprehensive edge case documentation, see `EDGE_CASES.md`.
