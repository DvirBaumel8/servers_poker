# Poker Engine — Data Architecture

This document is the authoritative reference for everything related to data persistence.
It covers the full schema, what is recorded and why, analytics model, and operational rules.

Update this file whenever: a table is added or changed, a field is added or removed,
a recording decision changes, or a new analytics query is introduced.

---

## Philosophy

**The data is the product.**

The game engine generates a complete audit trail of every tournament:
every ante, every blind, every raise, every fold, every showdown card.
This is the foundation for everything valuable downstream:
bot analytics, hand replays, strategy research, cheat detection,
leaderboards, subscription features, and future API products.

Rules that follow from this:
- **Never hard-delete any gameplay record.** Use soft deletes (active=0) or archival.
- **Record causality, not just outcome.** Don't just store who won — store every action that led there.
- **Snapshot context at the moment of the event.** Store blinds/ante on the hand row, chips_before/after on every action. Don't rely on joins to reconstruct what was true at a point in time.
- **Materialize expensive aggregates.** `bot_stats` is updated incrementally after each hand so leaderboard queries never re-scan millions of action rows.

---

## Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `uid()` — timestamp + random |
| username | TEXT UNIQUE | display name |
| email | TEXT UNIQUE | optional |
| api_key | TEXT UNIQUE | SHA-256(rawKey) — never the raw key |
| created_at | INTEGER | Unix epoch |

### `bots`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| user_id | TEXT FK→users | |
| name | TEXT UNIQUE | display name, used at tables |
| endpoint | TEXT | HTTP URL for action calls |
| description | TEXT | optional |
| active | INTEGER | 1=active, 0=soft-deleted |
| last_validation | TEXT | JSON of most recent validation report |
| last_validation_score | INTEGER | 0–100, for quick display |
| created_at / updated_at | INTEGER | |

### `tournaments`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | from config (e.g. `tourn_micro`) |
| name | TEXT | |
| status | TEXT | registering → running → final_table → finished |
| type | TEXT | rolling \| scheduled |
| buy_in | INTEGER | chips to enter |
| starting_chips | INTEGER | stack each entrant receives |
| max_players / min_players | INTEGER | capacity bounds |
| players_per_table | INTEGER | default 9 |
| turn_timeout_ms | INTEGER | per-action limit |
| late_reg_ends_level | INTEGER | last level allowing new entries |
| rebuys_allowed | INTEGER | 1=yes |
| scheduled_start_at | INTEGER | NULL for rolling |
| started_at / finished_at | INTEGER | lifecycle timestamps |
| created_at | INTEGER | |

### `tournament_entries`
One row per buy-in. A rebuy creates a new row (the UNIQUE constraint is removed on bust).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| tournament_id | TEXT FK | |
| bot_id | TEXT FK | |
| entry_type | TEXT | initial \| rebuy \| re_entry |
| chips_at_entry | INTEGER | always the full starting stack |
| busted_at_level | INTEGER | blind level when eliminated, NULL=still in |
| finish_position | INTEGER | final rank, NULL=still in |
| payout | INTEGER | chips won, 0 if no cash |
| entered_at | INTEGER | |

### `tournament_tables`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| tournament_id | TEXT FK | |
| table_number | INTEGER | 1,2,3... 99=final table |
| status | TEXT | active \| breaking \| broken |
| game_id | TEXT FK→games | currently running game |
| created_at | INTEGER | |

### `tournament_seats`
Current seat for each active bot. Upserted on every table move — use `tournament_seat_history` for full movement log.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| tournament_id | TEXT FK | |
| tournament_table_id | TEXT FK | |
| bot_id | TEXT FK | UNIQUE(tournament_id, bot_id) |
| seat_number | INTEGER | 1–9 |
| chips | INTEGER | kept in sync after every hand |
| status | TEXT | active \| busted \| moved |
| seated_at | INTEGER | |

### `tournament_seat_history`
Full movement log — every time a bot changes tables, a record is opened and the previous one is closed.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| tournament_id | TEXT FK | |
| tournament_table_id | TEXT FK | |
| bot_id | TEXT FK | |
| seat_number | INTEGER | |
| chips_on_arrival | INTEGER | stack when they sat down at this table |
| reason | TEXT | initial \| table_break \| balance_move \| late_entry |
| seated_at | INTEGER | when they arrived |
| left_at | INTEGER | NULL while still seated |

### `tournament_blind_levels`
One row per level per tournament, opened when the level starts, closed when it ends.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| tournament_id | TEXT FK | |
| level | INTEGER | 1–15 |
| small_blind / big_blind / ante | INTEGER | snapshot of blinds for this level |
| hands_at_level | INTEGER | incremented on every global hand |
| started_at / ended_at | INTEGER | NULL ended_at = current level |

### `games`
One game = one continuous run of a tournament table from start to finish.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| table_id | TEXT FK | the tournament_table row (confusingly named — this is a tournament table, not a cash game table) |
| status | TEXT | running \| finished |
| total_hands | INTEGER | set on finalize |
| started_at / finished_at | INTEGER | |

### `game_players`
Per-bot aggregate for a single game instance. Updated incrementally during the game.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| game_id | TEXT FK | |
| bot_id | TEXT FK | |
| start_chips / end_chips | INTEGER | |
| rank | INTEGER | 1=winner, set on finalize |
| hands_played / hands_won | INTEGER | incremented per hand |
| total_winnings | INTEGER | net chips across all hands in this game |

### `hands`
Every hand dealt. Snapshot of game context at the moment the hand started.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| game_id | TEXT FK | |
| tournament_id | TEXT FK | **denormalized** — avoids 3-join query from hand→game→tournament_table→tournament |
| hand_number | INTEGER | sequential within game |
| dealer_bot_id | TEXT FK | |
| small_blind / big_blind / ante | INTEGER | **snapshot** — what was in effect for THIS hand |
| players_in_hand | INTEGER | how many were dealt cards |
| community_cards | TEXT | JSON array, e.g. `["A♠","K♥","Q♦","J♣","10♠"]` |
| pot | INTEGER | total pot at end of hand |
| stage_reached | TEXT | pre-flop \| flop \| turn \| river |
| went_to_showdown | INTEGER | 1 if cards were tabled |
| started_at | INTEGER | Unix epoch |
| finished_at | INTEGER | |
| duration_ms | INTEGER | wall-clock hand duration |

**Why snapshot blinds on hand?** Because blind levels advance mid-game. Without the snapshot, reconstructing what the blinds were for hand #47 requires joining through blind_levels by timestamp — fragile and slow.

### `hand_players`
One row per player per hand. The core analytics unit.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| hand_id | TEXT FK | |
| bot_id | TEXT FK | |
| position | TEXT | BTN, SB, BB, UTG, etc. |
| hole_cards | TEXT | JSON — filled at showdown for all players, not just winners |
| start_chips / end_chips | INTEGER | before/after the hand (including antes and blinds) |
| net | INTEGER | end_chips − start_chips (negative = lost chips this hand) |
| won | INTEGER | 1 if won any pot |
| win_amount | INTEGER | total chips received from pot(s) |
| best_hand | TEXT | hand name — recorded for ALL players at showdown, not just winners |
| best_hand_cards | TEXT | JSON — the 5 specific cards making the best hand |
| folded | INTEGER | 1 if folded |
| folded_street | TEXT | which street they folded on |
| went_all_in | INTEGER | |
| saw_flop | INTEGER | 1 if still in on the flop — used for VPIP calculation |
| saw_showdown | INTEGER | 1 if went to showdown — used for WTSD/WMSD |

**Why store best_hand for losers?** Because "what did the second-best hand fold against?" is one of the most valuable analytics queries. Previously this data was computed but thrown away.

**Why store hole_cards for all showdown players?** Enables hand replays, equity analysis, and "what did I fold against?" queries.

### `actions`
Every chip movement in the game. The most granular table — this is where the real analytical value lives.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| hand_id | TEXT FK | |
| bot_id | TEXT FK | |
| action_seq | INTEGER | ordering within the hand |
| stage | TEXT | pre-flop \| flop \| turn \| river |
| type | TEXT | **ante** \| **blind** \| fold \| check \| call \| raise |
| amount | INTEGER | chips moved into pot (0 for fold/check) |
| raise_by | INTEGER | raise increment only (type=raise), 0 otherwise |
| pot_before | INTEGER | pot size before this action |
| pot_after | INTEGER | pot size after this action |
| chips_before | INTEGER | actor's stack before action |
| chips_after | INTEGER | actor's stack after action |
| is_penalty | INTEGER | 1 = server folded on behalf of bot (timeout/error) |
| response_ms | INTEGER | bot latency in ms — NULL for forced bets (ante/blind) |
| created_at | INTEGER | |

**Why include ante and blind as action rows?** A hand's financial story starts with the forced bets, not the first voluntary action. Omitting them makes chip accounting incomplete and makes it impossible to calculate true "amount invested pre-flop."

**Why store pot_after and chips_after?** Avoids having to re-simulate the action sequence to reconstruct state at any point. Makes replay trivial.

**Why store is_penalty?** A bot that always "folds" looks identical to one that's timing out and getting folded on its behalf. These are completely different situations — one is strategy, one is a broken bot.

### `bot_events`
Structured log of significant bot lifecycle events.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| bot_id | TEXT FK | |
| tournament_id | TEXT FK | optional context |
| game_id | TEXT FK | optional context |
| hand_id | TEXT FK | optional context |
| event_type | TEXT | strike \| disconnect \| reconnect \| timeout \| invalid_action |
| detail | TEXT | JSON with error message, endpoint, etc. |
| created_at | INTEGER | |

### `bot_stats`
**Materialized aggregates** — updated incrementally after every hand by the recorder. Never recomputed from scratch. Queried directly for leaderboards and bot profiles.

| Column | Type | Notes |
|--------|------|-------|
| bot_id | TEXT PK FK | |
| total_hands | INTEGER | lifetime hands played |
| total_tournaments | INTEGER | tournaments entered |
| total_wins | INTEGER | hands won |
| total_net | INTEGER | all-time chip net (payout sum) |
| vpip | REAL | Voluntarily Put $ In Pot % — standard poker stat |
| pfr | REAL | Pre-Flop Raise % |
| wtsd | REAL | Went To Showdown % (when saw flop) |
| wmsd | REAL | Won Money at Showdown % |
| aggression | REAL | (raises) / (raises + calls + checks) post-flop |
| avg_response_ms | REAL | average bot latency across all actions |
| penalty_folds | INTEGER | times server folded on the bot's behalf |
| disconnects | INTEGER | number of disconnect events |
| _vpip_hands ... | INTEGER | raw counters for incremental rate recalculation |
| updated_at | INTEGER | |

**Why materialize?** At scale, computing VPIP requires scanning all pre-flop actions for a bot across thousands of hands. With materialized stats, the leaderboard query touches one row per bot.

---

## What the Recorder Captures

The `GameRecorder` attaches to `PokerGame` via monkey-patching and records:

**At hand start:**
- Creates `hands` row with blind/ante snapshot and player count
- Creates `hand_players` rows for all active players
- Records each ante as an `actions` row (type=`ante`)

**During betting:**
- Each voluntary action with pot_before, pot_after, chips_before, chips_after, raise_by, response_ms
- Penalty folds (is_penalty=1) when bot times out or errors
- Flop attendance tracked for VPIP/saw_flop
- Fold street tracked per player

**At hand end:**
- All players' hole cards (at showdown — not just winners)
- All players' best hands and best hand cards (at showdown)
- Blind posts recorded as action rows (type=`blind`)
- Hand row finalized with duration_ms, went_to_showdown flag
- `bot_stats` updated incrementally for all players in the hand

**At game end:**
- `game_players` finalized with end chips and ranks
- `games` row closed with total_hands

---

## Analytics Queries

### Available via API

| Endpoint | Query |
|----------|-------|
| `GET /leaderboard` | `bot_stats` ordered by total_net, joins bots+users |
| `GET /bots/:id` | Full bot profile: stats + recent tournaments + validation |
| `GET /tournaments/:id/results` | Final positions, payouts, bust levels |
| `GET /tournaments/:id/history` | Paginated hand history with player outcomes |

### Available via DB (internal / future API)

| Function | Description |
|----------|-------------|
| `getHandDetail(hand_id)` | Full hand replay: community cards, all hole cards, all actions in sequence |
| `getTournamentChipProgression(tournament_id)` | Chip counts per player per blind level — for stack graphs |
| `getBotProfile(bot_id)` | Stats + recent 10 tournaments |
| `getSeatHistory(tournament_id, bot_id)` | Every table a bot sat at, with chips on arrival |
| `getBotEvents(bot_id)` | Strike/disconnect/reconnect log |
| `getLeaderboardFull(limit)` | Full stats leaderboard including VPIP, PFR, aggression, response time |

### Key analytics derivable from raw data

With the current schema, all of these are computable:

- **VPIP** — `saw_flop=1` hands / total hands per bot
- **PFR** — pre-flop raise actions / total pre-flop hands
- **WTSD** — `saw_showdown=1` / `saw_flop=1`
- **WMSD** — won at showdown / went to showdown
- **Aggression factor** — (raises) / (calls + checks) in post-flop actions
- **Average pot odds taken** — toCall / (pot_before + toCall) on call actions
- **Leak detection** — penalty_folds / total_hands (high = unstable bot)
- **Response time distribution** — percentile analysis on response_ms
- **Bust level distribution** — which blind level bots typically bust at
- **Position win rates** — hands won by position
- **Hand strength at showdown** — what hands actually win vs what they face

---

## Operational Rules

### Never delete
- `hands`, `hand_players`, `actions`, `bot_events` — append-only forever
- `tournament_entries`, `tournament_blind_levels` — append-only
- `bots` — soft delete only (active=0)

### Safe to recreate
- `tournament_seats` — current state only, history is in `tournament_seat_history`
- `bot_stats` — fully derivable from actions + hand_players (though expensive to recompute)

### Recomputing bot_stats
If `bot_stats` gets corrupted or out of sync, it can be rebuilt:
```sql
DELETE FROM bot_stats;
-- Then re-run the recorder's updateBotStats for every hand in hand_players
-- (no built-in migration yet — add one if needed)
```

### WAL mode
SQLite is in WAL mode (`PRAGMA journal_mode = WAL`).
- Reads don't block writes
- Writes don't block reads
- `PRAGMA synchronous = NORMAL` — safe with WAL, much faster than FULL
- `PRAGMA cache_size = -32000` — 32MB page cache
- Checkpoint happens automatically; can also be triggered manually for backups

### Backup strategy (not yet implemented)
Recommended: nightly `sqlite3 poker.db ".backup poker_backup_$(date +%Y%m%d).db"` to a separate volume. WAL mode makes hot backups safe.

### Migration path to Postgres
The schema uses no SQLite-specific types. To migrate:
1. Replace `DatabaseSync` with `pg` client
2. Replace `unixepoch()` with `EXTRACT(EPOCH FROM NOW())::INTEGER`
3. Replace `INSERT OR IGNORE` with `INSERT ... ON CONFLICT DO NOTHING`
4. Replace `json_group_array` / `json_object` with `json_agg` / `json_build_object`
5. `INTEGER` → `BIGINT` for chip amounts (future-proofing for large tournaments)

---

## Corrections to Original Schema Design

### `tournament_entries` UNIQUE constraint removed
Originally had `UNIQUE(tournament_id, bot_id)`. Removed to support the rebuy model — a bot that busts and rebuys creates a second row. Active entry = `finish_position IS NULL`. The application layer enforces "no duplicate active entry" before inserting.

### `setEntryPayout` targets by `entered_at DESC`
When distributing payouts at tournament end, busted players already have `finish_position` set. The payout update targets the most recent entry row by `entered_at DESC` to correctly update both active (winner) and busted (placed) entries.

### `getTournamentResults` groups by bot
Uses `GROUP BY bot_id` with `MIN(finish_position)` and `SUM(payout)` to return one row per bot regardless of how many entries (initial + rebuys) they have.

### `getTournamentHandHistory` added
`getHandHistory(game_id)` only returns hands for one game. Multi-table tournaments have one game per table, so most hands were invisible. `getTournamentHandHistory(tournament_id)` queries across all games via `tournament_id` on the `hands` table (denormalized FK added for this purpose).
