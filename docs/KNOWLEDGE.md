# Poker Engine — Knowledge Base

A running record of non-obvious design decisions, conventions, and gotchas.
Update this whenever a decision is made, reversed, or a new gotcha is discovered.

For data-specific decisions, see DATA.md.
For tournament rules, see TOURNAMENT_RULES.md.

---

## Architecture Decisions

### Tournaments replace cash tables entirely
The original cash table model (`tables.config.js`, `POST /games`) is gone. All competitive play happens in tournaments. The `PokerGame` engine is tournament-unaware — `TournamentDirector` wraps it.

### `PokerGame` is DB-free and tournament-agnostic
No imports from `db.js` or `tournament.js` in `game.js`. This keeps it testable in isolation. The `GameRecorder` attaches via monkey-patching to persist data without the engine knowing.

### Zero npm dependencies in production
Only Node 22 built-ins: `node:sqlite`, `node:crypto`, `node:http`, `node:net`. Eliminates supply chain risk. The custom WebSocket server in `src/ws.js` exists because of this constraint. Maintain it as long as feasible.

### WebSocket server is hand-rolled
`src/ws.js` implements RFC 6455 from scratch — upgrade handshake, frame parsing/building, ping/pong, per-table subscriptions. Supports text frames only (sufficient for JSON). Chosen to preserve zero-dependency status.

### Tournaments are system-only resources
No API endpoint creates tournaments at runtime. They're provisioned from `tournaments.config.js` at startup via `INSERT OR IGNORE`. Operators add tournaments by editing the config and restarting. Prevents pool fragmentation and abuse.

---

## Bot Protocol Decisions

### Raise amount = additional chips, not total bet
`{ type:"raise", amount:100 }` means raise 100 on top of the call. Bot puts in `toCall + 100` total. `maxRaise` = `player.chips - toCall` (max additional raise before all-in).

**Why:** More intuitive. Bot developers think "I want to raise by X", not "my total bet should be Y".

### `you.bestHand` only on flop onwards
Absent pre-flop (no community cards to evaluate). Present on flop, turn, river. Contains `{ name, cards }` — the hand name and 5 specific cards making it.

### Opponent hole cards never sent
`players[]` never includes opponent cards. Only revealed at showdown via `onHandComplete`. Bots learn the outcome, not the process.

### `you` block is a shortcut
Bot's own data appears in both `you` and `players[]`. `you` saves bots from searching the array.

### `table.ante` included in every payload
Bots need to account for ante in stack depth calculations. A bot with 500 chips facing 25 ante + 50 BB + 100 toCall has far less effective stack than the chips number suggests.

---

## Game Engine Decisions

### Antes posted before blinds
All active players post ante first, then SB and BB. Matches standard tournament ante structure. Ensures the pot is built before anyone folds pre-flop.

### Antes from level 1
Antes apply from the very first blind level. Creates immediate pressure and makes every hand meaningful from the start. Most platforms defer antes to level 3–4 — we chose to front-load pressure for a more action-oriented game.

### 3-strike disconnection, not immediate
A bot failure (timeout, error, bad JSON) gets a strike and a penalty fold. After 3 **consecutive** failures it's disconnected. Strikes reset on any successful response. Tolerates brief network blips.

### Penalty fold is recorded differently from intentional fold
`actions.is_penalty = 1` when the server folded on the bot's behalf. A bot that always folds looks identical to one that's timing out without this flag. Critical for detecting unstable bots vs conservative strategy.

### Auto-start deferred with `setImmediate`
`addPlayer()` triggers `startGame()` via `setImmediate` not synchronously. Allows tests to call `game.stop()` in the same tick before the loop starts.

### 1500ms sleep between hands
After each hand, the loop sleeps 1500ms. Gives the UI time to render the final state and prevents hands blurring in the log.

---

## Tournament Decisions

### Global hand count for blind advancement
Blind levels advance every 10 hands counted across ALL active tables simultaneously. A 3-table tournament advances 3x faster than a 1-table one. Standard online MTT behavior — consistent pressure regardless of table count.

### Table breaking threshold is 4 players
When a table falls to ≤4 players AND another can absorb them without exceeding 9, it breaks. Prevents prolonged short-handed play which distorts strategy significantly.

### Final table = table_number 99
Convention for easy querying. When `activeBots.size ≤ 9` and `tables.size > 1`, all tables break and table 99 is created. `WHERE table_number = 99` finds it.

### Late entries receive full starting stack
Even at level 4, late entrants get full `starting_chips`. They're severely disadvantaged (arriving at maybe 5BB effective) but that's intentional and matches real online tournament behavior.

### Payout rounding remainder goes to 1st place
`Math.floor` for all payout amounts. Unallocated chips go to the winner. Standard practice — better than losing chips from the pool.

### Seat history instead of overwriting
`tournament_seats` is a live snapshot (upserted on moves). `tournament_seat_history` is the full movement log — every table a bot sat at, chips on arrival, reason for move, timestamps. This is important analytics data.

### `_handLock` prevents race conditions
Multiple tables complete hands near-simultaneously. `_handLock` prevents concurrent `_onHandComplete` calls from racing on bust detection and rebalancing. SQLite is single-writer, but in-memory state also needs consistency.

### `onPlayerRemoved` = tournament bust
When a bot hits 3 strikes, the director treats it as a chip bust — eliminated at current finish position. In a real tournament a disconnected player's stack would blind off. For bots we simplify — a disconnected bot can't play anyway.

---

## Recorder Decisions

### Antes and blinds recorded as action rows
Antes (type=`ante`) and blind posts (type=`blind`) are recorded in the `actions` table alongside voluntary actions. This completes the financial story of every hand — the forced bets are part of the chip accounting.

### All hole cards stored at showdown
Previously only winners' hole cards were stored. Now all players' cards are stored at showdown — including players who were called and lost. Enables "what did I get called by?" analysis and full hand replays.

### Best hand stored for all showdown players, not just winner
The loser's best hand at showdown is computed but was previously thrown away. Now stored in `hand_players.best_hand` and `best_hand_cards` for all players. Enables "second-best hand" analysis.

### bot_stats updated incrementally per hand
`bot_stats` is a materialized aggregate table updated by the recorder after every hand. Leaderboard queries read one row per bot rather than re-aggregating from millions of action rows. Raw counters (`_vpip_count`, `_vpip_hands`, etc.) are stored alongside the derived rates so incremental updates are exact.

### response_ms recorded per action
Every voluntary action captures the bot's response latency. Enables: average response time stats, detecting bots that strategically delay (stalling), performance analysis across different server locations.

---

## Security Decisions

### API keys stored as SHA-256 hashes
`users.api_key` stores `SHA-256(rawKey)`. Raw key returned once at registration, never stored. A full DB dump is useless without the raw keys.

### Rate limiting is in-memory sliding window
Per-key timestamp array. Pruned on each check. Sufficient for single-process deployment. When scaling to multiple processes, replace the store with Redis while keeping the same interface.

### Atomic join uses `BEGIN EXCLUSIVE`
The seat check + insert uses SQLite's strictest lock. Two concurrent requests for the same bot cannot both pass the "already seated" check.

### Body size limit is 64KB
Enforced in `parseBody()` — bytes counted as they stream in. Exceeding it destroys the connection and returns 413.

---

## Conventions

### Card format
Strings: `"A♠"`, `"10♦"`, `"K♥"`. Rank first, then Unicode suit. Hidden: `"??"`. Internally: `{ rank, suit, value }` where value is 2–14 (Ace=14).

### Dealer rotation
`dealerIndex` advances by 1 each hand (`% players.length`). Broke/disconnected players skipped during active index resolution but remain in the array.

### Side pots
`PotManager.calculatePots()` runs at end of each betting street. Splits into multiple pots for all-in situations. Each pot has `eligiblePlayerIds`. Showdown awards each pot independently.

### Burn cards
One card burned before flop, turn, and river — standard casino rules.

### All timestamps are Unix epoch integers
`unixepoch()` in SQLite. Easier arithmetic than ISO strings. Consistent across all tables.

---

## Known Gaps / Future Work

- **Scheduled tournament start** — `type:'scheduled'` exists in config but no timer fires at `scheduled_start_at`
- **No tournament reset** — finished tournaments can't be restarted without manual DB changes
- **`exampleBot.js` deleted** — the old cash game bot template has been removed; `bots/` directory has the replacements
- **No backup strategy implemented** — see DATA.md for recommended approach
- **bot_stats recompute migration** — if `bot_stats` gets out of sync, there's no built-in script to rebuild it from `actions` + `hand_players`
- **Single process only** — no clustering. Acceptable until real user load demands it.

---

## Bugs Found and Fixed During Simulation

These were discovered by running `simulate.js` and `scenarios.js` against the live system. Each one represents a real failure that would have affected production.

### `games.table_id` FK constraint crash
`games` had `REFERENCES tables(id)` but tournament games belong to `tournament_tables`. Caused an immediate crash when the first game was created. Fixed by removing the FK — it's a logical reference only.

### `potManager` not cleared after payout
Both `_awardPot()` and `_showdown()` distributed chips to players but never zeroed `potManager.pots`. After the hand, `getTotalPot()` still returned the distributed chips, causing the chip conservation check to see double the expected total. Fixed by clearing `potManager.pots` immediately after payout.

### `survivors` wrong shape in `_consolidateToFinalTable`
When consolidating to the final table, `survivors` was built with `{ id, chips, name, endpoint }` but `_startTable` expects `{ botId, chips, name, endpoint }`. Caused a crash on every multi-table tournament when the final table formed. Fixed by using `botId` key.

### `UNIQUE(tournament_id, bot_id)` constraint blocked rebuys
The `tournament_entries` table had a UNIQUE constraint preventing multiple entries per bot per tournament. A bot that busted and tried to rebuy got a constraint violation. Fixed by removing the constraint and enforcing uniqueness at the application layer instead (check `finish_position IS NULL` before blocking registration).

### `activePlayers` filter excluded all players on hand 1
In `recorder.js` `_beforeHand()`, `activePlayers` was filtered on `p.folded === false`. But players start with `folded = true` after `addPlayer()` and only have `folded` reset when `playHand()` begins. So on hand 1, no players passed the filter — antes weren't recorded and `hand_players` rows weren't created for the first hand. Fixed by filtering on `chips > 0 && !disconnected` only (ignoring `folded` at hand start).

### `setEntryPayout` only updated active entries
`setEntryPayout` had `WHERE ... AND finish_position IS NULL`. But when `_finishTournament` assigns payouts, busted players already have `finish_position` set from when they busted. So only 1st place (the active winner) ever received a payout — all other positions had their payout set to 0. Fixed by updating the most recent entry by `entered_at DESC` regardless of `finish_position`.

### `getTournamentResults` returned multiple rows per bot on rebuys
After removing the UNIQUE constraint, a bot that rebuyed appeared twice in results — once for each entry row. Fixed by using `GROUP BY bot_id` with `MIN(finish_position)` and `SUM(payout)`.

### `getHandHistory` only returned one table's hands
The history endpoint fetched games for a single `table_id`. In multi-table tournaments, hands from other tables were invisible. Fixed by adding `getTournamentHandHistory` which queries by `tournament_id` across all games, and adding `GET /tournaments/:id/history` endpoint.

---

## Bugs Found in Second Simulation Round (bugs2.js)

### `turn_timeout_ms` too high causes crasher bot hangs
`turn_timeout_ms: 10000` combined with `crasher` bot's `sleep(15000)` stalls every hand the crasher touches by 10 full seconds. In a real tournament this means one misbehaving bot can slow an entire table to a crawl. Test infrastructure uses `500ms` timeout. Production should consider a lower default (3–5s) for bot responsiveness.

### `startGame` re-wrap ordering in recorder
`addPlayer` guards second game loops with `if (!this.running)` — correct. But patching `game.startGame` before `recorder.attach()` gets overwritten. The invariant (no second loop) holds, but the patching approach is fragile. Note: never patch `startGame` before `recorder.attach()` is called.

### Sequential test queue essential for async tests
Without a sequential queue, async tournament tests run in parallel and share the in-memory DB — causing non-deterministic failures. All test files use `_queue` + `_drain()` pattern to serialize execution.

### Confirmed working under stress
- 50% crasher bot field completes with correct payouts
- Disconnected bots eliminated, tournament continues to clean finish
- `_handLock` proven to prevent concurrent `_onHandComplete` — max 1 concurrent call even with 18-bot 2-table tournament
- Two simultaneous tournaments don't interfere with each other
- Table break chip accounting stays clean across entire 18-bot run
- Late entry on multi-table tournament correctly placed
