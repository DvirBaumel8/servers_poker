# Claude Code — Project Context

## 🚨 CRITICAL: Before Any Implementation

**ALWAYS do this FIRST:**
1. ✅ Read `/Users/dvir.baumel/.claude/projects/-Users-dvir-baumel-servers-poker/memory/MEMORY.md` — check for rules/feedback
2. ✅ Plan the work in plan mode (use EnterPlanMode for non-trivial tasks)
3. ✅ After implementation: Update CLAUDE.md OR docs/ with ALL changes made
4. ✅ Run TypeScript check: `npx tsc --noEmit` in frontend/

**If you skip step 1 (reading memory), you WILL miss important rules like markdown updates.**

## 🧪 MANDATORY: Tests After Every Code Change

**After ANY source code change, you MUST:**
1. **Consider test coverage** — ask yourself:
   - Does this change alter existing behaviour? → Update or delete stale tests.
   - Does this introduce new logic? → Add new tests covering it.
   - Is this a bug fix? → Add a regression test that would have caught the bug.
2. **Run the affected tests** and verify they pass before finalising your response:
   ```bash
   # Unit tests (fast, no NestJS/DB)
   npx vitest run tests/unit/

   # All tests
   npx vitest run
   ```
3. **Do not skip this step**, even for "small" or "obvious" changes — most regressions come from edits that seemed trivial.

Pure algorithmic logic (seeding, betting math, hand evaluation) must have unit tests in `tests/unit/`. Tests must be pure functions with no NestJS or database dependencies.

---

## Project

**BotRoyale** — No-Limit Texas Hold'em tournament platform where users build bots via a UI. Bots use in-process strategy evaluation (no external servers). NestJS backend + React/Vite frontend.

## Running the stack

```bash
# Backend (port 3000)
npm run dev

# Frontend (port 5173)
cd frontend && npm run dev

# Both together
npm run dev:all
```

## Key commands

```bash
npm run seed:tournaments    # Seed 3 upcoming tournaments into DB
npm run migration:run       # Run DB migrations
npm run ci:local:quick      # Lint + types + unit tests
```

## Architecture

- **Backend:** NestJS, TypeORM, PostgreSQL 16, Redis (optional for scaling)
- **Frontend:** React 19, Vite, Tailwind CSS v4, Zustand (auth store), Axios
- **Auth:** JWT (access token in Authorization header)
- **Real-time:** Socket.IO at `/game` namespace
- **Global API prefix:** `api/v1` — all REST endpoints are under `http://localhost:3000/api/v1`

## Tournament statuses

Valid values (enforced by DB check constraint and DTO `@IsIn`):
`registering` | `running` | `final_table` | `finished` | `cancelled`

There is **no** `pending` or `upcoming` status.

## Tournament Endpoints

### Discovery & Info
`GET /api/v1/tournaments/scheduled/upcoming` — public, no auth required.
Returns tournaments where `type='scheduled'`, `status='registering'`, and `scheduled_start_at` is within the next 7 days.

### Live Tournament Viewing
`GET /api/v1/tournaments/:id/my-current-table` — requires JWT auth
- **Response (200):**
  ```json
  {
    "tableId": "uuid",
    "tableNumber": 3,
    "seatPosition": 5,
    "remainingPlayers": 42,
    "currentBlindLevel": 5,
    "gameId": "uuid"
  }
  ```
- **Error (404):** User is eliminated or not playing in tournament
- **Logic:** Finds user's active tournament seat, returns table & seat info, or 404 if busted
- **Usage:** Called by TournamentLivePage to determine which table/game to display
- **Polling:** Frontend polls every 30s to detect table changes

## Frontend conventions

- All styles are inline (`style={{ ... }}`), no CSS modules
- Design tokens are in the `C` object in each page file
- Font: `'Trebuchet MS', sans-serif` (always use `C.font`)
- Auth state: `useAuthStore` from `../store/authStore`
- API client: `api` from `../lib/axios` (base URL from `VITE_API_URL` env var)
- **Shared Sidebar**: `frontend/src/components/Sidebar.tsx` — use `<Sidebar />` (no props). Manages its own collapse state via `useSidebarStore`. Do NOT add inline Sidebar functions to new pages.

## CORS

Backend reads `CORS_ORIGINS` from `.env`. Frontend runs on port 5173. Both `http://localhost:3000` and `http://localhost:5173` must be in `CORS_ORIGINS`.

## Database

PostgreSQL database name: `poker`. Connect: `psql -d poker`

Tournament-related tables (delete order for seeding):
1. `tournament_blind_levels`
2. `tournament_seat_history`
3. `tournament_seats`
4. `tournament_tables`
5. `tournament_entries`
6. `tournaments`

## Email verification

In development, if the backend returns `verificationCode` in the register response, the signup flow auto-verifies and skips the email step (localhost-only convenience).

## Testing

Unit/integration tests use Vitest. E2E tests use `--no-file-parallelism` to avoid schema conflicts.
`strategy-analyzer-pipeline.e2e.spec.ts` is currently skipped (see TECH_DEBT.md).

## Real-Time Game Updates (Socket.IO)

### Backend Namespace
- **Namespace:** `/game` at `ws://localhost:3000/game`
- **Auth:** JWT token passed in socket handshake (uses `Authorization: Bearer {token}` or `auth.token` option)
- **Rooms:** `table:{tableId}` for game state, `bot:{botId}` for bot activity, `tournaments` for tournament updates

### Game State Snapshot
The `gameState` event includes `tournamentId?: string` (if the game belongs to a tournament). Frontend uses this to fetch live tournament info via `GET /api/v1/tournaments/{tournamentId}/state`.

### Server → Client Events
| Event | Room | Payload |
|---|---|---|
| `gameState` | `table:{tableId}` | Full game snapshot with players, cards, pot, stage |
| `playerAction` | `table:{tableId}` | `{ botId, action, amount, pot }` |
| `handStarted` | `table:{tableId}` | `{ tableId, handNumber, provablyFair? }` |
| `handResult` | `table:{tableId}` | `{ handNumber, winners[], pot, provablyFair? }` |
| `gameFinished` | `table:{tableId}` | `{ reason, winnerId?, winnerName? }` |
| `playerLeft` | `table:{tableId}` | `{ playerId, playerName, reason, remainingPlayers }` |
| `error` | direct to socket | `{ code, message }` |
| `botActivity` | `bot:{botId}` | Bot activity snapshot |
| `activeBots` | `activeBots` room | `{ bots[], totalActive, timestamp }` |

### Client → Server Messages
- `subscribe` — Join room for a table: `{ tableId }`
- `unsubscribe` — Leave table room: `{ tableId }`
- `registerBot` — Associate bot with socket (auth required): `{ botId }`
- `subscribeBotActivity`, `unsubscribeBotActivity` — Join/leave bot room
- `subscribeActiveBots`, `unsubscribeActiveBots` — Join/leave active bots list
- `subscribeTournaments`, `unsubscribeTournaments` — Join/leave tournaments room
- `action` — Send game action (bot-initiated): `{ gameId, action, amount? }`

### Frontend Hook: `useGameSocket`
**Location:** `frontend/src/hooks/useGameSocket.ts`

**Usage:**
```tsx
const { gameState, connectionStatus, socket } = useGameSocket(gameId)

// Returns:
// - gameState: GameState | null (null until first message received, includes real tournament data)
// - connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
// - socket: Socket instance (for advanced use)
```

**Behavior:**
1. On mount: connects to `/game` namespace, auto-injects JWT from auth store
2. On connect: emits `subscribe` with `{ tableId: gameId }`
3. Transforms backend types → frontend types: card strings `"Ah"` → `{suit:'hearts', rank:'A'}`, position strings → `isDealer`/`isSmallBlind` booleans
4. When `gameState` arrives with `tournamentId`: automatically fetches `GET /api/v1/tournaments/{tournamentId}/state`
5. Re-fetches tournament state on every `handStarted` event (to catch blind level changes)
6. Populates `tournamentName`, `currentLevel`, `timeUntilNextLevel` (format: "X/Y hands") from fetched tournament data
7. Accumulates last 5 player actions in `lastActions` array
8. On unmount: emits `unsubscribe`, disconnects socket

**Connection Status Indicator:**
The `GameSpectator` component displays a small status pill in the tournament bar:
- 🟢 **Live** — Connected and receiving updates
- 🟡 **Connecting...** — Socket connecting, pulsing indicator
- 🔴 **Offline** — Disconnected (auto-reconnect attempts in progress)
- 🔴 **Error** — Connection failed

Auto-reconnect: 5 attempts with exponential backoff (1s → 5s max).

## GameSpectator UI Styling (Frontend)

**Latest:** Round 3 Visual Polish Pass — Casino-Quality Professional UI

### Card Styling
- **Sizes:** 10-15% larger (Desktop: 82×118, Tablet: 66×95, Mobile: 54×78; Community: Desktop 88×127, Tablet 70×102, Mobile 62×90)
- **Front face:** White gradient `linear-gradient(160deg, #ffffff 0%, #f4f4f4 60%, #eeeeee 100%)` with strong shadow
- **Back face:** Gray metallic `linear-gradient(145deg, #9eaab6 0%, #6e7f8d 40%, #4a5a68 100%)` with crosshatch pattern
- **3D tilt:** `perspective(600px) rotateY(2deg)` on front face
- **Shadow:** `0 6px 18px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.9)`

### Player Nameplate
- **Layout:** Horizontal flex with avatar (40px) + name + chips stacked vertically
- **Background:** `rgba(0, 0, 0, 0.72)` with `blur(10px)` backdrop filter
- **Padding:** Uniform `8px 12px`
- **Blind badges:** Rendered separately below nameplate (not inside pill), 24px circles
  - Dealer (D): black `#1a1a1a`
  - Small Blind (SB): blue `#1565c0`
  - Big Blind (BB): red `#b71c1c`
- **Typography:** Name 13px, fontWeight 600, #d4dae4; Chips 17px bold monospace, cyan/white based on bot ownership
- **Active state:** `1px solid ${C.accent}` border with `0 0 12px cyan glow`

### Casino Poker Chips
- **Color tiers:** 1-50 cyan `#00bcd4`, 51-500 red `#e53935`, 501+ black `#212121`
- **Depth:** Radial gradient `radial-gradient(circle at 32% 28%, ${lighterColor} 0%, ${color} 50%, ${darkerColor} 100%)`
- **Segmented edge:** 8 evenly-spaced conic-gradient stripes for casino chip appearance
- **Shadow:** `0 3px 8px rgba(0,0,0,0.6), inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.25)`
- **BetChip:** Stacked chips (1-3 based on amount) offset by 4px, amount label below

### Pot Display
- **No background box** — floating text on felt
- **Typography:** "Total Pot" label (11px, gray `#6b7280`, uppercase, letterSpacing 2px), amount (52px, gold `#ffd700`, bold)
- **Glow:** `text-shadow: 0 0 20px rgba(255,215,0,0.6), 0 0 40px rgba(255,215,0,0.3), 0 2px 4px rgba(0,0,0,0.8)`
- **Animation:** `pulse-gold 3s ease-in-out infinite`

### Table Felt
- **Gradient:** Radial center lighter `radial-gradient(ellipse at 50% 45%, #256b40 0%, #1a5232 30%, #0e3d22 60%, #062010 100%)`
- **Grain texture:** Three overlaid repeating gradients (30deg, 60deg, 90deg) with 2-3px white stripes at 1-1.5% opacity
- **Watermark:** "BR" centered at 110px, 2.5% opacity

### Wood Rail
- **Gradient:** Radial with lighter top `radial-gradient(ellipse at 50% 10%, #a0714f 0%, #7a4a2a 15%, #3d1f0a 50%, #6b3a1f 80%, #4a2510 100%)`
- **Grain stripes:** Repeating linear gradient 92deg at 12-14px intervals with `rgba(0,0,0,0.08)`
- **Shadow:** Deep inset shadows (top 8px light, bottom 6px dark, sides 4px dark) + outer drop shadow 50px, 80px

### Active Player Indicator
- **Card area glow:** When active, cards div gets `boxShadow: 0 0 20px rgba(0,229,255,0.4), 0 0 40px rgba(0,229,255,0.2)`, cyan border, padding, background tint
- **Animation:** `cardAreaGlow 2s ease-in-out infinite` (pulsing between 12px and 48px cyan glow)
- **Avatar:** Cyan conic-gradient timer arc, `timerArc 15s linear infinite`

### Folded Player State
- **Overlay:** `filter: grayscale(1) brightness(0.6)` applied to entire player wrapper
- **Cards:** Fade to 0.35 opacity with `cardFold 0.5s ease-in forwards` animation

### Animations
- `cardDeal3d` — Entry animation with 3D transform, scaling, and rotation (0.7s)
- `communityFlip` — Staggered card reveal with rotateY (0.5s per card, 0.18s stagger)
- `cardFloat` — Subtle hover bob animation (3s infinite)
- `cardFold` — Cards disappear upward with rotation (0.5s)
- `actionFloat` — Action badges float up and fade (1.5s)
- `timerArc` — Conic-gradient sweep for active player timer (15s linear)
- `cardAreaGlow` — Pulsing cyan glow border around active player cards (2s)
- `pulse-gold` — Pot amount text glow pulse (3s)

### Responsive
- **Desktop (≥1200px):** Full oval table, card sizes 82×118
- **Tablet (768-1199px):** Scaled down table, 0.8 scale, cards 66×95
- **Mobile (<768px):** Portrait layout, 2-column grid of players, compact card sizes 54×78

All styling is **inline styles** with C design tokens. No CSS modules. All animations in `<style>` tag.

## Automated Poker Game Testing System

The system runs complete simulated poker games and validates game invariants after every action to catch subtle bugs.

### Architecture

```
src/testing-utilities/
  validators.ts           # 8 invariant checks (chip conservation, pot math, card counts, etc.)
  game-simulator.ts       # Run a full game, collect events and bug reports
  coverage-tracker.ts     # Track scenario coverage across games

src/modules/testing/
  testing.module.ts       # NestJS module
  testing.controller.ts   # POST /api/testing/run-simulation endpoint
  testing.service.ts      # Orchestrates multiple game simulations

scripts/
  run-poker-tests.ts      # CLI: npm run test:poker -- --games=100 --bots=8

POKER_BUGS.md            # Auto-generated bug reports (created at project root)
test-coverage.json       # Scenario coverage metrics (created at project root)
```

### Running Tests

**CLI (Recommended for development):**
```bash
npm run test:poker -- --games=100 --bots=8
```

Output shows pass/fail per game, final summary, coverage metrics, and logs bugs to `POKER_BUGS.md`.

**REST API Endpoint:**
```bash
curl -X POST http://localhost:3000/api/v1/testing/run-simulation \
  -H "Content-Type: application/json" \
  -d '{ "gameCount": 5, "botCount": 6, "startingChips": 1000, "smallBlind": 10, "bigBlind": 20 }'
```

Response:
```json
{
  "totalGames": 5,
  "successful": 5,
  "failed": 0,
  "bugsFound": 0,
  "bugsFile": "/path/to/POKER_BUGS.md",
  "coverage": {
    "allInWithSidePots": 2,
    "headsUp": 3,
    "splitPot": 1,
    "playerElimination": 8,
    "everyoneFoldsToBlind": 0,
    "showdown": 12
  },
  "duration": 45000
}
```

### Invariant Validators

`ValidatorSuite.runAll()` runs 8 checks after every game action:

1. **totalChipsConserved** — `sum(player.chips) + pot === expectedTotal`
2. **potEqualsStackedBets** — `mainPot ≈ sum(playerBetsThisRound)` (within betting street)
3. **validCardCounts** — each player has exactly 0 or 2 hole cards
4. **validCommunityCards** — community cards are in `{0, 3, 4, 5}` only
5. **validActivePlayerCount** — non-negative active player count
6. **noDuplicateCards** — no card appears twice across all cards
7. **validBetSizes** — no player's bet is negative
8. **sidePotMathCorrect** — when multiple pots, `sum(pots) === getTotalPot()`

Each returns `BugReport[]` with full error context (game state snapshot, last 10 actions, error details).

### Coverage Metrics

Tracked across all games:
- **allInWithSidePots**: Number of actions with side pots active
- **headsUp**: Number of hands played with exactly 2 players
- **splitPot**: Number of multi-winner pots
- **playerElimination**: Number of players busted out
- **everyoneFoldsToBlind**: Number of hands where only 1 player reaches the bet
- **showdown**: Number of hands that reach showdown

### GameInstance (No External Dependencies)

The simulator creates `GameInstance` directly without NestJS/database:
- Constructor: `new GameInstance(logger, eventEmitter, { tableId, gameId, smallBlind, bigBlind, startingChips })`
- Add bots: `game.addPlayer({ id, name, strategy, chips })`
- Start: `await game.startGame()` — async game loop
- Events: `game.stateUpdated`, `game.playerAction`, `game.handStarted`, `game.finished`
- Public API: `game.players`, `game.potManager`, `game.communityCards`, `game.stage`, `game.getPublicState()`, `game.setExpectedTotalChips()`

All validators access public fields only — no internal mutations needed.

### Testing Configuration

Bots are assigned random personality presets from the 8 presets (Shark, Rock, Maniac, Calling Station, Nit, Balanced Pro, Tricky, Bully). Each game runs with:
- Default starting chips: 1000
- Default blinds: 10 (small), 20 (big)
- Bot count: configurable (2–9)
- Ante: 0 (configurable)

### Bug Reports

`POKER_BUGS.md` is created/updated at project root with intelligent tracking:

**Features:**
- Detects duplicate bugs across runs (bug signature = invariant + error details)
- Shows only **active** bugs (not fixed)
- Tracks when each bug was first seen and last reproduced
- Auto-marks bugs as **Resolved** when they stop appearing
- Hidden registry at `.poker-bug-registry.json` maintains bug history

**Format:**
```markdown
# Poker Game Bugs - Auto-Generated
Last updated: 2026-03-28T12:30:00Z
Active bugs: 1
Resolved: 2

## 🔴 Active Bugs

### Bug #1 - Total chips mismatch
**Severity**: Critical
**First seen**: 2026-03-28T12:15:00Z
**Last seen**: 2026-03-28T12:30:00Z

**Details**:
```json
{ "expected": 8000, "actual": 7950, "delta": -50 }
```

---

## ✅ Recently Resolved

- Pot equals stacked bets mismatch (fixed 2026-03-28T12:30:00Z)
- Invalid card count (fixed 2026-03-28T12:30:00Z)
```

**Run Behavior:**
- Run 1: Finds chip bug → creates POKER_BUGS.md with 1 active bug
- Run 2: Still finds chip bug → marks as "Last seen now", keeps active
- Run 3: Bug is fixed → moves to "Recently Resolved" section
- Run 4: New bug found → added to active, old bug stays in resolved history

---

## Documentation

### Structure

```
docs/
├── DEPLOYMENT.md                 # Production deployment guide (Docker, migrations, scaling)
├── SECURITY.md                   # Threat model, auth controls, game integrity
├── BOT_DEVELOPER_GUIDE.md       # Bot builder UI, strategy tiers, rules, ranges
├── API.md                        # All REST endpoints and WebSocket events
├── ARCHITECTURE.md               # System design, data flow, NestJS structure
├── TESTING.md                    # Test coverage, validators, game invariants
├── [other core docs]
├── guides/
│   ├── QUICKSTART.md             # Get started in under 5 min (npm run game:watch)
│   └── DEMO-GAMES.md             # Run demo games, automated testing
└── adr/                          # Architectural decision records (keep/reference)
```

### When Making Changes

1. **New API endpoints** → Update `docs/API.md` with endpoint, auth, request/response
2. **Feature changes/removals** → Update `CLAUDE.md` with new patterns
3. **Setup/running changes** → Update `CLAUDE.md` or `guides/QUICKSTART.md`
4. **Major UI changes** → Update **GameSpectator UI Styling** section below
5. **Security decisions** → Document in `docs/SECURITY.md`
6. **Deployment changes** → Update `docs/DEPLOYMENT.md`

**✅ IMPORTANT:** Always verify markdown files need updates. No work is complete until docs are updated.

## Testing System Maintenance Rules

**RULE 1: Test Coverage After Code Changes**

Whenever modifying game logic, invariant checks, or state management:
1. Identify which validator(s) are affected
2. Run `npm run test:poker -- --games=20 --bots=6` to verify no regressions
3. If tests fail, fix the bug before committing
4. If tests pass but seemed fragile, consider strengthening that validator

**RULE 2: Bug Analysis & Validator Improvement**

When a bug is found (by users, in production, or from any source):
1. Determine which invariant **should have** caught it (or if none apply)
2. If the validator exists but missed it:
   - Analyze why (error threshold too loose? edge case? timing issue?)
   - Strengthen the validator logic or add assertions
   - Add a comment explaining the catch
3. If no validator covers it:
   - Create a new validator in `ValidatorSuite`
   - Add it to `runAll()`
   - Document the invariant in CLAUDE.md
4. Run `npm run test:poker -- --games=50 --bots=8` to verify fix catches the bug pattern

---

## Bug Fixes (2026-03-28)

### Issue 1: Chip Conservation Error After Hand Completes

**Symptom:** `assertChipConservation` was failing with "expected 4000, got 4030" after simple hands (e.g., blinds posted and everyone folds). The error showed stacks + pot exceeded expected total.

**Root Cause:** After a hand completes and pot is distributed to winners, `playerTotalBets` was not being reset. When `assertChipConservation` checked `getTotalPot()`, it returned the sum of `playerTotalBets`, which still contained the hand's bets even though those chips had been awarded to winners and were now in stacks.

**Example:**
- Hand ends: Blinds (10 + 20) posted, collected by winner
- Player stacks updated: winner receives 30 chips
- `playerTotalBets` still contains: {player1: 10, player2: 20}
- `getTotalPot()` returned 30, making total = 4000 (stacks) + 30 (pot) = 4030 (too high)

**Fix:** Reset `playerTotalBets` at the end of hand in both `awardPot()` and `showdown()` methods:
```typescript
this.potManager!.playerTotalBets = {};  // Added after pot distribution
```

**Files Modified:**
- `src/services/game/live-game-manager.service.ts` lines 590 and 644

**Test Result:** ✅ All 50 test games pass with 0 chip conservation errors

---

### Issue 2: Side Pot Validator False Positives During Betting

**Symptom:** `sidePotMathCorrect` validator was flagging every multi-player game with "Side pot math incorrect". Error showed `sumOfPots < totalBet` with deltas of 50-150 chips.

**Root Cause:** During active betting rounds, the `pots[]` array is only recalculated at specific points (end of pre-flop, flop, turn, river betting). But `playerTotalBets` accumulates ALL bets continuously. The validator ran on every `stateUpdated` event, so it would see:
- During pre-flop betting: `playerTotalBets = {p1: 50, p2: 70}` but `pots[] = []` (empty, not yet calculated)
- Result: Validator saw 120 in totalBet but 0 in sumOfPots, flagged error

**Why It Matters:** The validator's purpose is to catch bugs where pots are miscalculated, not to detect normal state during active betting.

**Fix:** Added stage check to only validate when `pots[]` is final:
```typescript
// Only validate after betting is complete (in showdown)
// During active betting, pots may be out of sync with playerTotalBets
if (game.stage !== 'showdown') {
  return []
}
```

This ensures pots have been finalized via `calculatePots()` before comparing to `playerTotalBets`.

**Files Modified:**
- `src/testing-utilities/validators.ts` lines 372-376 (added stage check)

**Test Result:** ✅ 50 games complete with 0 side pot validation errors

---

## Key Learning: Data Structure Synchronization Timing

**Problem:** Poker game state uses two representations of the pot:
1. `playerTotalBets`: Linear accumulation of all bets, updated immediately
2. `pots[]`: Structured side pot representation, recalculated at betting stage boundaries

These go out of sync during active betting, which is **normal and correct**. Validators must understand this timing:
- Don't validate intermediate states during stage transitions
- Only validate after known synchronization points (e.g., after calculatePots() or in showdown)
- Use `game.stage` to gate expensive/strict checks
- Document why a check only runs at certain stages

---

## Watch Live Game (One-Command Demo)

Simplest way to see the poker game in action with real bots playing:

```bash
npm run game:watch
```

This starts:
- ✅ Backend server (port 3000)
- ✅ Frontend React app (port 5173)
- ✅ Live game with 5 bots playing
- 🌐 Outputs URL: `http://localhost:5173/games/{gameId}`

Open that URL in your browser and watch bots play in real-time!

### How It Works

When you start a live game:

1. **Test User Creation**: An ephemeral test user is created via `AuthService.register()` with email `test{timestamp}@test.local`
2. **Bot Creation**: 5 AI bots are created in the database with valid FK references to the test user:
   - Alice, Bob, Charlie, Diana, Eve (names include timestamp for uniqueness)
   - All bots use the "quick" strategy tier
3. **Game Startup**: The game creates a GameInstance via `LiveGameManagerService` with:
   - tableId = gameId (must match for WebSocket subscription)
   - 5 starting chips for each bot
   - 5/10 blind structure
4. **WebSocket Broadcasting**: Game state updates are emitted to `table:{gameId}` room via Socket.IO
5. **Database Persistence**: All hands, actions, and game data are persisted to PostgreSQL in real-time
6. **Frontend Display**: React app at `http://localhost:5173/games/{gameId}` subscribes to WebSocket and renders live game state

**Files Involved:**
- `src/modules/testing/testing.service.ts` — Creates user, bots, and game
- `src/modules/testing/testing.controller.ts` — HTTP endpoint `/api/v1/testing/live-game`
- `src/services/game/live-game-manager.service.ts` — Manages game lifecycle and state broadcasting
- `frontend/src/hooks/useGameSocket.ts` — Frontend WebSocket hook for game state
- `frontend/src/pages/GameSpectator.tsx` — Game UI display

**Database Constraints:** All bots have `FK_bots_user` foreign key to ensure database integrity. Test data can be cleaned up after game completes.

---

## Automated Design QA System (Google Gemini + Live UI)

Real-time design and UX evaluation of the poker game interface during live gameplay. Uses Playwright to capture actual React UI screenshots and Google Gemini to analyze design quality, UX issues, and customer experience.

### Quick Start

```bash
# Ensure backend and frontend are running
npm run dev:all

# In another terminal, run design QA test
GOOGLE_API_KEY=$(grep "^GOOGLE_API_KEY=" .env | cut -d= -f2) npx ts-node src/testing-utilities/ui-design-qa.ts

# Output:
# - tmp/design-qa-screenshots/ — PNG screenshots of live poker UI
# - design-qa-report-{gameId}.md — design scores and feedback
```

**Results from test run (2026-03-28):**
- ✅ 9 real screenshots captured during live gameplay
- ✅ Design score: 7/10
- ✅ Gemini feedback: "Modern, clean aesthetic with strong dark theme. Good use of whitespace. Some elements lack sufficient contrast; visual hierarchy could be stronger."

### Architecture

**Files:**
- `src/testing-utilities/ui-design-qa.ts` — Main orchestrator: creates game, launches Playwright, captures screenshots, sends to Gemini
- `src/testing-utilities/gemini-qa-service.ts` — Calls Gemini API with PNG screenshots for design/UX analysis
- `scripts/run-ui-qa-tests.ts` — (Legacy) CLI entrypoint for older game-state-based tests

### How It Works

1. **Create Live Game**: Fetches available game from `/api/v1/preview/tables` backend API
2. **Launch Browser**: Playwright headless Chromium at 1280×800 viewport
3. **Navigate to Frontend**: Connects to React UI at `http://localhost:5173/games/{gameId}`
4. **Capture Screenshots**: Takes PNG snapshots at configurable intervals (default: 5 seconds)
5. **Gemini Analysis**: Sends each screenshot to `gemini-2.5-flash` with prompt asking for:
   - Design quality score (1-10)
   - UI strengths and improvements
   - UX issues (accessibility, clarity, flow, aesthetics, performance)
   - Customer feedback (engagement, recommendations, frustration points)
6. **Generate Report**: Creates markdown report with:
   - Game ID, duration, screenshot count
   - Design score progression across screenshots
   - Recommendations for improvement

### Configuration

```typescript
// Default configuration (30s test)
runDesignQA({
  baseUrl: 'http://localhost:3000',      // Backend API
  gameId: undefined,                      // Uses first available table
  duration: 30000,                        // Run for 30 seconds
  screenshotInterval: 3000,              // Capture every 3 seconds
})
```

### API Key Setup

Already configured in `.env`:
```
GOOGLE_API_KEY=AIzaSyCMEpBXBlo2SZTtglHaYGxRHAt34GGqDwY
```

To use in ts-node:
```bash
GOOGLE_API_KEY=$(grep "^GOOGLE_API_KEY=" .env | cut -d= -f2) npx ts-node src/testing-utilities/ui-design-qa.ts
```

### API Quota & Rate Limiting

**Free Tier Limits:**
- 20 requests/day per model
- Resets daily at midnight UTC

**Graceful Degradation:**
- If quota exceeded, system continues capturing screenshots
- Logs warnings but doesn't crash
- Report shows partial results

**Production:** Use paid Google Cloud project for unlimited access

### Return Type

```typescript
export interface DesignQAResult {
  gameId: string
  duration: number                // Total test duration in ms
  screenshots: number             // Number of screenshots captured
  designScores: number[]         // Score for each screenshot analyzed
  averageScore: number           // Average design score (1-10)
  improvements: string[]         // Collected improvement suggestions
  customerSentiment: string      // Overall customer experience sentiment
  reportPath: string             // Path to generated markdown report
}
```

### Sample Report Output

```markdown
# Design & UX Review Report

**Game ID**: 8c14d493-f741-4057-9a91-df240fcfc0e2
**Duration**: 30s
**Screenshots**: 9
**Average Design Score**: 7/10

## Design Quality Progression
- Screenshot 1: 7/10
- Screenshot 2: [no analysis - quota hit]
- ...

## Recommendations
- Focus on responsive design for different screen sizes
- Ensure color contrast meets WCAG AA standards
- Test with real players for UX feedback
- Monitor animation performance on slower devices
```

### Key Differences from Game State Analysis

| Old System (game state JSON) | New System (live UI screenshots) |
|---|---|
| Analyzed game logic & state values | Analyzes actual React UI rendering |
| No visual rendering | Real Playwright screenshots at 1280×800 |
| Detected logic bugs | Detects design & UX issues |
| ~80 API calls per 10 games | ~9-10 API calls per game test |
| Game simulator needed | Only needs running backend/frontend |

---

## Automated UI Bug Detection (Gemini + Playwright Screenshots)

**Real-time bug detection during live gameplay.** Takes screenshots during live games, sends them to Google Gemini, analyzes for UI bugs, and generates bug reports automatically.

### Quick Start

```bash
# Automatically creates a game, captures screenshots, detects bugs
bash scripts/detect-ui-bugs.sh

# Or manually run with custom game ID
npx ts-node src/testing-utilities/ui-bug-reporter.ts <gameId> <gameUrl> <duration_ms>
```

### What It Does

1. **Creates a live poker game** with 5 bots
2. **Opens browser** via Playwright headless (1280×800 viewport)
3. **Captures screenshots** every 3 seconds for 30 seconds during gameplay
4. **Sends each screenshot to Gemini** with bug-detection prompt
5. **Analyzes for:**
   - Missing/broken UI elements
   - Incorrect data displays (pot, chips, positions)
   - Layout issues (overlap, misalignment)
   - Color/contrast problems
   - Animation/rendering glitches
   - Text overflow or truncation
6. **Generates reports** saved to `ui-bug-reports/*.md` and `.json`

### Example Bugs Found

**Real bugs detected by Gemini:**
- 🔴 CRITICAL: "Pot display shows '0.00' despite active game with blinds/cards dealt"
- 🟠 HIGH: "Players Left shows '2/5' but should be '4/5' based on active chip stacks"
- 🟡 MEDIUM: Layout misalignment issues
- 🟢 LOW: Minor UI improvements

### Architecture

**Files:**
- `src/testing-utilities/ui-bug-reporter.ts` — Main orchestrator (Playwright automation)
- `src/testing-utilities/ui-bug-detector.ts` — Calls Gemini API, analyzes screenshots, generates reports
- `scripts/detect-ui-bugs.sh` — CLI wrapper

**Output:**
- `ui-bug-reports/bugs-{gameId}-{timestamp}.md` — Detailed bug report
- `ui-bug-reports/bugs-{gameId}-{timestamp}.json` — Structured data
- `tmp/bug-detection-screenshots/{gameId}/` — PNG screenshots
- `POKER_BUGS.md` — **Central tracking file** (auto-updated with all discovered bugs, deduped, grouped by severity)

### POKER_BUGS.md - Central Bug Tracking

The `POKER_BUGS.md` file is **automatically maintained** by the Gemini bug detection system:

**Features:**
- ✅ **Auto-populated** — Each bug detection run adds new bugs (no duplicates)
- ✅ **Grouped by severity** — Critical, High, Medium, Low sections
- ✅ **Deduped** — Duplicate bug titles are skipped
- ✅ **Rich details** — Full bug description, reproduction steps, expected vs actual behavior
- ✅ **Timestamped** — Shows when each bug was detected

**Format:**
```markdown
# Poker Game - Known Bugs & Issues
_Auto-updated by Gemini QA system_

## 🔴 Critical (N bugs)
### 1. Bug Title
- Severity: critical
- Category: rendering
- Location: pot display area
- Description: ...
- Steps to Reproduce: ...

## 🟠 High (N bugs)
...
```

**Usage:**
1. Run bug detection: `bash scripts/detect-ui-bugs.sh`
2. Check `POKER_BUGS.md` for discovered issues
3. Fix bugs in code
4. Re-run detection to validate fixes (bugs should disappear)
5. Use POKER_BUGS.md as a dashboard of known issues

### Quota Limits

**Free tier:** 20 requests/day per model (gemini-2.5-flash)
- 9 screenshots captured × 20 request limit = limited testing
- **For production:** Use paid Google Cloud project for unlimited access

### Bug Analysis Feedback Loop

When Gemini misses bugs or finds false positives:

1. **Note the missed/false bug** in the detection report
2. **Analyze why:**
   - Was the prompt unclear?
   - Did screenshot quality matter?
   - Was context missing from the game state?
3. **Improve the prompt** in `ui-bug-detector.ts` (lines 46-76)
4. **Re-test** with `bash scripts/detect-ui-bugs.sh`
5. **Document** improvements in this section

### Cursor Rules (Memory)

Two maintenance rules apply to UI testing:

1. **[Testing system maintenance](memory/feedback_testing_system.md)** — Check test coverage on code changes, improve validators when bugs slip through

2. **[UI QA Process Analysis](memory/feedback_ui_qa.md)** — When UI bugs found, analyze why Gemini validator missed them and improve detection

When UX issues are discovered:
1. Run design QA test to establish baseline score
2. Make UI improvements
3. Re-run test to verify design score improved
4. If Gemini missed issues: strengthen analysis prompt or add context

---

## Tournament Discovery & Registration (NEW - April 2026)

Complete tournament discovery and real-time registration flow with WebSocket-based live updates.

### Pages & Components

**Frontend Pages:**
- `frontend/src/pages/TournamentsPage.tsx` — Tournament discovery/listing with grid layout, filtering, sorting
- `frontend/src/pages/TournamentDetailPage.tsx` — Tournament details, participant list, live registration, real-time updates
- `frontend/src/pages/TournamentLobbyPage.tsx` — Tournament lobby/waiting room with countdown timer and live player list
- `frontend/src/pages/TournamentLivePage.tsx` — Live tournament game viewing with split-screen layout (GameSpectator + tournament context)
- `frontend/src/pages/TournamentResultsPage.tsx` — Final standings with podium visualization and full leaderboard
- Related components in `frontend/src/components/tournaments/`
  - `BotSelectionModal.tsx` — Modal for selecting bot to register
  - `TournamentCard.tsx` — Reusable tournament card component
  - `CountdownTimer.tsx` — Countdown timer component with visual feedback
  - `TournamentContext.tsx` — Sidebar showing tournament meta-info during live play
  - `Podium.tsx` — Visual podium component for top 3 finishers
  - `ResultsTable.tsx` — Full leaderboard table with all results

**Routes:**
- `GET /tournaments` → TournamentsPage
- `GET /tournaments/:id` → TournamentDetailPage
- `GET /tournaments/:id/lobby` → TournamentLobbyPage (after user joins)
- `GET /tournaments/:id/live` → TournamentLivePage (during tournament play)
- `GET /tournaments/:id/results` → TournamentResultsPage (after tournament ends)

### Real-Time Updates (Socket.IO)

**Frontend Hooks:**
- `frontend/src/hooks/useTournamentSocket.ts` — WebSocket connection to `/tournament` namespace (detail page)
  - Auto-reconnect with exponential backoff (5 attempts, 1s→5s)
  - Type-safe event handling for tournament updates
  - Real-time state syncing
  - Returns: connectionStatus, latestUpdate, playerUpdates, notifications

- `frontend/src/hooks/useTournamentLobby.ts` — WebSocket connection for tournament lobby/waiting room
  - Subscribes to `tournament:{tournamentId}` room
  - Tracks registered players in real-time
  - Monitors tournament status changes
  - Auto-triggers callback when tournament starts (status → "running")
  - Returns: connectionStatus, registeredPlayers[], currentPlayerCount, isConnected, tournamentStatus, error

**Lobby Workflow:**
1. User joins tournament from detail page → redirects to `/tournaments/:id/lobby`
2. TournamentLobbyPage mounts and calls useTournamentLobby hook
3. Hook connects to Socket.IO and subscribes to tournament room
4. Real-time player list updates as others join (via `tournament_player_action` events)
5. Countdown timer displays time until scheduled start
6. When tournament status becomes "running", onTournamentStarted callback fires
7. Page auto-navigates to `/tournaments/:id/live`

**Events:**
- `subscribe_tournament { tournamentId }` — Client joins room
- `tournament_state_updated { registered_count, status, ... }` — State change
- `tournament_player_action { action, botName, ... }` — Player joined/busted
- `tournament_notification { type, message }` — Blind increases, milestones

### Features

- ✅ **Discovery**: Browse upcoming tournaments with grid layout
- ✅ **Filtering**: Sort by start time or participant count
- ✅ **Details**: Full tournament info with participant list
- ✅ **Registration**: Select bot and join with modal confirmation
- ✅ **Lobby**: Waiting room with countdown timer and live player updates
- ✅ **Auto-Redirect**: Automatically navigate to live game when tournament starts
- ✅ **Live Viewing**: Watch your bot play in live tournament with split-screen layout
  - Full game table on left (GameSpectator)
  - Tournament context sidebar on right
  - Auto-updates tournament info every 10 seconds
  - Shows current table #, seat position, remaining players, blind level
  - Graceful handling of elimination
- ✅ **Final Results**: View tournament results with ceremonial podium and full leaderboard
  - Podium visualization for top 3 finishers (gold/silver/bronze)
  - Prize payouts displayed for paid positions
  - Full leaderboard table for all participants
  - User's result highlighted and easy to find
  - Shareable results page design
- ✅ **Real-Time**: Live participant count, notifications, activity log
- ✅ **Status Indicators**: Connection status (🟢 Live, 🟡 Connecting, 🔴 Error)
- ✅ **Leave Tournament**: Ability to leave tournament during registration phase
- ✅ **Access Control**: Only registered players watch live games (frontend prep)
- ✅ **Responsive**: Mobile/tablet/desktop support

### Backend Implementation (Live Tournament Viewing & Results - COMPLETE)

**Completed:**
- ✅ `GET /tournaments/:id/my-current-table` endpoint
  - Returns: `{ tableId, tableNumber, seatPosition, remainingPlayers, currentBlindLevel, gameId }`
  - Requires: JWT auth
  - Logic: Finds user's active tournament seat, joins with table info, returns 404 if eliminated
  - Location: `src/modules/tournaments/tournaments.controller.ts`

- ✅ `GET /tournaments/:id/results` endpoint (PUBLIC)
  - Returns: `{ tournamentId, tournamentName, finishedAt, totalEntries, results[] }`
  - Each result: `{ rank, botId, botName, userId, userName, finishPosition, payout, bustLevel }`
  - Requires: Tournament must be finished (status = "finished")
  - Location: `src/modules/tournaments/tournaments.controller.ts`

**Methods Added:**
- `tournaments.service.ts`: `findUserCurrentTable(tournamentId, userId)` — finds current table/seat info
- `tournaments.service.ts`: `finalizeTournament(tournamentId)` — calculates final positions and payouts
- `tournaments.service.ts`: `getCompleteResults(tournamentId)` — returns results with user info
- `tournament.repository.ts`: `findUserCurrentSeat(tournamentId, userId)` — queries active seat with table/bot/user relations
- `tournament.repository.ts`: `countActivePlayers(tournamentId)` — counts remaining non-busted players

**Payout Calculation:**
- Top 10% of players receive payouts (minimum 3, maximum 50%)
- Distribution: 1st place 30%, 2nd place 20%, 3rd place 15%, 4th+ weighted fairly
- Prize pool = total_entries × buy_in_amount
- Payouts stored in tournament_entries.payout column

### Backend Requirements (Still TODO)

**Access Control:**
- Add `isUserRegistered()` method to TournamentsService
- Add access check to `GamesController.getGame()` — throw 403 if not registered

**Real-Time Broadcasting:**
- Create `TournamentsGateway` (Socket.IO gateway) in `src/modules/tournaments/`
- Add to `TournamentsModule` providers
- Call broadcast methods when:
  - Player joins: `broadcastPlayerAction('joined', ...)`
  - Player busts: `broadcastPlayerAction('busted', ...)`
  - Blinds increase: `broadcastNotification('blind_increase', ...)`
  - Status changes: `broadcastTournamentStateUpdate(...)`

See: `TOURNAMENT_REALTIME_BACKEND.md` for complete implementation guide (copy-paste ready code provided)

### Testing Strategy

See: `docs/TESTING.md` - Tournament Testing section (added)
And: `TOURNAMENT_TESTING.md` - Comprehensive test suite

### Documentation

- `TOURNAMENT_SOLUTIONS_SUMMARY.md` — Overview of both issues & solutions
- `TOURNAMENT_ARCHITECTURE.md` — Full design with diagrams, real-time flow
- `TOURNAMENT_REALTIME_BACKEND.md` — Backend implementation guide with code
- `TOURNAMENT_IMPLEMENTATION_CHECKLIST.md` — Step-by-step tasks
- `TOURNAMENT_QUICK_START.txt` — Quick reference guide
- `TOURNAMENT_TESTING.md` — Comprehensive test suite (unit, integration, e2e)

---

## Finance Module

### Wallet & Transaction System

**Module:** `src/modules/finance/`

Provides persistent wallet balances and an immutable transaction ledger for every user.

**Entities:**
- `wallets` — one per user, `balance` bigint with DB-level `CHECK >= 0`
- `transactions` — append-only ledger, amount always positive, `type` determines direction

**Endpoints (all under `/api/v1/finance`):**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/wallet` | User | Get own wallet |
| POST | `/wallet` | User | Create wallet |
| POST | `/deposit` | User | Deposit funds |
| POST | `/withdraw` | User | Withdraw funds |
| GET | `/transactions` | User | List own transactions (paginated) |
| GET | `/wallet/:userId` | Admin | Get any user's wallet |
| GET | `/transactions/:userId` | Admin | List any user's transactions |

**Key invariant:** Every balance change wraps UPDATE wallet + INSERT transaction in a single Postgres transaction.

**Swagger docs:** Available at `http://localhost:3000/api/docs`

### Matchmaking Orchestrator

**Module:** `src/modules/matchmaking/`

Daily tournament lifecycle with 3 cron jobs (UTC):

| Time | Job | Action |
|------|-----|--------|
| 08:00 | `createDailyMasterTournament` | Creates "Daily Master YYYY-MM-DD", auto-registers all active premium users |
| 20:55 | `lockAndCreatePods` | Locks registrations, calculates DailyPool (60% monthly revenue / 30), Fisher-Yates shuffles players, splits into pods, bulk inserts TournamentPod records |
| 21:00 | `executePods` | Passes clean PodID list to TournamentDirector for Worker Thread execution |

**Prize Distribution:**
- `PrizeDistributionService` listens to `tournament.podFinished` events (decoupled from GameEngine)
- 15% of field gets paid (ITM), steep curve: 1st 30%, 2nd 20%, 3rd 15%, rest split
- Atomic payouts via `dataSource.transaction()` — credits wallets + updates tournament entries

**Events emitted:**
- `matchmaking.masterCreated` — daily tournament created
- `matchmaking.podsCreated` — pods created after shuffle/split
- `matchmaking.executionStarted` — pods dispatched to TournamentDirector
- `matchmaking.podPaidOut` — payouts complete for a pod
- `matchmaking.cancelled` — tournament cancelled (insufficient players)

**User subscription fields (on User entity):**
- `subscription_status`: `"free"` | `"active"` | `"cancelled"` | `"expired"`
- `subscription_start`, `subscription_end`: timestamps
- `monthly_fee`: bigint

**TournamentPod entity (`tournament_pods` table):**
- Links to master tournament, tracks pod_number, status, prize_pool, player_count, winner_bot_id
- Statuses: `pending` → `running` → `finished` (or `cancelled`)

**Migration:** `1744000000000-AddFinanceAndMatchmaking.ts`

---

## Bot Logic Auditor (Decision Engine Sanity Suite)

Injects synthetic `BotPayload` directly into the strategy engine and asserts that returned actions are logically sound — no database, no NestJS, no live game required.

### Command
```bash
npm run audit:bots
```

Sample output:
```
✓ PASS  The Shark            6/6 checks
⚠ WARN  The Nit              5/6 checks
  [FLAG] neverCallZeroEquity @ neverCallZeroEquity
         Action taken: {"type":"call"}
         Bot called with equity=24.7% vs potOdds=70.0% — deeply negative EV
```

Exit code 0 = all clean (or only strategy warnings), 1 = illegal-move violation(s) found.

### Architecture

| File | Purpose |
|------|---------|
| `src/testing-utilities/bot-auditor.ts` | `BotAuditor` class — 6 scenarios, 6 assertions, pure TS |
| `scripts/audit-bots.ts` | CLI entry point — runs all 8 personality presets, prints report |

### 6 Scenarios

**Illegal Move Checks (hard failures — exit code 1):**
1. `neverFoldOnCheck` — canCheck=true → bot MUST NOT fold (fold-for-free is illegal)
2. `minRaiseCompliance` — any raise amount must be >= minRaise
3. `neverFoldAllIn` — player with chips=0 MUST NOT fold (nothing left to surrender)

**Strategy Sanity Checks (warnings — non-fatal flags):**
4. `neverCallZeroEquity` — equity=24.7% vs potOdds=70% = deeply negative EV → should fold
5. `strongHandValidation` — Full House KKKAA on river, small bet → MUST NOT fold
6. `potOddsAwareness` — Nut flush draw (~56% equity) vs 16.7% pot odds → MUST NOT fold

### How It Works

Per (bot × scenario):
1. `getOrHydrateStrategy(strategy)` → HydratedStrategy (uses existing hydration cache)
2. `evaluateHydrated(hydrated, payload)` → StrategyEvaluation
3. `buildGameContext(payload)` → GameContext (for equity, potOdds)
4. Each assertion function inspects `(payload, action, context)` and returns `{ passed, message }`

---

## Automated Poker Logic Validator

Offline audit service that reads completed hands and flags logic errors — fully read-only on game data.

### Command
```bash
npm run audit:games                         # default: batch=1000, concurrency=200
npm run audit:games -- --batch=500 --concurrency=100
```
Sample output:
```
Audited 10,000 hands. Found 3 chip leak(s) and 1 winner-calculation error(s).
Details stored in the logic_bugs table. Failing hands flagged with validation_error = true.
```
Exit code 0 = clean, 1 = bugs found (CI-friendly), 2 = fatal error.

### Architecture
- **No NestJS runtime** — standalone `DataSource`, runs with `ts-node`.
- **Batch + Promise.allSettled** — pages through hands (`--batch`), processes each page in concurrent chunks (`--concurrency`).
- **Idempotent** — re-runs do not double-count bugs (`orIgnore()` on insert).

### New files
| File | Purpose |
|---|---|
| `src/migrations/1744100000000-AddValidationSchema.ts` | Adds `hands.validation_error` column + `logic_bugs` table |
| `src/entities/logic-bug.entity.ts` | TypeORM entity for `logic_bugs` |
| `src/services/audit/game-validator.service.ts` | `GameValidatorService` — all 12 checks |
| `scripts/audit-games.ts` | CLI entry point |

### Modified files
| File | Change |
|---|---|
| `src/entities/hand.entity.ts` | Added `validation_error: boolean` column |
| `src/entities/index.ts` | Exported `LogicBug` entity |
| `package.json` | Added `audit:games` script |

### 18 invariant checks
**Hand-level (16)**
1. `no_duplicate_cards` — no card (rank+suit) appears more than once across hole cards + board
2. `seed_replay` — re-derives deck order from server/client seeds; verifies SHA256(serverSeed) and deck_order match
3. `street_progression` — action_seq ordering: preflop < flop < turn < river
4. `action_sequence` — folded/all-in player does not appear in later actions
5. `pot_matching` — sum(hand_players.amount_bet) === hand.pot (skipped when amount_bet unpopulated)
6. `zero_sum` — sum(start_chips) === sum(end_chips) (rake = 0)
7. `side_pot_eligibility` — all-in player cannot win more than X × count(players with bet ≥ X)
8. `odd_chip_rule` — in split pots, remainder chip(s) go to earliest-position winner clockwise from dealer
9. `min_raise` — every raise delta ≥ lastRaiseDelta (all-ins exempt via chips_after=0)
10. `showdown_fairness` — HandEvaluator re-calculates winners from hole cards + board; must match recorded winners
11. `winner_amounts` — sum(amount_won where won=true) === hand.pot; won=true implies amount_won > 0
12. `duplicate_action_seq` — no two actions share the same action_seq within a hand
13. `blind_structure` — blinds posted before non-blind actions; BB = 2× SB; no player posts both in 3+ player game
14. `chip_continuity` — end_chips of hand N equals start_chips of hand N+1 for same player/game (SQL-based)
15. `win_rate_anomaly` — bot wins > 85% of hands in a game (min 5 hands; SQL-based statistical check)
16. `zero_response_time` — non-blind action with response_time_ms = 0 (SQL-based; column must exist)

**Pod-level (2)**
17. `itm_count` — finished pods pay exactly `max(1, floor(player_count × 0.15))` players
18. `prize_pool_match` — sum of `type='payout'` transactions for a pod === pod.prize_pool

### Schema
```sql
-- New column
ALTER TABLE hands ADD COLUMN validation_error BOOLEAN NOT NULL DEFAULT FALSE;

-- New table
CREATE TABLE logic_bugs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id     VARCHAR(36) REFERENCES hands(id) ON DELETE CASCADE,  -- nullable for pod-level bugs
  check_name  VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}',   -- full hand snapshot + discrepancy values
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Query examples
```sql
-- Bug breakdown by type
SELECT check_name, count(*) FROM logic_bugs GROUP BY check_name ORDER BY count DESC;

-- All hands with errors
SELECT id, game_id, hand_number FROM hands WHERE validation_error = true;

-- Full details for a specific check
SELECT description, details FROM logic_bugs WHERE check_name = 'zero_sum' LIMIT 5;
```

---

## Admin Dashboard

**Route:** `/admin` — accessible only when `user.role === 'admin'`. Redirects non-admins to `/`.

**Frontend:** `frontend/src/pages/AdminDashboard.tsx`
- Split-view: Left panel (400px) = active/registering tournaments list; Right panel = quick actions
- **Create Tournament** form: table size (2/3/6/9), speed (Slow=10s/Fast=3s timeout), buy-in, name
- **Bot Injector**: "Add Bots" button per registering tournament → injects system bots
- **GO LIVE**: Force-start button → calls existing `POST /tournaments/:id/start`
- **User & Bot Monitoring**: table of all non-admin users with active bot counts
- **Reset State**: two-click confirm → cancels all registering tournaments
- Sidebar shows "Admin" nav item only when `user.role === 'admin'`

**New Backend Endpoints** (all `@Roles('admin')` in `tournaments.controller.ts`):
- `POST /api/v1/tournaments/admin/inject-bots/:id` — inject system bots into registering tournament
- `GET  /api/v1/tournaments/admin/users-summary` — users with active bot counts (SQL aggregation)
- `POST /api/v1/tournaments/admin/reset-state` — cancel all registering tournaments

**Service methods added** (`tournaments.service.ts`):
- `injectSystemBots(tournamentId)` — bypasses ownership check, inserts system bots directly via `createEntry()`
- `getUsersWithBotCounts()` — raw SQL via `DataSource`
- `resetDevState()` — raw SQL UPDATE

---

## Changelog

### 2026-04-05: Pro Table Balancing + Replay Audit Trail

**Continuous table balancing, position equity seating, persistent move log, and admin UI.**

#### Continuous Table Balancing (`tournament-director.service.ts`)
- `checkTableBalancing()` now triggers whenever `maxTable.size - minTable.size > 1` — not just at the old `BREAK_THRESHOLD=4`
- Full table break still occurs when `minTable.size < 2` (can't run a hand)
- New `movePlayerForBalancing(fromTableId, toTableId)` method: moves exactly ONE player (largest stack first, respects owner isolation) from the biggest table to the smallest

#### Position Equity (`live-game-manager.service.ts`)
- `addPlayer()` and `addPlayerImmediate()` accept an optional `insertAt?: number` parameter
- When provided, uses `players.splice(insertAt, 0, newPlayer)` and adjusts `dealerIndex` if necessary
- `movePlayerForBalancing()` calculates `bestSeat = (dealerIndex + 2) % N` — inserting at the current BB's position gives the incoming player N hands before being forced to post again
- `breakTable()` also uses position equity for all redistributed players

#### Replay Audit Trail — `tournament_events` table
- New entity: `src/entities/tournament-event.entity.ts` — `TournamentEvent` with `EVENT_TABLE_MOVE` constant
- New migration: `1744600000000-AddTournamentEvents.ts`
- Schema: `id, tournament_id, event_type, bot_id, from_table_id, to_table_id, from_seat, to_seat, chips_at_move, created_at`
- Both `movePlayerForBalancing()` and `breakTable()` call `persistTableMoveEvent()` to write DB records
- Old logger-only audit log retained alongside persistent records

#### Admin API + UI
- `GET /api/v1/tournaments/admin/:id/balancing-moves` — returns recent TABLE_MOVE events (admin only, limit param)
- `AdminDashboard.tsx`:
  - `BalancingMovesPanel` component: shows move log with time, from/to table+seat, chips; auto-refreshes every 10s
  - "⚖ Balancing Active" badge in telemetry panel when `tables.length > 1`
  - "⚖ Moves" button in tournament row (live tournaments with >1 table)
  - Seeding Map auto-refreshes every 15s for running tournaments
  - "LIVE" badge on seeding map header when tournament is running

#### Tests (`tests/unit/tournament-balancing.spec.ts`)
- 23 tests covering: `checkBalancingDecision` (8 cases), `calcBestSeat` (5 cases), owner isolation selection (4 cases), `hasDuplicateOwner` (3 cases)
- Regression test: confirms old BREAK_THRESHOLD=4 is no longer required for a balance move

---

### 2026-04-05: Tournament Engine & Admin Visualization Pass

**Three pillars: betting raise cap, snake seeding with owner isolation, admin seeding map.**

#### Betting Raise Cap (`src/domain/betting.ts`)
- `export const MAX_RAISES_PER_STREET = 5` — exported constant
- `BettingRound` tracks `raisesThisStreet`; incremented on every successful raise/bet
- `canReraise()` and `getValidActionsForPlayer()` block further raises once cap hit
- Players forced to call or fold after 5 raises per street

#### Snake Seeding + Owner Isolation (`src/modules/tournaments/tournament-director.service.ts`)
- `BotInfo` gains `userId: string` (from `entry.bot.user.id`) and `elo: number`
- `fetchBotElos()`: batch `BotStats.tournament_wins` query for all entrants
- `createInitialTables()` now: sort by ELO → snake-seed → greedy owner-isolation pass
- **Snake algorithm:** endpoints are double-visited (classic draft snake); endpoints receive two consecutive picks when direction reverses. Produces even table sizes.
- **Owner isolation:** greedy swap — scans other tables for a conflict-free swap candidate; logs a warning if isolation is impossible (e.g. one user owns >50% of seats)
- `seatsPerTable` getter reads `this.config.players_per_table ?? 9` — **fixes bug** where a 6-max tournament with 8 players created 1 table instead of 2 (hardcoded `SEATS_PER_TABLE=9` was used everywhere)
- `breakTable()` uses `this.seatsPerTable` for capacity checks + prefers tables with no same-owner bots (secondary sort key)

#### Admin Seeding Map (`GET /api/v1/tournaments/:id/seeding-map`, `AdminDashboard.tsx`)
- Admin-only endpoint returns tables with seat data (botName, ownerName, userId, elo)
- **Fairness Score** = standard deviation of mean ELO across tables (σ)
- SQL filters `tt.status = 'active'` — broken tables excluded as tournament progresses
- `TournamentSeedingMap` React component: color-coded owner rings (deterministic HSL from userId hash), per-table seat cards with bot initials + win count, fairness score badge
- **"🗺 Seeding" button** on every registering/live tournament row in the admin left panel

#### Tests (`tests/unit/`)
- `betting-raise-cap.spec.ts` — 10 tests: cap constant, blocked raises, call/fold still allowed, cap is per-street, `canReraise` false after cap, exact count
- `tournament-seeding.spec.ts` — 17 tests: `seatsPerTable` resolution (regression guard for the 6-max bug), `hasDuplicateOwner`, snake algorithm correctness (even distribution, endpoint double-visit), owner isolation (no conflicts, conservation, cross-table resolution)

---

### 2026-04-04: Professional Selector — CustomSelect Upgrade

**Upgraded `CustomSelect` with dynamic width, real-time search, two-column grid, and elevated polish. No callers changed.**

**Modified Files:**
- `frontend/src/components/CustomSelect.tsx` — full rewrite with:
  - **Dynamic width**: Dropdown uses `minWidth: '100%'`, `width: max-content`, `maxWidth: 480` — always at least as wide as the trigger, expands for long options, capped at 480px
  - **Auto search bar**: When total options > 8, a sticky search input appears at top of dropdown (zinc-800 bg, no border, auto-focuses). Filters list in real-time as user types. Resets on open.
  - **Two-column grid**: When flat `options` count > 8 (e.g. Hand Strength with 10 values), renders in a `1fr 1fr` CSS grid
  - **Category header polish**: Group headers now have a subtle dark background (`rgba(0,0,0,0.35)` pill) to anchor the eye
  - **Option padding**: Increased horizontal padding to 16px (was 14px) on all options
  - **Elevation**: `maxHeight` raised to 400px (was 300px); `boxShadow` upgraded to `shadow-2xl` equivalent; `backdrop-blur` increased to 16px; scrollbar color changed to Zinc-700 (`#3f3f46`)

**Behavior by use case:**
- Field selector (grouped, 19 options): search ON, 2-col OFF (group headers preserved single-column)
- Hand Strength value picker (flat, 10 options): search ON, 2-col ON
- Operator selector (flat, 8 options): search OFF, 2-col OFF (≤8 threshold)

### 2026-04-04: Simulation History — Delete & Clear History

**Delete functionality for the Past Simulations list.**

**New API endpoint:**
- `DELETE /api/v1/simulations/:id` — 204 No Content; ownership-checked (user_id guard in repository)

**Files Modified:**
- `src/repositories/simulation.repository.ts` — Added `deleteById(id, userId)` using TypeORM `delete()` with ownership guard
- `src/modules/simulations/simulations.service.ts` — Added `remove(id, userId)` with NotFoundException
- `src/modules/simulations/simulations.controller.ts` — Added `@Delete(':id')` endpoint
- `frontend/src/pages/SimulationsPage.tsx`:
  - New state: `confirmDeleteId` (inline confirmation per row), `clearConfirm` (two-click guard for Clear History)
  - New `deleteSimulation(id)`: calls API, removes from state, applies Always-On fallback (auto-selects next sim if deleted sim was selected), cleans up compare state
  - New `clearAllSimulations()`: only deletes COMPLETED/FAILED, preserves PENDING/RUNNING
  - Per-row trash icon (Lucide `Trash2`) visible on hover → click once shows "Confirm?" in red → confirm to delete; hover-away cancels
  - "Clear History" button in section header → two-click confirm pattern

---

### 2026-04-04: Simulation Sandbox — Equity Curve, Tooltip Unification & Winning Highlight

**Three polish improvements to the Simulation Sandbox (`SimulationsPage.tsx`):**

**1. Overlaid Equity Curve (Compare Mode)**
- Workers now sample cumulative profit every 100 hands into a `profitCurve: number[]` array (index 0 = hand 0, last entry = final profit)
- Stored in `simulation_results.profit_curve` (JSONB, defaults to `[]` for old runs)
- Rendered via recharts `LineChart` in `ComparePanel` — Run A cyan (#06b6d4), Run B orange (#f97316)
- Custom tooltip shows hand #, profit A, profit B, and Δ B−A
- Gracefully shows "No curve data — re-run both simulations" for old simulations

**2. Unified Tooltip (`ActionTooltip` component)**
- New inline `ActionTooltip` component matching the `MyBots.tsx` hover-tooltip pattern (dark card, border, 11px text, no `title=` attribute)
- Applied to: Re-run (↺) button and Compare checkbox in simulation list rows

**3. Winning Highlight in Compare Table**
- Each metric row in `ComparePanel` detects the winning value per `higherIsBetter` flag
- Winner gets `boxShadow: '0 0 0 1px rgba(29,158,117,0.5)'` + subtle green background

**Files Modified:**
- `src/workers/simulation.types.ts` — Added `profitCurve: number[]` to `HandSimulationOutput`
- `src/workers/simulation-hand-worker.ts` — Sample every 100 hands + final value
- `src/entities/simulation-result.entity.ts` — Added `profit_curve` JSONB column
- `src/migrations/1745000000000-AddProfitCurveToSimulations.ts` — New migration (run ✅)
- `src/repositories/simulation.repository.ts` — Added `profitCurve` to `saveResult()`
- `src/modules/simulations/simulations.service.ts` — Passes `output.profitCurve` to `saveResult()`
- `frontend/src/pages/SimulationsPage.tsx` — Chart, tooltip, highlight

---

### 2026-04-04: Scenario Lab — Visual Strategy Workbench

**Single-hand scenario editor that lets users construct any poker hand and see exactly how a bot reasons through the decision.**

**New Files:**
- `src/modules/bots/dto/scenario.dto.ts` — Validated DTO: `holeCards[2]`, `communityCards[0-5]`, `position`, `pot`, `toCall`, `minRaise`, optional `currentAction`
- `frontend/src/pages/ScenarioLabPage.tsx` — Full workbench UI: board editor, hand editor, game state inputs, CardPicker modal, decision output panel, action tendencies bars, Bot's Reasoning text

**Modified Files:**
- `src/modules/bots/bots.service.ts` — Added `evaluateScenario(botId, userId, dto)`: loads bot, hydrates strategy via `getOrHydrateStrategy`, runs `evaluateHydrated` 20× with random seeds, returns primary decision + distribution
- `src/modules/bots/bots.controller.ts` — Added `POST :id/scenario` route (JWT auth required)
- `frontend/src/App.tsx` — Added `/scenario-lab` route
- `frontend/src/components/Sidebar.tsx` — Added "Scenario Lab" nav entry with workbench icon

**API Endpoint:**
```
POST /api/v1/bots/:id/scenario
Body: { holeCards, communityCards, position, pot, toCall, minRaise, currentAction? }
Response: { primaryAction, source, explanation, handNotation?, ruleId?, distribution }
```

**Distribution:** 20 evaluations with random seeds give a meaningful action-tendency distribution (especially revealing for personality-tier bots where the seeded PRNG affects choices).

**UI:** Two-panel workbench — Setup (left, 440px) + Results (right, flex). CardPicker modal renders all 52 cards as 13×4 grid with already-selected cards greyed out. Results show: large action badge with color coding, source chip (Range Chart / Rule Match / Personality / Position Override), animated probability bars, monospace reasoning text box.

---

### 2026-04-04: Tier 3 Range Chart — Position Tabs, Default Behavior & Stats

**Position-specific range charts and "unset = Fold" clarity for Pro tier bots.**

**Modified Files:**
- `frontend/src/components/builder/RangeChart.tsx` — Full rewrite:
  - **Position Tab Bar**: `Global | UTG | HJ | CO | BTN | SB | BB` tabs (only shown in Tier 3/Pro mode). Cyan dot indicator on tabs with custom data. Tab switches reset pending paint state.
  - **Inheritance indicator**: When a position tab has no data, shows an info box: "Inheriting from Global — paint any cell to create a [POS]-specific override".
  - **New props**: `positionalRanges?: Partial<Record<RangePosition, RangeChart>>` and `onPositionalChange?: (pos, chart) => void`. Component is backward-compatible (no position props = Tier 2 behavior unchanged).
  - **Stats — Unset = Fold**: Stats now count null/unset cells as Fold so total always = 100% of 1326 combos. Segmented progress bar shows Raise/Call/Fold as colored segments.
  - **"F" watermark on unset cells**: Unset cells render grey with a muted "F" label (instead of `·`) to make the default-fold behavior visually clear.
  - **Default behavior label**: Legend shows "Unset cells default to: Fold".
  - **Flush on tab switch**: Pending paint changes are flushed before switching position tabs.
- `frontend/src/pages/BotBuilder.tsx`:
  - Added `RangePosition` type and `positionOverrides` field to local `BotStrategy` interface.
  - Wired `positionalRanges` and `onPositionalChange` props to `RangeChartComponent`.
  - Added `positionOverrides` to all 3 save payload locations (unmount flush, auto-save timer, explicit save) for Pro tier bots.
- `docs/BOT_DEVELOPER_GUIDE.md` — Updated Range Chart and Position Overrides sections with new behavior.

**Engine:** No changes needed. `strategy-engine.service.ts` already reads `positionOverrides[pos].rangeChart` and falls back to `base.rangeChart` (lines 108–124). Tier 1/2 bots fully unaffected.

---

### 2026-04-04: Contact Support Page + Shared Sidebar Refactor

**New `/support` page surfaces the existing `POST /api/v1/contact` backend endpoint. Sidebar extracted from all pages into a single shared component.**

**New Files:**
- `frontend/src/components/Sidebar.tsx` — Shared sidebar component. Uses `useSidebarStore` internally (no props needed). Contains the full NAV array (all 7 routes including Support), NAV_ICONS, logo, user dropdown. Import as `import { Sidebar } from '../components/Sidebar'` and use as `<Sidebar />`.
- `frontend/src/pages/SupportPage.tsx` — Contact form at `/support`: pre-filled Name+Email (from auth), Subject dropdown (Bug Report / Feature Request / Strategy Inquiry / Other), Message textarea with char counter (max 1000), loading spinner on submit, success Thank You state, Toast for errors. Calls `POST /api/v1/contact`.

**Modified Files:**
- `frontend/src/App.tsx` — Added `<Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />`
- `frontend/src/pages/Home.tsx` — Replaced inline Sidebar with `import { Sidebar }` + `<Sidebar />`
- `frontend/src/pages/MyBots.tsx` — Same
- `frontend/src/pages/TournamentsPage.tsx` — Same
- `frontend/src/pages/TournamentDetailPage.tsx` — Same
- `frontend/src/pages/TournamentLobbyPage.tsx` — Same
- `frontend/src/pages/SimulationsPage.tsx` — Same
- `frontend/src/pages/LeaderboardPage.tsx` — Same
- `frontend/src/pages/TournamentAnalyticsPage.tsx` — Same
- `CLAUDE.md` — Updated Frontend conventions with Sidebar rule

**API:** Uses existing `POST /api/v1/contact` endpoint (public, rate-limited 3/hr). Sends `{ email, subject, message }`.

---

### 2026-04-04: Tournament Analytics — The Quant Deck (V2.0)

**High-performance post-tournament forensics IDE at `/games`. Select a finished tournament, scrub through every hand with an SVG heatmap timeline, inspect player equity pulses, and read a terminal-style execution trace.**

**New Files:**
- `frontend/src/pages/TournamentAnalyticsPage.tsx` — Full IDE page: tournament selector, Action Arena (player cards + community cards + equity bars), Logic Stream (EXEC/RISK/DATA trace), Heatmap Scrubber (SVG pot-intensity bars behind range slider), Math Matrix popover, Fork to Simulator button
- `frontend/src/store/analyticsStore.ts` — Zustand store: `activeTournamentId`, `activeHandIndex`, `playbackSpeed`, `selectedLogEntryId`

**Modified Files:**
- `src/modules/tournaments/tournaments.service.ts` — Added `getHandsManifest(tournamentId, userId)` method (raw SQL query returning lightweight hand list with win/loss result per user)
- `src/modules/tournaments/tournaments.controller.ts` — Added `GET :id/hands-manifest` route (JwtAuthGuard, before existing `:id/*` subroutes)

**API Endpoints:**
```
GET /api/v1/tournaments/:id/hands-manifest   → { hands: HandManifestItem[] }
GET /api/v1/games/hands/:handId              → HandHistoryDto (existing, used for deep data)
```

**HandManifestItem:** `{ id, hand_number, pot, winner_bot_id, winner_name, started_at, result: 'win'|'loss'|'none' }`

**Frontend Architecture:**
- Tournament selector fetches `GET /tournaments?status=finished`
- Manifest loaded on tournament select; deep hand loaded on scrub (with 3-hand pre-fetch)
- Hand cache: `useRef<Map<string, HandDetail>>` — zero re-fetches for visited hands
- `useDeferredValue` on heatmap SVG render → 60fps scrubbing
- `AnimatePresence` wraps Action Arena content → slide transitions on hand change
- Equity derived from `best_hand.name` → lookup table (Royal Flush 99% → High Card 12%)
- Logic trace derived from actions: EXEC for bet/raise/all-in, RISK for low-equity calls, DATA for pot odds
- JetBrains Mono loaded via Google Fonts `@import` in inline `<style>` tag
- Graceful "Data Loss" card when hand fetch fails
- `aria-live="polite"` on Logic Stream for screen reader support

---

### 2026-04-04: Simulation Engine — Headless Bot Sandbox

**Headless Simulation Engine allowing users to test bots against specific opponent profiles in an isolated sandbox. No live data leaks into live game tables or leaderboards.**

**New Files:**
- `src/entities/simulation.entity.ts` — `Simulation` entity: id, user_id, bot_id, status (PENDING/RUNNING/COMPLETED/FAILED), hand_count, progress_hands, opponent_profile (AGGRESSIVE_SHARKS/TIGHT_PASSIVE/CURRENT_META), config_snapshot JSONB, completed_at
- `src/entities/simulation-result.entity.ts` — `SimulationResult`: FK to simulation_id, total_profit bigint, bb_per_100, win_rate, vpip, pfr, aggression_factor, heatmap_data JSONB (per-position wins/losses), equity_realization
- `src/migrations/1744300000000-AddSimulations.ts` — Creates `simulations` and `simulation_results` tables
- `src/workers/simulation-hand-worker.ts` — One-shot Worker Thread: runs GameInstance with `simulationMode=true`, collects per-hand stats via EventEmitter2 events, reports progress every 200 hands, returns `HandSimulationOutput`
- `src/modules/simulations/simulations.module.ts` — NestJS module
- `src/modules/simulations/simulations.controller.ts` — REST endpoints (see below)
- `src/modules/simulations/simulations.service.ts` — Business logic: bot ownership validation, concurrency limit (max 1 per user), worker dispatch, stats aggregation
- `src/modules/simulations/dto/create-simulation.dto.ts` — Validated DTO
- `src/modules/simulations/opponent-profiles.ts` — Hardcoded synthetic opponent configs for each profile
- `src/repositories/simulation.repository.ts` — DB access for simulations and results
- `tests/unit/simulations/simulation-stats.spec.ts` — Unit tests for bbPer100, winRate, VPIP, PFR, aggression factor calculations

**Modified Files:**
- `src/services/game/live-game-manager.service.ts` — Added `simulationMode?: boolean` constructor option. When true: disables all Socket.io/Redis/heartbeat emissions (`emitStateUpdate`, `game.hotState`, `game.playerJoined`, `game.playerRemoved`, `game.playerReactivated`, `game.playerSittingOut`, `game.showdownReveal`, heartbeat timer). Keeps `game.handStarted`, `game.playerAction`, `game.handComplete`, `game.finished`. Sets sleepMs=0.
- `src/workers/simulation.types.ts` — Added `HandSimulationInput`, `HandSimulationOutput`, `HandSimBot`, `HandSimWorkerMessage` types
- `src/entities/index.ts` — Exports `Simulation`, `SimulationResult` and related types
- `src/repositories/index.ts` — Exports `SimulationRepository`
- `src/app.module.ts` — Imports `SimulationsModule`
- `frontend/src/pages/Home.tsx` — Added `Simulations` to NAV + `Simulations` icon in NAV_ICONS
- `frontend/src/pages/MyBots.tsx`, `TournamentsPage.tsx`, `TournamentDetailPage.tsx`, `TournamentLobbyPage.tsx`, `BotBuilder.tsx` — Added `Simulations` to sidebar NAV in each page
- `frontend/src/App.tsx` — Added `/simulations` route → `SimulationsPage`
- `frontend/src/pages/SimulationsPage.tsx` — New page: simulation form (bot selector, handCount 1k–10k, opponent profile), past simulations list with live progress polling (3s), detailed results view (bb/100, win rate, VPIP, PFR, aggression factor, position heatmap grid)

**API Endpoints:**
```
POST /api/v1/simulations        → { simulationId, status: "PENDING" }
GET  /api/v1/simulations        → { simulations[], total }
GET  /api/v1/simulations/:id    → { ...simulation, progress: 0–100 }
GET  /api/v1/simulations/:id/result → SimulationResult with analytics
```

**Isolation Guarantee:**
- `simulationMode=true` prevents all DB writes during simulation (GameDataPersistenceService never receives events from local EventEmitter2)
- Simulation results only write to `simulations` and `simulation_results` tables
- No updates to `bot_stats`, `hands`, `actions`, `hand_players`, `games`, `game_players`

**Worker Architecture:**
- Not using WorkerPool (no reuse needed for user-initiated simulations)
- Direct Worker Thread per simulation with progress messages (`{ type: "progress" }`)
- `SimulationsService` listens for progress to update `progress_hands` in DB for UI polling

**Stats Computed:**
- `bbPer100 = (totalProfit / bigBlind) * 100 / handsPlayed`
- `winRate = handsWon / handsPlayed`
- `vpip` = fraction of hands with voluntary preflop action
- `pfr` = fraction of hands with preflop raise
- `aggressionFactor = aggressiveActions / passiveActions` (9999 when calls=0)
- `heatmapData`: per-position `{ wins, losses, hands }` for BTN/SB/BB/UTG/CO/HJ/etc.

### 2026-04-04: Leaderboard Refactor — User-Based Aggregation (Developer Rankings)

**Shifted the Hall of Fame leaderboard from ranking individual bots to ranking users (developers) by aggregating all their bots' stats. Bot names are strictly hidden from this view.**

**New Files:**
- `src/migrations/1744900000000-AddUserLeaderboardView.ts` — Creates `mv_user_leaderboard` materialized view, grouping all hand and tournament stats by `user_id`. Computes weighted BB/100, aggregated wins, ITM%, ROI%, and `active_bot_count` per user. Excludes admin users. Unique index on `user_id` for concurrent refresh.

**Modified Files:**
- `src/modules/leaderboard/dto/leaderboard.dto.ts` — Added `UserLeaderboardEntryDto` (fields: `userId`, `userName`, `activeBotCount`, plus all stat fields). Changed `PaginatedLeaderboardDto.data` type to `UserLeaderboardEntryDto[]`.
- `src/modules/leaderboard/leaderboard.service.ts` — Added `queryAllTimeByUser()` (reads `mv_user_leaderboard`), `queryPeriodByUser()` (dynamic CTEs grouped by `user_id`), and `toUserLeaderboardEntry()` mapper. `getLeaderboard()` now routes to user-based queries. `refreshLeaderboard()` cron also refreshes `mv_user_leaderboard`. Old bot-based `queryAllTime()` / `queryPeriod()` preserved for `getBotPerformance()`.
- `frontend/src/pages/LeaderboardPage.tsx`:
  - `LeaderboardEntry` interface now has `userId/userName/activeBotCount` (no `botId/botName/tierBadge`)
  - Removed `TierBadge` component and tier filter pills
  - Added `UserAvatar` component (initials circle with deterministic hue from username)
  - Podium shows user name + avatar instead of bot name + tier badge
  - Table "Bot" column → "Player"; displays avatar + username
  - "YOU" highlight compares `e.userId === currentUserId` (logic unchanged, now correctly targets the user row)
  - Tooltip on each row: `"Playing with N active bot(s)"` via `title` attribute
  - Header subtitle updated to "Rankings across all developers on the platform"
  - `formatNet()` shorthand notation unchanged

**Privacy:** Bot names do not appear anywhere in the leaderboard view. The `activeBotCount` tooltip reveals only the count, not names or configs.

**API:** `GET /api/v1/leaderboard` — same endpoint, now returns `UserLeaderboardEntryDto[]`. `tier` query param ignored (bot-scoped, not applicable at user level). `GET /api/v1/leaderboard/:botId` unchanged (individual bot detail).

---

### 2026-04-04: Hall of Fame — Living League Polish (V2)

**Seeded real stress-test results, removed timestamp noise, added `--` placeholders, and made the podium mobile-responsive.**

**Modified Files:**
- `scripts/seed-system-bots.ts` — Now inserts stress-test aggregates into the underlying tables that feed `mv_bot_leaderboard`. Per bot: one `bot_stats` upsert (total_tournaments, wins, total_net), one `hand`+`hand_player` encoding the full 1,174,694-hand run for correct BB/100, one `tournament`+100 scaled entries for exact ITM%/ROI%. Run `npm run seed:system-bots` to apply. Data is persistent through cron MV refreshes.
- `frontend/src/pages/LeaderboardPage.tsx` — Removed `Updated HH:MM:SS` timestamp from header. Stat columns show `--` instead of `0.0` for bots with `totalTournaments === 0`. Podium flex container gains `flexWrap: 'wrap'` + `className="podium-section"` with a `@media (max-width: 640px)` rule that stacks cards vertically.

**Post-seed leaderboard order (BB/100 sort):**
1. The Nit — BB/100 4.41, ROI 13.82%, ITM 49%, 42 wins / 4999 entries
2. The Shark — BB/100 2.80, ROI 8.78%, ITM 36%, 622 wins / 4999 entries

---

### 2026-04-04: Leaderboard Hall of Fame — Podium, System Bots, Visual Hierarchy

**Transformed the Leaderboard into a Hall of Fame with a Top 3 Podium, system bot competition seeding, and visual polish.**

**New Files:**
- `src/migrations/1744700000000-AddIsSystemToBot.ts` — Adds `is_system BOOLEAN DEFAULT FALSE` to `bots` table
- `scripts/seed-system-bots.ts` — Seeds a `system@botroyale.internal` user + 8 system bots (Shark, Rock, Maniac, etc.) with pre-seeded realistic stats into `mv_bot_leaderboard`. Run with `npm run seed:system-bots`.

**Modified Files:**
- `src/entities/bot.entity.ts` — Added `isSystem: boolean` column
- `src/modules/leaderboard/dto/leaderboard.dto.ts` — Added `ownerName: string` to `LeaderboardEntryDto`
- `src/modules/leaderboard/leaderboard.service.ts` — `queryAllTime` now JOINs `bots` + `users` to return `owner_name` and bypass `minGames` for system bots (`OR b.is_system = true`). `queryPeriod` has same bypass + owner JOIN.
- `frontend/src/pages/LeaderboardPage.tsx` — Full Hall of Fame rewrite:
  - `PodiumSection`: Olympic podium (Silver left, Gold center elevated, Bronze right) above the table. Shows bot name, `ownerName`, Net Profit, tier badge.
  - Filter Bar: Tier and Period now use pill buttons instead of `<select>` dropdowns. Sort and Min Hands remain compact inline.
  - Net Profit column: uses `#34d399` (emerald-400) for profit and `#fb7185` (rose-400) for loss (previously `C.success`/`C.danger`). Bold `fontWeight: 700`.
  - Rank column header: `fontWeight: 900` and `color: C.text` to visually dominate.
  - Table cell `fontSize` bumped to 14px.
  - Page title changed to "Hall of Fame".
  - Bot cell shows `ownerName` as secondary line below bot name.

**System Bot Bypass Invariant:**
- System bots (`is_system = true`) always appear on the leaderboard regardless of `minGames` filter.
- Pre-seeded stats in `mv_bot_leaderboard` provide day-one competition targets; overwritten by real game data after first MV refresh.

---

### 2026-04-04: Leaderboard Module with 3-Tier Strategy Badges

**Professional leaderboard with advanced poker metrics (BB/100, ROI, ITM%), materialized view aggregation, and filterable public API.**

**New Files:**
- `src/migrations/1744300000000-AddLeaderboardView.ts` — Creates indexes on `hand_players(bot_id)`, `tournament_entries(bot_id)`, `tournament_entries(bot_id, finish_position)` + `mv_bot_leaderboard` materialized view with unique index for concurrent refresh
- `src/modules/leaderboard/dto/leaderboard.dto.ts` — `TierBadge` enum, `LeaderboardQueryDto` (with tier/period/sortBy/minGames filters), `LeaderboardEntryDto`, `PaginatedLeaderboardDto`, `HotStreakEntryDto`, `BotPerformanceDto` — all with full Swagger decorators
- `src/modules/leaderboard/leaderboard.service.ts` — `LeaderboardService`: cron-based MV refresh every 15 min with distributed lock, all-time queries via MV, period-filtered queries via raw SQL CTEs, bot detail endpoint with hot streak + consistency index
- `src/modules/leaderboard/leaderboard.controller.ts` — `GET /leaderboard` (paginated, filterable) + `GET /leaderboard/:botId` (detailed performance), both public
- `src/modules/leaderboard/leaderboard.module.ts` — Module wiring

**Modified Files:**
- `src/app.module.ts` — Import `LeaderboardModule`
- `docs/API.md` — Documented both endpoints with query params, response schema, behavior notes

**Materialized View `mv_bot_leaderboard`:**
- Joins: `bots`, `bot_stats`, `hand_players`+`hands` (BB/100), `tournament_entries`+`tournaments` (ITM%, ROI%)
- BB/100 = `net_chips / total_big_blinds * 100` (standard poker win-rate)
- ITM% = finished in top 15% of field
- ROI% = `(total_payout - total_buy_in) / total_buy_in * 100`
- Refreshed every 15 min via `REFRESH MATERIALIZED VIEW CONCURRENTLY` with `lock:leaderboard:refresh` distributed lock

**3-Tier Badge System:**
- `TIER_1_QUICK` — Quick tier (personality sliders)
- `TIER_2_MATRIX` — Strategy tier (rules + range chart)
- `TIER_3_ELITE` — Pro tier (position overrides)

**API: `GET /api/v1/leaderboard`**
- Query params: `tier` (QUICK/MATRIX/ELITE), `period` (daily/weekly/monthly/all_time), `sortBy` (bb100/roi), `minGames` (default 10), `limit`, `offset`
- `all_time` reads from MV (fast); other periods compute aggregates at query time filtered by `finished_at`

**API: `GET /api/v1/leaderboard/:botId`**
- Returns full metrics + `hotStreak` (last 5 tournament ITM results) + `consistencyIndex` (stddev of finish positions)

---

### 2026-04-04: Support / Contact Us Module

**POST `/api/v1/contact` — public endpoint for user support tickets with database persistence, rate limiting, and fault-tolerant admin email notifications.**

**New Files:**
- `src/entities/support-ticket.entity.ts` — `SupportTicket` entity (`support_tickets` table): id UUID, user_id (nullable), email, subject, message, status enum (open/in_progress/closed), metadata JSONB (userAgent, lastHandId, tournamentId, url)
- `src/repositories/support-ticket.repository.ts` — `SupportTicketRepository` with `createTicket()` method
- `src/modules/support/dto/create-support-ticket.dto.ts` — Validated DTO with class-validator
- `src/modules/support/notification/notification.provider.ts` — `NotificationProvider` interface + `NOTIFICATION_PROVIDER` injection token
- `src/modules/support/notification/email-notification.provider.ts` — Email implementation using existing `EmailService`; 5xx errors retry up to 3× with exponential backoff (1s/2s/4s); 4xx errors log and abort; all failures are non-throwing
- `src/modules/support/support.service.ts` — `SupportService.submitTicket()`: saves ticket, fires notification asynchronously
- `src/modules/support/support.controller.ts` — `POST /contact` with `@Public()`, `@Throttle(3/hr)`, Swagger decorators
- `src/modules/support/support.module.ts` — Module wiring
- `tests/unit/modules/support.service.spec.ts` — 9 unit tests

**Modified Files:**
- `src/entities/index.ts` — Export `SupportTicket`, `TicketStatus`, `TicketMetadata`
- `src/repositories/index.ts` — Export `SupportTicketRepository`
- `src/app.module.ts` — Import `SupportModule`
- `docs/API.md` — Added `POST /contact` endpoint documentation

**Config:** Set `SUPPORT_ADMIN_EMAIL` env var to receive admin notifications.

---

### 2026-04-04: ArchivingService — Cold Storage for Historical Hand Data

**Daily cron job archives old tournament hand data to S3 (compressed JSON), then safely prunes detailed records from PostgreSQL to prevent database bloat.**

**New Files:**
- `src/modules/archive/archive.module.ts` — NestJS module registering all archive providers
- `src/modules/archive/archive.service.ts` — Core orchestrator: daily cron (04:00 UTC), eligibility query, serialize → upload → mark → prune pipeline, on-demand retrieval from S3
- `src/modules/archive/archive.controller.ts` — Admin endpoints: `GET /archive/tournaments/:id/hands`, `GET /archive/tournaments/:id/hands/:handId`
- `src/modules/archive/cloud-storage.service.ts` — Generic S3 wrapper (`upload`, `download`, `exists`) using `@aws-sdk/client-s3`; supports custom endpoint for LocalStack/MinIO
- `src/modules/archive/archive.config.ts` — Default constants (cron schedule, lock TTL, retention days, batch sizes)
- `src/modules/archive/dto/archived-hand.dto.ts` — Archive schema types (`TournamentArchive`, `ArchivedHand`, etc.) and response DTOs
- `src/migrations/1744200000000-AddArchivingColumns.ts` — Adds `is_archived`, `archive_url` to tournaments; `is_audited` to hands; partial indexes

**Modified Files:**
- `src/entities/tournament.entity.ts` — Added `is_archived: boolean` (default false), `archive_url: string | null`
- `src/entities/hand.entity.ts` — Added `is_audited: boolean` (default false)
- `src/services/audit/game-validator.service.ts` — `persistBugs()` now marks all processed hands as `is_audited = true` (not just failing ones), enabling the archive eligibility check
- `src/app.module.ts` — Imported `ArchiveModule`
- `.env.example` — Added `ARCHIVE_RETENTION_DAYS`, `ARCHIVE_DELETE_BATCH_SIZE`, `AWS_S3_*` variables

**New Dependency:** `@aws-sdk/client-s3`

**Archive Pipeline (per tournament):**
1. **Eligibility**: `status = 'finished'`, `is_archived = FALSE`, `finished_at` older than N days, ALL hands have `is_audited = TRUE` and `validation_error = FALSE`
2. **Serialize**: Pages through hands (500/batch), loads players + actions + logic_bugs, builds `TournamentArchive` JSON, gzips
3. **Upload**: Puts to `archive/tournaments/YYYY/MM/DD/{tournamentId}.json.gz` in S3 (skips if already exists)
4. **Mark**: Sets `is_archived = true` and `archive_url` on tournament
5. **Prune**: Deletes hands in chunks of 1000 (CASCADE handles hand_players, actions, logic_bugs)

**What stays in DB:** Tournament, TournamentEntry (leaderboard/payouts), TournamentTable, TournamentSeat, TournamentBlindLevel, TournamentPod, Game, GamePlayer, Transaction, BotStats

**Retrieval:** `getArchivedHand()` checks DB first, falls back to S3 download + gunzip + parse. Returns identical DTO structure regardless of source.

**Distributed Lock:** `lock:archive:daily` (TTL 600s) via Redis LockService — prevents concurrent execution across instances.

**Idempotent:** S3 `exists()` check before upload; `is_archived` flag prevents re-processing; chunked deletion is resumable.

**Environment Variables:**
- `ARCHIVE_RETENTION_DAYS` — days after `finished_at` before archiving (default: 7)
- `ARCHIVE_DELETE_BATCH_SIZE` — hands per deletion batch (default: 1000)
- `AWS_S3_BUCKET`, `AWS_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_ENDPOINT` — optional, for LocalStack/MinIO in dev

---

### 2026-04-04: Heartbeat Monitoring & Self-Healing for Game Instances

**Redis-based heartbeat system (30s threshold) with a dedicated `GameMonitorService`, anti-loop recovery counting, and `LogicBug` audit trail for stuck game detection and self-healing.**

**New Files:**
- `src/services/game/game-monitor.service.ts` — `GameMonitorService`: listens to `game.heartbeat` events → writes `game:heartbeat:{tableId}` to Redis (TTL 60s); scans all running games every 12s; emits `game.monitor.stuck` if heartbeat age > 30s; logs "Monitor: N active tables, M stuck." summary

**Modified Files:**
- `src/services/game/live-game-manager.service.ts` — `GameInstance` now emits `game.heartbeat { tableId, gameId, handNumber }` every 4s via `setInterval` started in `startGame()`, cleared in `stop()`
- `src/modules/tournaments/tournament-director.service.ts` — `ActiveTournament` registers `game.monitor.stuck` handler; new `handleMonitorStuck()` implements self-healing with retry limit
- `src/services/services.module.ts` — Registered `GameMonitorService` as provider + export

**Self-Healing Flow (TournamentDirectorService):**
1. `game.monitor.stuck` received → check `game:recovery_count:{tableId}:{handNumber}` in Redis
2. If count >= 3: log "Fatal Logic Error", write `LogicBug` row, terminate table permanently (no respawn)
3. Otherwise: log CRITICAL "Table {tableId} stuck at hand {handId}. Initiating recovery.", increment count (TTL 1h), stop old game, fetch `hot:game:{gameId}` from Redis, respawn new `GameInstance` with hot state players

**Redis Key Patterns Added:**

| Key | TTL | Purpose |
|-----|-----|---------|
| `game:heartbeat:{tableId}` | 60s | Heartbeat timestamp + handNumber; auto-expires if game stops unexpectedly |
| `game:recovery_count:{tableId}:{handNumber}` | 1h | Recovery attempt counter per (table, hand); prevents infinite restart loops |

**Configuration (env vars):**
- `GAME_MONITOR_STALE_MS` — stale threshold in ms (default: 30000)
- `GAME_MONITOR_INTERVAL_MS` — monitor scan interval in ms (default: 12000)

**Coexistence with existing heartbeat:** The existing `LiveGameManagerService` 120s in-memory monitor still runs as a fallback. The new 30s Redis monitor catches issues earlier.

---

### 2026-04-03: Distributed Locking (Redis) for Cron Jobs & Prize Distribution

**Ensures critical cron jobs and event-driven processes run only once across multiple server instances using Redis-based distributed locks with atomic Lua release scripts.**

**New Files:**
- `src/common/redis/lock.service.ts` — LockService with `acquire()`, `release()`, `extend()`, `withLock()`. Uses `SET NX EX` for acquisition, Lua scripts for atomic owner-checked release/extend. Clock drift safety margin (5% + 2ms). UUID ownership prevents releasing another instance's lock.
- `src/common/decorators/distributed-lock.decorator.ts` — `@DistributedLock(key, ttlMs)` metadata decorator for HTTP/WS handlers (same pattern as `@Roles()`)
- `src/common/interceptors/distributed-lock.interceptor.ts` — Reads `@DistributedLock` metadata, acquires/releases lock around handler execution
- `tests/unit/common/lock.service.spec.ts` — 14 unit tests (mocked Redis)
- `tests/integration/distributed-lock.spec.ts` — 7 integration tests with real Redis (concurrent execution, owner-only release, TTL expiry, error recovery)

**Modified Files:**
- `src/common/redis/redis.module.ts` — Registered LockService as provider + export
- `src/app.module.ts` — Registered DistributedLockInterceptor as APP_INTERCEPTOR
- `src/modules/matchmaking/matchmaking.service.ts` — Injected LockService, wrapped 3 cron methods with `withLock()`
- `src/modules/matchmaking/prize-distribution.service.ts` — Injected LockService, wrapped `handlePodFinished` with per-pod lock + idempotency check

**Lock Keys & TTLs:**

| Lock Key | TTL | Protected Method |
|----------|-----|-----------------|
| `lock:matchmaking:create-daily` | 60s | `createDailyMasterTournament()` (08:00 UTC) |
| `lock:matchmaking:lock-pods` | 120s | `lockAndCreatePods()` (20:55 UTC) |
| `lock:matchmaking:execute-pods` | 120s | `executePods()` (21:00 UTC) |
| `lock:prize:pod:{podId}` | 30s | `handlePodFinished()` (event-driven) |

**Behavior:**
- If lock is busy: logs warn "Lock busy — skipping", method exits gracefully (no error thrown)
- If Redis is down: logs error, method is skipped (safe — never runs unguarded)
- Lock always released in `finally` block — no deadlocks on method errors
- `@DistributedLock` decorator works for HTTP/WS handlers only (NestJS interceptors don't apply to `@Cron` methods — cron uses `withLock()` directly)

---

### 2026-04-03: EquityService & EV Decision-Making Integration

**Added real win probability estimation and Expected Value logic to the strategy engine. Bots now make mathematically-informed fold/call/raise decisions based on equity vs pot odds.**

**New Files:**
- `src/modules/bot-strategy/evaluators/equity.service.ts` — EquityService with heuristic (Rule of 2/4) and Monte Carlo equity estimation, outs counting, EV calculation, profitable call detection
- `tests/unit/bot-strategy/equity.service.spec.ts` — 39 unit tests covering known equity scenarios, outs counting, Monte Carlo determinism, EV math, memoization

**Modified Files:**
- `src/domain/bot-strategy/strategy.types.ts` — Added `equity: number` to `GameContext` interface; added `equity` to `CONDITION_FIELDS` (tier: pro) enabling equity-based rules
- `src/modules/bot-strategy/strategy-tunables.ts` — New `equity` config section: safety buffer, Monte Carlo iterations, multi-way discount params, preflop/made-hand equity lookup tables, outs constants
- `src/modules/bot-strategy/strategy-engine.service.ts` — Wired `estimateEquityHeuristic()` into `buildGameContext()` to populate `equity` field; added `clearEquityMemo()` to `clearStreetMemos()` for per-hand cache clearing
- `src/modules/bot-strategy/evaluators/personality.evaluator.ts` — `computeActionWeights()` now uses `ctx.equity` instead of `normalizedStrength()`/`getHandQualityScore()` for hand quality, with fallback to old heuristic if equity is 0

**Behavioral Impact:**
- Flush draws on flop (~36% equity) no longer auto-fold — treated as playable hands
- Combo draws (flush + straight) correctly get high aggression
- Marginal pairs on wet boards stay defensive (equity < 0.4 blocks aggression gate)
- Tightness slider now scales by real win probability, not just hand rank
- Pro-tier rules can use `equity` as a condition field (e.g., "if equity > 0.55, raise")

**Architecture:**
- Pure module (no NestJS DI) — works in Worker Threads
- Memoized (256-entry LRU, cleared per hand with existing lifecycle)
- Heuristic path ~0.01ms per call; Monte Carlo path ~5-20ms (opt-in)
- Deterministic: heuristic is pure arithmetic; Monte Carlo accepts seed parameter

---

### 2026-04-03: Financial System & Matchmaking Orchestrator

**New modules: Finance (wallets + transactions) and Matchmaking (daily tournament lifecycle with 3 cron jobs + event-driven prize distribution).**

**New Files:**
- `src/entities/wallet.entity.ts` — Wallet entity (1:1 with User, balance bigint CHECK >= 0)
- `src/entities/transaction.entity.ts` — Transaction entity (immutable ledger)
- `src/entities/tournament-pod.entity.ts` — TournamentPod entity (pod within master tournament)
- `src/repositories/wallet.repository.ts` — Atomic credit/debit via single SQL UPDATE
- `src/repositories/transaction.repository.ts` — Transaction queries
- `src/repositories/tournament-pod.repository.ts` — Pod queries + bulk insert
- `src/modules/finance/` — FinanceModule, FinanceService, FinanceController, DTOs
- `src/modules/matchmaking/` — MatchmakingModule, MatchmakingService (3 crons), PrizeDistributionService (@OnEvent), config
- `src/migrations/1744000000000-AddFinanceAndMatchmaking.ts` — wallets, transactions, tournament_pods tables + user subscription columns
- `tests/unit/modules/finance.service.spec.ts` — 6 tests
- `tests/unit/modules/prize-distribution.service.spec.ts` — 9 tests
- `tests/unit/modules/matchmaking.service.spec.ts` — 12 tests
- `tests/integration/finance-tournament-flow.spec.ts` — 5 integration tests

**Modified Files:**
- `src/entities/user.entity.ts` — Added subscription_status, subscription_start, subscription_end, monthly_fee columns
- `src/entities/index.ts` — Exports Wallet, Transaction, TournamentPod
- `src/repositories/index.ts` — Exports WalletRepository, TransactionRepository, TournamentPodRepository
- `src/app.module.ts` — Imports FinanceModule, MatchmakingModule
- `src/main.ts` — Added Swagger/OpenAPI setup (available at /api/docs)
- `package.json` — Added @nestjs/swagger dependency

---

### 2026-04-03: Atomic Table Balancing — Redis Transactions, Move Locking, Limbo Recovery

**Player moves during table balancing are now atomic via Redis MULTI/EXEC, with move locking and crash-safe limbo recovery.**

#### Redis MULTI/EXEC Support

**Modified: `src/common/redis/redis.service.ts`**
- Added `multi()` method returning an ioredis transaction pipeline.

#### Atomic Player Moves

**Modified: `src/modules/tournaments/tournament-director.service.ts`**
- `ActiveTournament` now receives `RedisService` via constructor.
- `breakTable()` refactored: each player move wrapped in a Redis MULTI/EXEC pipeline that atomically sets a move lock (`tournament:move:{tournamentId}:{botId}`, TTL 30s) and writes the seat assignment to a Redis hash (`tournament:seats:{tournamentId}`).
- Lock cleared after in-memory + DB operations complete.
- If server crashes mid-move, the lock persists in Redis for recovery detection.

#### Move Lock Guard in GameInstance

**Modified: `src/services/game/live-game-manager.service.ts`**
- Added `movingPlayers: Set<string>` to `GameInstance`.
- Betting loop auto-folds any player in `movingPlayers` — prevents acting on a player mid-transfer.

#### Audit Logging

**Modified: `src/modules/tournaments/tournament-director.service.ts`**
- Every table move emits a structured JSON audit log: `{ audit: "TABLE_MOVE", tournamentId, botId, fromTableId, toTableId, chips, timestamp }`.
- Emits `tournament.playerMoved` event per player move.

#### Limbo Recovery

**Modified: `src/services/game/game-recovery.service.ts`**
- Added `recoverLimboPlayers()` — scans `tournament:move:*` keys on cold boot after auto-recovery.
- Logs each limbo player with their movement context (from/to table, chips).
- Cleans up stale locks so the tournament director can reconcile seats normally.
- `RedisService` added to constructor injection.

---

### 2026-04-03: Worker Strategy Hydration — Pre-warm + Lifecycle Cleanup

**Workers now pre-hydrate all bot strategies before the game loop and clean up caches between tasks.**

**Modified: `src/workers/tournament-simulation.worker.ts`**
- Pre-hydrates all bot strategies via `getOrHydrateStrategy()` before `game.addPlayer()` — eliminates first-hand latency spike.
- After `runTournament()` completes (success or error), calls `clearHydrationCache()`, `clearEvalCache()`, `clearStreetMemos()` to free memory.

**Modified: `src/workers/pool-tournament-worker.ts`**
- Same pre-hydration before game loop.
- Same cleanup after each task completes — critical for pool workers that are reused across tournaments.

**Already implemented (prior sessions):**
- `HydratedStrategy` with pre-sorted rule arrays, frozen personality, Uint8Array(169) range chart LUT
- `HYDRATION_CACHE` (256-entry LRU), `EVAL_CACHE` (512-entry LRU), hand/board memos
- `GamePlayer.hydratedStrategy` pre-compiled at `addPlayer()` time
- `evaluateHydrated()` hot path: zero JSON.parse, zero Object.keys, zero array sort

---

### 2026-04-03: Weight-Based Action Distribution with Sigmoid Slider Mapping

**Replaced ad-hoc probability thresholds with a unified weight-based distribution system. Sliders now produce nuanced, non-linear behavior.**

**Rewritten: `src/modules/bot-strategy/evaluators/personality.evaluator.ts`**
- **Weight-based system**: Every decision starts from a configurable base distribution `{ fold, call, raise }` per hand category (premium/strong/playable/weak/draw). All 4 sliders modify these weights, then a seeded PRNG roll picks the action.
- **Sigmoid mapping**: `sigmoid(value, k=6)` transforms 0-100 sliders to [0,1] with an S-curve centered at 50. Values near 50 change subtly; extremes (0-10, 90-100) change dramatically.
- **Tightness normalization**: High tightness shifts weight from call+raise → fold, scaled by `(1 - handQuality)` — strong hands are barely affected, marginal hands heavily. Position multiplier still applied.
- **Aggression multiplier**: Transfers up to 70% of call weight → raise weight, but only when hand strength exceeds the equity gate threshold (0.4). Below-threshold hands stay defensive regardless of aggression.
- **Bluff frequency**: Injects raise weight for weak/draw hands (up to +15), taken from fold weight.
- **Risk tolerance**: When facing bets, reduces fold weight by up to 50%. When facing all-in, penalizes non-risk-tolerant players.
- **Validation**: Weights clamped to >=0, then normalized to sum=1.0 before the roll.
- **Explanations**: Every action includes the distribution percentages, e.g. `"Raising (strong, F:8% C:22% R:70%)"`.

**Modified: `src/modules/bot-strategy/strategy-tunables.ts`**
- New `distributions` config section:
  - `base`: 5 hand categories with initial fold/call/raise weights
  - `equityGateThreshold: 0.4` — minimum hand quality for aggression to apply
  - `sigmoidK: 6` — steepness of the S-curve

---

### 2026-04-03: Deterministic Seeded RNG — Reproducible Bot Decisions

**Replaced weak hash-based seeding with SHA-256 seeds derived from the provably fair chain, making all bot decisions cryptographically reproducible and auditable.**

**Modified: `src/modules/bot-strategy/strategy-engine.service.ts`**
- `BotPayload` gained `decisionSeed: string` — 64-char hex SHA-256 digest unique per (hand, bot, action).
- Replaced `hashSeed(gameId, handNumber)` (weak 31-bit hash, same for all bots in a hand) with `seedFromHex(decisionSeed)` — converts first 8 hex chars to 32-bit seed for `SeededRandom`.
- `evalCacheKey` now uses `decisionSeed` prefix (encodes hand+bot+action) instead of holeCards/communityCards.
- Two bots in the same hand now get different random sequences (differentiated by botId in the seed).

**Modified: `src/services/game/live-game-manager.service.ts`**
- `buildBotPayload()` computes `decisionSeed = SHA256(combinedHash:botId:actionSeq)`.
- When provably fair service is active: `combinedHash` is the HMAC-SHA256 from `HandSeedData` (cryptographically tied to the commit-reveal chain).
- When not: falls back to `gameId` as base seed (still deterministic per game instance).
- Auditors can re-derive any decision seed from: `combinedHash` (in hand record) + `botId` (in action record) + `actionSeq` (in action record).

**Modified: `src/domain/deck.ts`**
- Replaced `Math.random()` in fallback `shuffle()` with `crypto.randomBytes()`. No `Math.random()` remains in game logic.

**No `Math.random()` in game logic:** All randomness in the codebase now comes from either the provably fair HMAC-SHA256 chain (deck shuffling + decision seeds) or `crypto.randomBytes` (fallback shuffle). The only remaining `Math.random()` calls are in test utilities (`game-simulator.ts`, `ui-qa-runner.ts`) which are not part of the game engine.

---

### 2026-04-03: Positional Awareness Multipliers for Quick/Strategy Tier

**Bots now play wider ranges in late position (BTN/CO) and tighter in early position (UTG) — the core of positional poker intelligence.**

**Modified: `src/modules/bot-strategy/strategy-tunables.ts`**
- New `positionMultiplier` lookup table: `{ BTN: 0.5, CO: 0.65, HJ: 0.75, MP: 0.85, UTG+1: 0.95, UTG: 1.0, SB: 0.9, BB: 0.9 }`.
- Linear scale from UTG (1.0x, tightest) to BTN (0.5x, loosest).

**Modified: `src/modules/bot-strategy/evaluators/personality.evaluator.ts`**
- `evaluatePreflop()` now multiplies `playThreshold` by the position multiplier before comparing against hand quality.
- Formula: `playThreshold = (tightness / 100) * positionMultiplier[position]`.
- Lower threshold = wider range. A bot with tightness 60 on BTN plays like tightness 30 (0.5x multiplier).
- Falls back to 1.0x if position is unknown.
- Only applies to personality-based evaluation (Quick/Strategy tiers). Pro tier with position overrides already has explicit per-position range charts and rules, and those match before personality is reached.

---

### 2026-04-03: Action Buffering — Flush-at-End-of-Hand Bulk Insert

**Replaced per-action Postgres INSERTs with in-memory buffering + single bulk INSERT at hand end.**

**Modified: `src/services/game/game-data-persistence.service.ts`**
- New `actionBuffer: Map<string, any[]>` field — buffers action rows keyed by `gameId:handNumber`.
- `recordHandActionRow()` no longer calls `actionRepository.save(row)`. Instead, pushes the row into the buffer. Zero DB I/O per action.
- `onHandComplete()` transaction now bulk-inserts all buffered actions via `manager.getRepository(Action).insert(bufferedActions)` — single `INSERT INTO ... VALUES (...), (...), (...)` statement — before updating Hand/HandPlayer/GamePlayer/Game rows. Entire hand history is atomic.
- Buffer cleared after transaction commits and on hand start (safety). Also cleared in idempotency early-return path.
- Redis hot-state still syncs per-action (unchanged) — crash recovery is fully covered.
- A 6-player hand with 20 actions goes from 20 Postgres round-trips to 1.

---

### 2026-04-03: Tournament Tie-Breaking — Same-Hand Elimination Ranking

**Professional tie-breaking: players eliminated in the same hand are ranked by their starting chip count, with equal stacks sharing rank and splitting prizes.**

#### Chip Snapshotting & Bust Detection

**Modified: `src/modules/tournaments/tournament-director.service.ts`**
- New `BustRecord` type replaces `string[]` bustOrder — tracks `botId`, `bustLevel`, `bustHandNumber`, `chipsAtHandStart`, `finishPosition`, `isTied`.
- `chipSnapshot: Map<string, number>` captures every player's chips at hand start via `game.handStarted` event listener.
- `roundCounter` increments per `handleHandComplete` call for bust grouping.
- `checkForBustedPlayers()` fully rewritten: batches all busts from a round, sorts by `chipsAtHandStart` descending, detects ties (identical starting chips → shared `finishPosition` + `isTied = true`).
- `checkFinishedGames()` also produces `BustRecord` objects for disconnected stragglers.

#### Prize Splitting

**New utility: `src/config/tournaments.config.ts` → `splitPayoutsForTiedPositions()`**
- Combines prize money for positions `[pos, pos+1, ..., pos+groupSize-1]` and splits equally. Remainder to first player.

**Modified: `src/modules/tournaments/tournament-director.service.ts` → `finishTournament()`**
- Groups `bustOrder` by `finishPosition`, applies `splitPayoutsForTiedPositions` for each group.
- Winner always gets position 1 (untied).

#### Database Schema

**New migration: `src/migrations/1743700000000-AddTieBreakerColumns.ts`**
- Adds `bust_hand_number INTEGER` and `chips_at_bust INTEGER` to `tournament_entries`.

**Modified: `src/entities/tournament-entry.entity.ts`** — added both nullable columns.
**Modified: `src/repositories/tournament.repository.ts`** — `bustEntry()` extended with `bustHandNumber` and `chipsAtBust` params.

#### Results API & Frontend

**Modified: `src/modules/tournaments/dto/tournament-results.dto.ts`** — added `isTied: boolean`.
**Modified: `src/modules/tournaments/tournaments.service.ts`** — `getCompleteResults()` detects ties from duplicate `finish_position` values, uses `finish_position` directly as `rank`.
**Modified: `frontend/src/components/tournaments/ResultsTable.tsx`** — displays `T-X` format for tied ranks instead of `#X`.
**Modified: `frontend/src/pages/TournamentResultsPage.tsx`** — passes `isTied` through to components, user highlight uses tied format.

---

### 2026-04-03: Formal Seat Status State Machine — ACTIVE, SITTING_OUT, ELIMINATED

**Replaced binary `disconnected` flag with a 3-state seat status model for proper ghost player behavior.**

#### Seat Status Type

**Modified: `src/services/game/live-game-manager.service.ts`**
- New exported `SeatStatus = "active" | "sitting_out" | "eliminated"` type.
- `GamePlayer` gained `seatStatus: SeatStatus` field.
- `disconnected` kept for backward compatibility — derived: `true` only when `seatStatus === "eliminated"`.
- All player creation/reconnection paths set `seatStatus: "active"`.
- `removePlayer()` / `removePlayerImmediate()` set `seatStatus: "eliminated"`.

#### Ghost Player Logic (SITTING_OUT)

- **Strike escalation**: 3 strikes → `seatStatus = "sitting_out"` (not eliminated). Player stays at table, keeps chips.
- **Auto-check/fold**: In `bettingRoundLoop()`, sitting_out players get instant auto-action: check if no bet, fold if facing bet. Zero delay — no strategy eval, no `animSleep`, no timeout. Keeps turbo simulation speed.
- **Blind/ante deduction**: Sitting_out players are NOT pre-folded at hand start (`p.folded = p.chips === 0 || p.seatStatus === "eliminated"`), so they participate in blind rotation and pay blinds/antes normally via existing `Math.min(blind, chips)` logic.
- **Elimination**: Only when `chips === 0`. A sitting_out player blinded down to 0 becomes eliminated.

#### Recovery Path

- `reactivatePlayer(playerId)`: Public method on `GameInstance`. Transitions `sitting_out` → `active`, resets strikes to 0. Emits `game.playerReactivated` event. Returns `false` if player not found or not sitting_out.

#### Events

| Event | When |
|---|---|
| `game.playerSittingOut` | Bot hits 3 strikes, transitions to sitting_out |
| `game.playerReactivated` | Bot reactivated back to active |

#### Snapshot Updates

- `buildHotStateSnapshot()`, `getPublicState()` now include `seatStatus` per player.
- Recovery from snapshot correctly derives `seatStatus` (defaults to `"active"` for old snapshots without the field, `"eliminated"` if `disconnected` was true).

---

### 2026-04-03: Bot Builder UI — Radar Chart, Drag-to-Paint Range, Visual Presets

**Enhanced Bot Builder UX with real-time visual feedback and professional interactions.**

#### Persona Visualization (Quick Tier)

**Modified: `frontend/src/components/builder/PersonalityEditor.tsx`**
- Added recharts `RadarChart` (spider web) displaying 4 personality axes in real-time as sliders move.
- Radar uses `C.accent` (#00e5ff) fill at 25% opacity, matching the dark theme.
- 2-column layout: radar chart on left, sliders on right (stacks on mobile via media query).
- Preset buttons now show emoji icons matching personality archetypes:
  - Shark, Rock, Maniac, Calling Station, Nit, Balanced Pro, Tricky, Bully
- Icons displayed prominently with `getPresetIcon()` helper (falls back to robot emoji).

#### Interactive Range Chart (Pro Tier)

**Modified: `frontend/src/components/builder/RangeChart.tsx`** — full rewrite
- **Drag-to-Paint**: Click & drag across cells to paint multiple hands with the selected action.
  - Paint mode selector: 4 buttons (Raise, Call, Fold, Clear) above the grid.
  - `onMouseDown` starts painting, `onMouseEnter` paints hovered cells, `onMouseUp` flushes batch to parent.
  - Touch support via `onTouchStart`/`onTouchMove`/`onTouchEnd` with `document.elementFromPoint`.
  - Batch updates: changes accumulated in a ref during drag, single `onChange()` call on release.
  - Optimistic local state: cells show paint color immediately during drag.
- **Range Statistics**: Real-time combo-weighted stats below the grid.
  - Pairs = 6 combos, Suited = 4, Offsuit = 12 (total: 1326).
  - Progress bar showing % of range played.
  - Breakdown: Raise/Call/Fold counts with percentages.
- Grid cells use `cursor: crosshair` to indicate paint mode.
- `userSelect: none` on grid container prevents text selection during drag.

#### Dependencies

**Modified: `frontend/package.json`**
- Added `recharts` (lightweight charting library, ~45KB gzipped).

---

### 2026-04-03: Strategy Engine Performance — Bitwise LUT, Memoization, LRU, Lazy Eval

**Optimized the strategy evaluation hot path for high-speed worker simulations.**

#### Bitwise Range Chart LUT

**Modified: `src/modules/bot-strategy/evaluators/range-chart.evaluator.ts`** — full rewrite
- Range charts now compile to a `Uint8Array(169)` indexed by numeric hand index (0=pair, 13-90=suited, 91-168=offsuit).
- Action encoding: `0=fallthrough, 1=fold, 2=call, 3=raise` — single byte per hand.
- `holeCardsToIndex()`: Computes hand index from card values + suited flag with zero string allocation.
- `evaluateCompiledRangeChart()`: O(1) array index access, no Map hashing or string alloc.
- 169 bytes fits in ~3 cache lines — trivially L1 cache resident.

**Modified: `src/domain/bot-strategy/strategy.types.ts`**
- `HydratedRangeChart` changed from `{ lookup: ReadonlyMap<string, RangeAction> }` to `{ lut: Uint8Array }`.

#### Hand/Board Analysis Memoization

**Modified: `src/modules/bot-strategy/strategy-engine.service.ts`**
- `HAND_ANALYSIS_MEMO` and `BOARD_ANALYSIS_MEMO`: Per-street memoization keyed by `(holeCards, communityCards)`.
- Within a street, 6 players calling `analyzeBoard()` with identical community cards → 1 actual computation.
- `clearStreetMemos()` exported and called at start of each hand.

#### Evaluation LRU Cache

**Modified: `src/modules/bot-strategy/strategy-engine.service.ts`**
- `EVAL_CACHE`: 512-entry LRU cache on `evaluateHydrated()`, keyed by `(tier, holeCards, communityCards, street, toCall, canCheck, pot, activeCount, position)`.
- `clearEvalCache()` exported and called at start of each hand.
- Meaningful hit rate in worker simulations where similar board states recur across parallel tables.

#### Lazy Preflop Evaluation

**Modified: `src/modules/bot-strategy/strategy-engine.service.ts`**
- Preflop range chart evaluation now runs **before** `buildGameContext()`.
- If the range chart matches with a non-null action, `resolveActionMinimal()` resolves directly from `payload.action` constraints — skipping `analyzeHand()`, `analyzeBoard()`, and all `GameContext` computation.
- New `resolveActionMinimal()` function handles fold/call/raise sizing from payload constraints only.

#### Cache Clearing

**Modified: `src/services/game/live-game-manager.service.ts`**
- `clearEvalCache()` + `clearStreetMemos()` called at start of each hand in `playHand()` to prevent memory bloat.

---

### 2026-04-03: BotStrategy Recursive Predicates & Kill Switch

Extended the BotStrategy system with OR/AND logic, a 200ms execution kill switch, and runaway-strategy validation.

**Type changes (`src/domain/bot-strategy/strategy.types.ts`):**
- Added `LogicalOperator = "AND" | "OR"`, `ConditionGroup { operator, rules: ConditionNode[] }`, `ConditionNode = Condition | ConditionGroup`
- `Rule.conditions` changed from `Condition[]` → `ConditionNode[]` (backward-compatible; flat conditions satisfy `ConditionNode`)
- Added `MAX_CONDITION_DEPTH = 10` and `MAX_CONDITION_NODES = 100` constants

**Evaluator (`src/modules/bot-strategy/evaluators/rule.evaluator.ts`):**
- `allConditionsMatch` now walks a `ConditionNode[]` tree recursively via `evaluateNodeList` / `evaluateNode`
- Groups dispatch via `"rules" in node` discriminant; OR uses `nodes.some()`, AND uses `nodes.every()`
- Depth > 10 returns `false` (runaway guard at runtime)

**Validator (`src/domain/bot-strategy/strategy.validator.ts`):**
- `MAX_CONDITION_DEPTH = 10`, `MAX_CONDITION_NODES = 100` enforced at validation time
- New `validateConditionNode()` — discriminates leaf vs group, recurses into `ConditionGroup.rules`
- Depth overflow → hard error; node count overflow → hard error; empty group → warning

**Conflict detector (`src/domain/bot-strategy/strategy-conflict.detector.ts`):**
- Added `flattenLeafConditions()` helper; conflict comparison flattens `ConditionNode[]` to leaf `Condition[]` (advisory best-effort for OR groups)

**Kill switch (`src/services/game/live-game-manager.service.ts`):**
- `getPlayerActionSafe()` is now `async`; wraps `evaluateHydrated` in `Promise.race([decidePromise, 200ms timeout])`
- `clearTimeout` called in both `try` and `catch` branches — no lingering timers in Worker Threads
- Timeout and strategy errors both log via `this.logger.debug(...)` in addition to the existing `logEvent`
- Call site in `bettingRoundLoop` updated to `await this.getPlayerActionSafe(...)`

---

### 2026-04-03: Worker Pool for Tournament Simulation

Replaced the one-per-tournament Worker Thread model with a fixed-size **WorkerPool** that reuses threads across simulations, enabling 100+ concurrent tournament pods without unbounded thread growth.

**New Files:**
- `src/workers/worker-pool.ts` — `WorkerPool` class: fixed-size pool, internal task queue, heartbeat monitor (10s interval, 30s timeout), automatic worker replacement on crash, rolling-window metrics
- `src/workers/pool-tournament-worker.ts` — Loop-based reusable worker; sends `{ type:"ready" }` on startup, receives `{ type:"run", taskId, input }`, processes tournament, posts result, stays alive for next task

**Modified Files:**
- `src/workers/simulation.types.ts` — Added `PoolToWorkerMessage`, `WorkerToPoolMessage` union types, `PoolMetrics` interface
- `src/modules/tournaments/simulation.service.ts` — `onModuleInit` now creates `WorkerPool` (size = `WORKER_POOL_SIZE` env var, default `os.cpus().length`); `startSimulation` calls `pool.dispatch()` instead of `new Worker()`; added `getPoolMetrics()` method
- `src/modules/tournaments/tournaments.controller.ts` — Added `GET simulation/pool-metrics` endpoint (admin-only, before `GET :id` route)

**Environment Variable:**
- `WORKER_POOL_SIZE` — number of worker threads in the pool (default: `os.cpus().length`)

**What did NOT change:**
- `tournament-simulation.worker.ts` — preserved as-is (one-shot worker still works for direct use)
- All poker logic (`runTournament`, `runTableGame`, `GameInstance`) — verbatim copy in pool worker
- `getStatus()`, `getResult()` API — unchanged behaviour
- `BatchTournamentPersistenceService` persistence call — identical

**API:**
```
GET /api/v1/tournaments/simulation/pool-metrics
→ { poolSize, activeWorkers, idleWorkers, queuedTasks, totalTasksCompleted, totalTasksFailed, recentAvgWaitMs, recentAvgTaskMs }
```

### 2026-04-03: Professional Showdown Rules — Last Aggressor, Muck/Show, Step-by-Step Reveal

**Implements professional poker showdown sequence with ordered reveals and muck option.**

#### Last Aggressor Tracking

**Modified: `src/services/game/live-game-manager.service.ts`**
- `GameInstance` gained `lastAggressorId` field — tracks the last player to bet/raise across all streets.
- Reset at the start of each hand in `playHand()`.
- Updated in `bettingRoundLoop()` on every successful bet/raise action.

#### Showdown Sequence Logic

**Modified: `src/services/game/live-game-manager.service.ts`** — `showdown()` fully refactored:
- **Scenario A (River aggression):** Last aggressor shows first.
- **Scenario B (Check-check):** First active player clockwise from dealer shows first.
- **Muck mechanism:** After first player shows, subsequent players can muck if their hand is weaker than the current best shown hand. Winners and players with hands that beat/tie the current best must always show.
- **Step-by-step reveal:** Each player revealed in order with `animSleep(800)` between reveals. Per-reveal `game.showdownReveal` event emitted for UI consumption.
- **cardStatus tracking:** Each player assigned `"shown"`, `"mucked"`, or `"hidden"` (folded). Mucked players' holeCards cleared from event payload.
- Pot distribution logic unchanged — winnings still correctly calculated per pot with side-pot support.

#### Data Persistence

**New migration: `src/migrations/1743600000000-AddCardStatusToHandPlayers.ts`**
- Adds `card_status VARCHAR(10) NOT NULL DEFAULT 'hidden'` to `hand_players` table.

**Modified: `src/entities/hand-player.entity.ts`**
- Added `card_status: "shown" | "mucked" | "hidden"` column.

**Modified: `src/services/game/game-data-persistence.service.ts`**
- `HandCompleteEvent` type expanded with `cardStatus` per player and `showdownSequence` array.
- `onHandComplete()` now persists `card_status` for each player.

#### Event Emission

**Modified: `src/modules/games/games.gateway.ts`**
- New `game.showdownReveal` → `showdownReveal` WebSocket event: per-player reveal with cardStatus, holeCards (if shown), hand info, isWinner flag.
- `handResult` event enhanced with optional `showdownSequence` array for complete ordered reveal data.

#### WebSocket Events (New)

| Event | Room | Payload |
|---|---|---|
| `showdownReveal` | `table:{tableId}` | `{ playerId, playerName, cardStatus, holeCards?, hand?, isWinner }` |

`handResult` now also includes `showdownSequence?: Array<{ playerId, cardStatus, hand?, order }>`.

---

### 2026-04-03: Idempotent Recovery, Game Heartbeat, Event-Driven Tournament Director

**Architectural hardening pass — strengthened recovery, added crash detection, pruned polling.**

#### Idempotent Recovery with Pot State (Phase 1+2)

**Modified: `src/services/game/live-game-manager.service.ts`**
- `RecoverySnapshot` now includes `pot_state` (playerTotalBets, playerBetsThisRound, pots) for mid-hand recovery.
- `buildHotStateSnapshot()` serializes pot manager state into the Redis snapshot.
- `recoverFromSnapshot()` now:
  - Restores `actionSeq` from snapshot (was resetting to 0).
  - Refunds pot chips back to players for clean recovery (avoids fragile mid-hand reconstruction).
  - Resets mid-hand state (folded, allIn, holeCards, communityCards) so next hand starts cleanly.
  - Calls `startGame()` after recovery — recovered games now actually resume play.
- `GameInstance` gained `lastActivityAt` field for heartbeat monitoring.

**Modified: `src/services/game/game-data-persistence.service.ts`**
- `onHandComplete()` now checks `finished_at IS NOT NULL` before the transaction — skips already-finalized hands to prevent double-counting stats on recovery replay.

#### Game Loop Heartbeat (Phase 3)

**Modified: `src/services/game/live-game-manager.service.ts`**
- `LiveGameManagerService` now implements `OnModuleInit` with a 30-second heartbeat monitor.
- Checks each running game's `lastActivityAt`; if silent >120s, stops the game and emits `game.stuck`.
- `lastActivityAt` updated on every player action and at the top of each game loop iteration.

**Modified: `src/services/game/game-recovery.service.ts`**
- Listens for `game.stuck` events and triggers immediate recovery from the Redis hot state.
- Fetches hot state via `hotStateService.getHotState(gameId)` and emits `game.recovery.start`.

#### Event-Driven Tournament Director (Phase 4)

**Modified: `src/modules/tournaments/tournament-director.service.ts`**
- Replaced 1-second polling loop (`runGameLoop()`) with event-driven handlers:
  - `game.handComplete` → bust detection, chip sync, blind advance, table balance.
  - `game.finished` → disconnected straggler handling, table cleanup.
  - `game.stuck` → error recovery for stuck tournament tables.
- 30-second safety-net interval replaces 1s loop (only checks tournament completion).
- Event listeners stored in `eventHandlerRefs[]` and cleaned up on `stop()` / `finishTournament()`.
- `finishTournament()` guarded against double-finish from concurrent event + safety-net.

---

### 2026-04-03: Hot/Cold Game Recovery + Worker Heartbeat + Strategy Engine Hydration

**Architectural reliability pass — no new external dependencies.**

#### Hot/Cold State Model

**New file: `src/services/game/game-hot-state.service.ts`**
- Listens to `game.hotState` events (fired per player action) and writes a full recovery snapshot to Redis: `hot:game:{gameId}`, TTL 4h.
- Includes player **strategies** (missing from prior DB snapshots — existing DB recovery was broken for strategy-less bots).
- Listens to `game.finished` to delete the Redis key.
- Provides `getHotState(gameId)` and `scanActiveHotStates()` for recovery.
- Registered in `ServicesModule` (providers + exports).

**Modified: `src/services/game/game-recovery.service.ts`**
- Now checks Redis hot states **first**, falls back to Postgres snapshots.
- Merges both sources by `gameId` — prefers higher `action_seq` (Redis wins on ties = fresher).
- Unified `validateActivePlayers()` accepts both hot (`RecoverySnapshot`) and cold (`GameStateSnapshot`) shapes.
- Age check normalises `last_action_at` as ISO string (hot) or `Date` (cold).

**Modified: `src/services/game/live-game-manager.service.ts`**
- `RecoverySnapshot` interface is now exported (was private).
- Added `action_seq?: number` and `last_action_at?: string` to `RecoverySnapshot` for idempotency tracking.
- `GameInstance` gained `actionSeq = 0` counter (incremented in `emitPlayerAction`).
- New private `buildHotStateSnapshot()` — serialises full game state including strategies and raw card objects.
- `emitPlayerAction()` now also emits `game.hotState` (fire-and-forget) after each action.

**Modified: `src/services/game/game-state-persistence.service.ts`**
- Default `GAME_STATE_PERSIST_INTERVAL_MS` raised from **5 000 ms → 30 000 ms**.
- Redis handles per-action recovery; Postgres is the cold/historical store.

#### Strategy Engine Hydration (compile-once, evaluate fast)

**Modified: `src/modules/bot-strategy/strategy-engine.service.ts`**
- Bounded LRU hydration cache (max 256 entries).
- `hydrateStrategy()` / `getOrHydrateStrategy()` / `clearHydrationCache()` exported.
- `evaluateHydrated()` hot path: O(1) Map range-chart lookup, pre-sorted rule arrays, no re-sort per action.
- `evaluateStrategy()` is now a backward-compat wrapper around `evaluateHydrated(getOrHydrateStrategy(...))`.
- Dead `resolveEffectiveStrategy()` function removed.

**Modified: `src/services/game/live-game-manager.service.ts`** (hydration wire-up)
- `GamePlayer` interface gained `hydratedStrategy: HydratedStrategy`.
- `addPlayerImmediate()` calls `getOrHydrateStrategy()` on join.
- Reconnect + `recoverFromSnapshot()` paths re-hydrate strategy.
- `getPlayerActionSafe()` hot loop calls `evaluateHydrated(player.hydratedStrategy, ...)`.

#### Worker Heartbeat & Stale-Job Detection

**Modified: `src/workers/tournament-simulation.worker.ts`**
- Posts `{ type: 'heartbeat', timestamp }` every **10 s** via `parentPort.postMessage`.
- Interval is cleared before posting the final result or error message.

**Modified: `src/modules/tournaments/simulation.service.ts`**
- `SimulationJob` gained `lastHeartbeat: Date` (initialised to `startedAt`).
- `worker.on('message')` now handles heartbeat messages (update `lastHeartbeat`, early return).
- `OnModuleInit` starts a **15 s** monitor that marks any running job **failed** if last heartbeat > **30 s** ago.
- `OnModuleDestroy` clears the monitor interval.

#### New Tests

- `tests/unit/bot-strategy/strategy-engine-hydration.spec.ts` — 22 tests covering cache hits/misses, rule sort/filter, Map range chart, position override merge, all `evaluateHydrated` paths.

---

### 2026-04-03: Headless Tournament Simulation (Worker Thread, pokersolver, Batch Persistence)

**New Files:**
- `src/workers/simulation.types.ts` — Input/output plain-object types for the worker
- `src/workers/tournament-simulation.worker.ts` — Standalone Worker Thread that runs an entire tournament at CPU speed (no DB, no NestJS DI, no sleeps)
- `src/domain/handEvaluatorPokersolver.ts` — pokersolver-backed drop-in replacement for hand evaluation (used by worker; live games keep the original handEvaluator.ts)
- `src/services/game/batch-tournament-persistence.service.ts` — Bulk-INSERTs simulation audit trail (games→hands→hand_players→actions in CHUNK_SIZE=500 batches), updates tournament_entries, applies payouts
- `src/modules/tournaments/simulation.service.ts` — Spawns the worker, tracks job status, calls batch persistence on completion

**Modified Files:**
- `src/services/game/live-game-manager.service.ts` — Added `turboMode?: boolean` to GameInstance constructor (sets sleepMs=0)
- `src/modules/tournaments/tournaments.controller.ts` — 3 new admin endpoints: POST `/:id/simulate`, GET `/:id/simulate/:jobId`, GET `/:id/simulation-result`
- `src/modules/tournaments/tournaments.module.ts` — Registered SimulationService and BatchTournamentPersistenceService

**New Tests:**
- `tests/unit/hand-evaluator-pokersolver.spec.ts` — 7 tests covering card-format conversion and winner determination via pokersolver
- `tests/unit/simulation-worker-helpers.spec.ts` — 17 tests covering blind-level advancement, table assignment, stage normalization, card conversion

**API:**
```
POST /api/v1/tournaments/:id/simulate         → { jobId }
GET  /api/v1/tournaments/:id/simulate/:jobId  → { status, summary? }
GET  /api/v1/tournaments/:id/simulation-result → SimulationOutput (full audit trail)
```

**Dependencies added:** `pokersolver` npm package

**Architecture notes:**
- Worker runs outside NestJS DI — creates EventEmitter2 directly, no database writes during simulation
- Multi-table: tables run in parallel (`Promise.all`); each table game runs to completion (one winner); bots rebalanced after each round
- Blind levels advance globally by total hands played across all tables
- Audit trail persisted after worker completes (not during simulation) — single large transaction with CHUNK_SIZE=500 bulk inserts

---

### 2026-04-01: Complete Tournament System (Discovery, Registration, Lobby, Live Viewing, Results)

**New Features:**
- ✅ Tournament discovery page with grid layout and filtering
- ✅ Tournament detail page with live registration
- ✅ Tournament lobby/waiting room with countdown timer
- ✅ **Live tournament viewing with split-screen layout**
  - GameSpectator on left for live game table
  - Tournament context sidebar on right with meta-info
  - Auto-fetches current table info from backend
  - Real-time tournament state updates (polls every 10s)
  - Shows table #, seat position, blind level, remaining players
  - Graceful elimination handling
- ✅ **Tournament results & final standings (NEW)**
  - Ceremonial podium for top 3 finishers (gold/silver/bronze)
  - Prize payouts clearly displayed
  - Full leaderboard table for all participants
  - User's result highlighted
  - Shareable results page design
- ✅ Real-time tournament state updates via WebSocket
- ✅ Real-time player list with join times
- ✅ Bot selection modal for registration
- ✅ Real-time participant notifications
- ✅ Connection status indicator
- ✅ Auto-redirect to live game when tournament starts
- ✅ Auto-redirect to results when tournament ends
- ✅ Leave tournament button (during registration phase)

**Backend Files Added:**
- `src/modules/tournaments/dto/my-table-response.dto.ts` — DTO for table info response
- `src/modules/tournaments/dto/tournament-results.dto.ts` — DTOs for results response
- `src/modules/tournaments/tournaments.controller.ts` — Enhanced `/tournaments/:id/results` endpoint (public)
- `src/modules/tournaments/tournaments.service.ts` — Added `finalizeTournament()`, `getCompleteResults()` methods
- `src/repositories/tournament.repository.ts` — Added `findUserCurrentSeat()` and `countActivePlayers()` methods

**Frontend Files Added:**
- `frontend/src/pages/TournamentsPage.tsx`
- `frontend/src/pages/TournamentDetailPage.tsx`
- `frontend/src/pages/TournamentLobbyPage.tsx`
- `frontend/src/pages/TournamentLivePage.tsx`
- `frontend/src/pages/TournamentResultsPage.tsx` — **NEW (final standings)**
- `frontend/src/hooks/useTournamentSocket.ts`
- `frontend/src/hooks/useTournamentLobby.ts`
- `frontend/src/components/tournaments/BotSelectionModal.tsx`
- `frontend/src/components/tournaments/TournamentCard.tsx`
- `frontend/src/components/tournaments/CountdownTimer.tsx`
- `frontend/src/components/tournaments/TournamentContext.tsx`
- `frontend/src/components/tournaments/Podium.tsx` — **NEW (top 3 visualization)**
- `frontend/src/components/tournaments/ResultsTable.tsx` — **NEW (full leaderboard)**

**Files Updated:**
- `frontend/src/App.tsx` — Added routes for `/tournaments/:id/lobby`, `/tournaments/:id/live`, `/tournaments/:id/results`
- `frontend/src/pages/TournamentDetailPage.tsx` — Redirect to lobby after join
- `frontend/src/pages/TournamentLivePage.tsx` — "View Results" button on elimination screen
- `frontend/src/pages/Home.tsx` — Added "Browse all" tournaments button
- `docs/TESTING.md` — Added tournament testing section
- `CLAUDE.md` — This file

**Tournament User Flow:**
1. User browses tournaments on `/tournaments` (TournamentsPage)
2. Clicks tournament → `/tournaments/:id` (TournamentDetailPage with details & registration)
3. Joins with bot → Auto-redirects to `/tournaments/:id/lobby` (TournamentLobbyPage with countdown)
4. Tournament starts → Auto-redirects to `/tournaments/:id/live` (TournamentLivePage with GameSpectator + context)
5. Bot is eliminated → Shows elimination screen with link to results
6. Views results → `/tournaments/:id/results` (TournamentResultsPage with podium + leaderboard)

**Status:** Frontend 100% complete ✅ | Backend Tournament Results 100% complete ✅ | Backend Broadcasting TODO (3-4 hrs)

### 2026-03-30: Documentation Reorganization & UI Testing Optimization

**Changes:**
- ✅ **Moved to root `docs/`**: DEPLOYMENT.md, SECURITY.md, BOT_DEVELOPER_GUIDE.md (more prominent)
- ✅ **Updated guides**: QUICKSTART.md (now uses `npm run game:watch`), DEMO-GAMES.md (references new testing commands)
- ✅ **UI bug detection optimized**:
  - 30s duration → 15s (captures 5 screenshots vs 9)
  - 3s interval → 5s (fewer redundant frames)
  - Parallel Gemini API calls (3 batches vs 9 sequential)
  - Single screenshot folder with auto-cleanup
  - **Result:** 2.7x faster, 70% less API quota used
- ✅ **Central bug tracking**: POKER_BUGS.md auto-updated by Gemini detection system
- ✅ **ADR folder preserved**: Kept for architectural decisions (migrations, patterns)

**Files Affected:**
- `src/testing-utilities/ui-bug-reporter.ts` — Optimized screenshot capture, auto-cleanup
- `src/testing-utilities/ui-bug-detector.ts` — Parallel API batching
- `scripts/detect-ui-bugs.sh` — Updated timing
- `docs/DEPLOYMENT.md` — Moved from guides/
- `docs/SECURITY.md` — Moved from guides/
- `docs/BOT_DEVELOPER_GUIDE.md` — Moved from guides/ (added status note)
- `docs/guides/QUICKSTART.md` — Updated to current app
- `docs/guides/DEMO-GAMES.md` — Updated with new commands
- `CLAUDE.md` — Updated documentation section

**Deleted (Stale/Obsolete):**
- `docs/reports/` (stale performance/tech-debt audits, replaced by root docs)
- `docs/AI_CONTEXT.md` (duplicates BOT_DEVELOPER_GUIDE.md, outdated UI paths)
- `docs/plans/PLAN-poker-ui-upgrade.md` (abandoned, not implemented)

**Updated Core Docs:**
- `docs/TESTING.md` — Removed deleted frontend test file references, added game invariant testing docs, added Gemini UI bug detection section
- `docs/guides/QUICKSTART.md` — Updated to current app paths and commands
- `docs/guides/DEMO-GAMES.md` — Updated to current app paths and commands

**Why:** Cleaner structure (272K vs 500K+), faster testing iterations, removed outdated planning noise, eliminated stale QA artifacts, single source of truth for docs, docs now match actual testing systems
