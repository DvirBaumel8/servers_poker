# Claude Code — Project Context

## CRITICAL: Before Any Implementation

**ALWAYS do this FIRST:**
1. Read `/Users/dvir.baumel/.claude/projects/-Users-dvir-baumel-servers-poker/memory/MEMORY.md` — check for rules/feedback
2. Plan the work in plan mode (use EnterPlanMode for non-trivial tasks)
3. After implementation: Update CLAUDE.md OR docs/ with ALL changes made
4. Run TypeScript check: `npx tsc --noEmit` in frontend/

## MANDATORY: Tests After Every Code Change

After ANY source code change:
1. Does this change alter existing behaviour? → Update or delete stale tests
2. Does this introduce new logic? → Add new tests covering it
3. Is this a bug fix? → Add a regression test that would have caught it
4. Run tests and verify they pass:
   ```bash
   npx vitest run tests/unit/    # Unit tests (fast)
   npx vitest run                # All tests
   ```
5. Do not skip this step, even for "small" changes

Pure algorithmic logic must have unit tests in `tests/unit/` — pure functions, no NestJS/DB.

---

## Project

**BotRoyale** — No-Limit Texas Hold'em tournament platform where users build bots via a UI. Bots use in-process strategy evaluation (no external servers). NestJS backend + React/Vite frontend.

## Running the Stack

```bash
npm run dev          # Backend (port 3000)
cd frontend && npm run dev  # Frontend (port 5173)
npm run dev:all      # Both together
npm run game:watch   # Live demo game with 5 bots
```

## Key Commands

```bash
npm run seed:tournaments              # Seed 3 upcoming tournaments
npm run migration:run                 # Run DB migrations
npm run ci:local:quick                # Lint + types + unit tests
npm run test:poker -- --games=100 --bots=8  # Game invariant tests
npm run audit:bots                    # Bot decision sanity checks
npm run audit:games                   # Offline hand logic validator
bash scripts/detect-ui-bugs.sh        # Gemini UI bug detection
```

## Architecture

- **Backend:** NestJS, TypeORM, PostgreSQL 16, Redis
- **Frontend:** React 19, Vite, Tailwind CSS v4, Zustand (auth store), Axios
- **Auth:** JWT (access token in Authorization header)
- **Real-time:** Socket.IO at `/game` namespace
- **Global API prefix:** `api/v1` — all REST under `http://localhost:3000/api/v1`
- **Swagger:** `http://localhost:3000/api/docs`

## Tournament Statuses

Valid values (DTO `@IsIn`):
`registering` | `running` | `final_table` | `finished` | `cancelled` | `error`

- `error` — set automatically when a fatal, unrecoverable error occurs during tournament execution (e.g. payout write failure, 3+ consecutive handler errors). Triggers admin email alert via `TournamentAlertService`. Columns `error_reason` and `error_at` on the entity store details. Errored tournaments are NOT auto-recovered on restart — admin must inspect and resolve manually.
- There is **no** `pending` or `upcoming` status.

## Frontend Conventions

- All styles are inline (`style={{ ... }}`), no CSS modules
- Design tokens in `C` object per page file
- Font: `'Trebuchet MS', sans-serif` (always use `C.font`)
- Auth state: `useAuthStore` from `../store/authStore`
- API client: `api` from `../lib/axios` (base URL from `VITE_API_URL`)
- **Shared Sidebar**: `frontend/src/components/Sidebar.tsx` — use `<Sidebar />` (no props). Do NOT add inline Sidebar functions to new pages.

## CORS

Backend reads `CORS_ORIGINS` from `.env`. Both `http://localhost:3000` and `http://localhost:5173` must be listed.

## Database

PostgreSQL database name: `poker`. Connect: `psql -d poker`

Tournament-related tables (delete order for seeding):
`tournament_blind_levels` → `tournament_seat_history` → `tournament_seats` → `tournament_tables` → `tournament_entries` → `tournaments`

## Email Verification

In dev, if backend returns `verificationCode` in register response, signup auto-verifies (localhost-only).

## Testing

Vitest for unit/integration. E2E uses `--no-file-parallelism`.
`strategy-analyzer-pipeline.e2e.spec.ts` is skipped (see TECH_DEBT.md).

---

## Real-Time Game Updates (Socket.IO)

- **Namespace:** `/game` at `ws://localhost:3000/game`
- **Auth:** JWT in socket handshake
- **Rooms:** `table:{tableId}`, `bot:{botId}`, `tournaments`

**Server → Client Events:** `gameState`, `playerAction`, `handStarted`, `handResult`, `gameFinished`, `playerLeft`, `error`, `botActivity`, `activeBots`, `showdownReveal`

**Client → Server:** `subscribe`, `unsubscribe`, `registerBot`, `subscribeBotActivity`, `unsubscribeBotActivity`, `subscribeActiveBots`, `unsubscribeActiveBots`, `subscribeTournaments`, `unsubscribeTournaments`, `action`

**Frontend Hook:** `useGameSocket(gameId)` in `frontend/src/hooks/useGameSocket.ts`
- Returns `{ gameState, connectionStatus, socket }`
- Auto-subscribes, transforms card strings to objects, fetches tournament state
- Auto-reconnect: 5 attempts with exponential backoff (1s → 5s)

---

## Game Invariant Testing System

`npm run test:poker -- --games=100 --bots=8` — runs simulated games, validates invariants after every action.

**8 validators** (`src/testing-utilities/validators.ts`):
1. `totalChipsConserved` — chips + pot === expected
2. `potEqualsStackedBets` — pot matches bets within street
3. `validCardCounts` — each player has 0 or 2 hole cards
4. `validCommunityCards` — community cards in {0, 3, 4, 5}
5. `validActivePlayerCount` — non-negative
6. `noDuplicateCards` — no card appears twice
7. `validBetSizes` — no negative bets
8. `sidePotMathCorrect` — sum(pots) === total (showdown only)

Bugs auto-tracked in `POKER_BUGS.md` with dedup and resolved tracking.

**GameInstance** can be created without NestJS/DB:
```typescript
new GameInstance(logger, eventEmitter, { tableId, gameId, smallBlind, bigBlind, startingChips })
game.addPlayer({ id, name, strategy, chips })
await game.startGame()
```

### Testing System Maintenance Rules

1. After modifying game logic: run `npm run test:poker -- --games=20 --bots=6` to verify no regressions
2. When a bug is found: determine which validator should have caught it, strengthen or create validator

---

## Gemini QA Systems

**Design QA:** `GOOGLE_API_KEY=$(grep "^GOOGLE_API_KEY=" .env | cut -d= -f2) npx ts-node src/testing-utilities/ui-design-qa.ts`
- Captures Playwright screenshots during live games, sends to Gemini for design scoring

**UI Bug Detection:** `bash scripts/detect-ui-bugs.sh`
- Screenshots → Gemini analysis → bug reports in `ui-bug-reports/` and `POKER_BUGS.md`
- Free tier: 20 requests/day per model

---

## Documentation

```
docs/
├── API.md, ARCHITECTURE.md, TESTING.md, SECURITY.md, DEPLOYMENT.md
├── BOT_DEVELOPER_GUIDE.md, GAME_RULES.md, EDGE_CASES.md, DATA.md
├── CHANGELOG.md              # Full changelog (moved from CLAUDE.md)
├── guides/QUICKSTART.md, guides/DEMO-GAMES.md
└── adr/                      # Architectural decision records
```

### When Making Changes

1. **New API endpoints** → Update `docs/API.md`
2. **Feature changes** → Update `CLAUDE.md` with new patterns
3. **Setup changes** → Update `CLAUDE.md` or `guides/QUICKSTART.md`
4. **Security decisions** → `docs/SECURITY.md`
5. **Deployment changes** → `docs/DEPLOYMENT.md`

Always verify markdown files need updates. No work is complete until docs are updated.

---

## Tournament System

### Frontend Routes

| Route | Page | Description |
|-------|------|-------------|
| `/tournaments` | TournamentsPage | Discovery/listing with grid, filtering |
| `/tournaments/:id` | TournamentDetailPage | Details, participant list, registration |
| `/tournaments/:id/lobby` | TournamentLobbyPage | Waiting room, countdown, live players |
| `/tournaments/:id/live` | TournamentLivePage | GameSpectator + tournament context sidebar |
| `/tournaments/:id/results` | TournamentResultsPage | Podium + full leaderboard |
| `/games` | TournamentAnalyticsPage | Post-tournament forensics IDE |

Components in `frontend/src/components/tournaments/`: BotSelectionModal, TournamentCard, CountdownTimer, TournamentContext, Podium, ResultsTable

### Tournament WebSocket Hooks

- `useTournamentSocket.ts` — detail page real-time updates
- `useTournamentLobby.ts` — lobby player tracking, auto-redirect on start

**Events:** `subscribe_tournament`, `tournament_state_updated`, `tournament_player_action`, `tournament_notification`

### Key Backend Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tournaments/scheduled/upcoming` | Public | Upcoming tournaments (7-day window) |
| GET | `/tournaments/:id/my-current-table` | JWT | User's active table/seat info |
| GET | `/tournaments/:id/results` | Public | Final standings + payouts |
| GET | `/tournaments/:id/hands-manifest` | JWT | Hand list for analytics |
| GET | `/tournaments/:id/seeding-map` | Admin | Table seating with ELO + fairness score |
| GET | `/tournaments/:id/log` | JWT | Tournament log data (JSON) |
| GET | `/tournaments/participated` | JWT | User's finished tournaments |
| POST | `/tournaments/:id/simulate` | Admin | Start headless simulation |
| POST | `/tournaments/:id/start` | Admin | Force-start tournament |
| POST | `/tournaments/admin/inject-bots/:id` | Admin | Inject system bots |
| GET | `/tournaments/admin/users-summary` | Admin | Users with bot counts |
| POST | `/tournaments/admin/reset-state` | Admin | Cancel all registering tournaments |
| GET | `/tournaments/admin/:id/balancing-moves` | Admin | Table move audit log |

### Payout Calculation

- Top 10% of players receive payouts (min 3, max 50%)
- Distribution: 1st 30%, 2nd 20%, 3rd 15%, 4th+ weighted
- Tied players (same-hand elimination): ranked by starting chips, equal stacks share rank and split prize

### Tournament Director Key Behaviors

- **Snake seeding** with ELO sort + owner isolation (greedy swap)
- **Continuous table balancing**: triggers when `maxTable.size - minTable.size > 1`; moves largest-stack player with owner isolation
- **Position equity seating**: moved players inserted at `(dealerIndex + 2) % N`
- **Table moves** persisted to `tournament_events` table
- **`seatsPerTable`** reads `config.players_per_table ?? 9`
- **Tournament recovery**: `recoverFromDb()` respawns dead games from DB seat data after server restart
- **Log persistence**: `MasterTournamentLog` saved to `tournaments.log_data` (JSONB) on finish

### Backend Requirements (Still TODO)

- Access control: `isUserRegistered()` check on `GamesController.getGame()` (403 if not registered)
- Real-time broadcasting: `TournamentsGateway` — see `TOURNAMENT_REALTIME_BACKEND.md`

---

## Finance Module

**Module:** `src/modules/finance/`

- `wallets` — one per user, `balance` bigint with DB `CHECK >= 0`
- `transactions` — append-only ledger
- Every balance change wraps UPDATE wallet + INSERT transaction in a single Postgres transaction

**Endpoints** (under `/api/v1/finance`): `GET /wallet`, `POST /wallet`, `POST /deposit`, `POST /withdraw`, `GET /transactions`, `GET /wallet/:userId` (admin), `GET /transactions/:userId` (admin)

### Matchmaking Orchestrator

**Module:** `src/modules/matchmaking/` — Daily tournament lifecycle:

| Time (UTC) | Job | Action |
|------------|-----|--------|
| 08:00 | `createDailyMasterTournament` | Creates daily tournament, auto-registers premium users |
| 20:55 | `lockAndCreatePods` | Locks registrations, shuffles, splits into pods |
| 21:00 | `executePods` | Dispatches pods to TournamentDirector workers |

- Prize distribution via `PrizeDistributionService` (event-driven, 15% ITM)
- User subscription fields: `subscription_status`, `subscription_start`, `subscription_end`, `monthly_fee`
- `TournamentPod` entity: `pending` → `running` → `finished`/`cancelled`

---

## Bot Logic Auditor

`npm run audit:bots` — injects synthetic payloads into strategy engine, checks 6 scenarios:
- **Hard failures:** neverFoldOnCheck, minRaiseCompliance, neverFoldAllIn
- **Strategy warnings:** neverCallZeroEquity, strongHandValidation, potOddsAwareness

Exit code 0 = clean, 1 = illegal-move violation.

## Automated Poker Logic Validator

`npm run audit:games` — reads completed hands from DB, runs 18 invariant checks (no_duplicate_cards, seed_replay, street_progression, action_sequence, pot_matching, zero_sum, side_pot_eligibility, odd_chip_rule, min_raise, showdown_fairness, winner_amounts, duplicate_action_seq, blind_structure, chip_continuity, win_rate_anomaly, zero_response_time, itm_count, prize_pool_match).

Results stored in `logic_bugs` table. Exit code 0 = clean, 1 = bugs found, 2 = fatal.

---

## Admin Dashboard

**Route:** `/admin` — `user.role === 'admin'` only

- Split-view: Left = tournament list; Right = quick actions
- **Create Tournament** form: table size (2/3/6/9), speed, buy-in, name
- **Bot Injector**: injects system bots into registering tournaments
- **GO LIVE**: force-start button
- **User & Bot Monitoring**: non-admin users with active bot counts
- **Seeding Map**: color-coded owner rings, per-table seat cards, fairness score
- **Balancing Moves**: live move log with auto-refresh
- **Reset State**: two-click confirm → cancels registering tournaments

---

## Simulation Engine

Headless bot sandbox — test bots against opponent profiles in isolation.

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/simulations` | Create simulation |
| GET | `/simulations` | List simulations |
| GET | `/simulations/:id` | Status + progress |
| GET | `/simulations/:id/result` | Full analytics |
| DELETE | `/simulations/:id` | Delete simulation |

**Stats computed:** bb/100, winRate, VPIP, PFR, aggression factor, position heatmap, equity curve (profit sampled every 100 hands)

**Isolation:** `simulationMode=true` disables all Socket.IO/Redis emissions. No writes to live game tables.

**Worker architecture:** Direct Worker Thread per simulation with progress messages. Max 1 concurrent per user.

---

## Leaderboard

**Route:** `/leaderboard` — Hall of Fame with user-based rankings (not individual bots).

- `mv_user_leaderboard` materialized view, refreshed every 15 min
- Metrics: BB/100, ROI%, ITM%, total tournaments, wins
- Top 3 podium + full table with period filters (daily/weekly/monthly/all-time)
- System bots (`is_system=true`) bypass `minGames` filter
- `GET /api/v1/leaderboard` — paginated, filterable
- `GET /api/v1/leaderboard/:botId` — individual bot performance

---

## Scenario Lab

**Route:** `/scenario-lab` — single-hand scenario editor

`POST /api/v1/bots/:id/scenario` — evaluates bot strategy 20x with random seeds, returns action distribution + reasoning.

---

## Support

`POST /api/v1/contact` — public, rate-limited 3/hr. Persists to `support_tickets` table, sends admin email notification.

**Route:** `/support` — contact form page

---

## Key Architectural Patterns

### Strategy Engine
- **3-tier system:** Quick (personality sliders), Strategy (rules + range chart), Pro (position overrides)
- **Hydration cache:** LRU-256, pre-compiles strategies (sorted rules, Uint8Array(169) range chart LUT)
- **Evaluation cache:** LRU-512, keyed by game state
- **Weight-based action distribution** with sigmoid slider mapping
- **Equity service:** Rule-of-2/4 heuristic + optional Monte Carlo
- **Dynamic raise sizing:** menu of realistic sizes, RNG-varied per action
- **200ms kill switch** on strategy evaluation (Promise.race timeout)
- **Deterministic seeded RNG:** SHA-256 seeds from provably fair chain

### Game Engine
- **Seat status:** `active` | `sitting_out` | `eliminated` (3 strikes → sitting_out, auto-check/fold)
- **Showdown:** last aggressor shows first, muck option, step-by-step reveal
- **Betting:** MAX_RAISES_PER_STREET = 5
- **Action buffering:** in-memory buffer, single bulk INSERT at hand end
- **Hot/cold recovery:** Redis hot state per action (TTL 4h), Postgres cold state every 30s
- **Heartbeat monitoring:** Redis-based 30s threshold, `GameMonitorService` scans every 12s
- **Self-healing:** stuck games auto-recovered with retry limit (3 attempts per hand)

### Worker Pool
- Fixed-size pool (`WORKER_POOL_SIZE` env, default = CPU count) for tournament simulation
- Heartbeat monitor (10s interval, 30s timeout), auto-replacement on crash
- `GET /api/v1/tournaments/simulation/pool-metrics` — pool stats

### Distributed Locking (Redis)
- `LockService` with `SET NX EX`, Lua atomic release, UUID ownership
- Protected: matchmaking crons, prize distribution, archive, leaderboard refresh

### Archiving (S3)
- Daily cron archives finished tournaments older than N days (gzipped JSON to S3)
- Pipeline: eligibility check → serialize → upload → mark → prune hands
- Retrieval: DB first, S3 fallback

### Tournament Log Schema (Lean Format)
- Abbreviated keys: `p_id`, `st` (p/f/t/r), `dec`, `amt`, `metrics.eq`, `metrics.w`
- `initial_stacks` per hand, flat `board: string[]`
- No redundant derivable fields (live_players, facing_action, stack_before removed)

### Chaos Tournament Runner
`src/testing-utilities/chaos-tournament.ts` — headless single-table tournament, no DB/NestJS.
- Custom bot injection, stack imbalance mode, clone war mode
- Presets: `CHAOS_PRESETS.maniacVsNit()`, `extremeDNA()`, `cloneWar()`

---

## Full Changelog

See `docs/CHANGELOG.md` for detailed changelog of all changes (moved from CLAUDE.md to reduce context size).
