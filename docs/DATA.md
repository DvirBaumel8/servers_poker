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
- **Never hard-delete any gameplay record.** Use soft deletes (active=false) or archival.
- **Record causality, not just outcome.** Don't just store who won — store every action that led there.
- **Snapshot context at the moment of the event.** Store blinds/ante on the hand row, chips_before/after on every action. Don't rely on joins to reconstruct what was true at a point in time.
- **Materialize expensive aggregates.** `bot_stats` is updated incrementally after each hand so leaderboard queries never re-scan millions of action rows.
- **Chip integrity is paramount.** All chip movements tracked in `chip_movements` table. `BIGINT` for all chip amounts.

---

## Database: PostgreSQL

Migrated from SQLite to PostgreSQL for production-grade capabilities:
- `BIGINT` for chip amounts (prevents overflow)
- `SERIALIZABLE` transactions for chip movements
- `JSONB` for flexible data (cards, hand details)
- `CHECK` constraints for data validation
- Proper connection pooling

For complete schema with TypeORM entities, see `DATA_DICTIONARY.md`.

---

## Core Tables

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Generated UUID |
| email | VARCHAR UNIQUE | Required |
| name | VARCHAR | Display name |
| api_key_hash | VARCHAR | SHA-256 hash of API key |
| role | VARCHAR | 'admin' or 'user' |
| active | BOOLEAN | Soft delete flag |
| last_login_at | TIMESTAMP | Updated on each login |
| created_at / updated_at | TIMESTAMP | Automatic timestamps |

### `bots`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK→users | Owner |
| name | VARCHAR UNIQUE | Display name |
| endpoint | VARCHAR | HTTP URL for action calls |
| description | TEXT | Optional |
| active | BOOLEAN | CHECK (active IN (true, false)) |
| last_validation | TIMESTAMP | When last validated |
| last_validation_score | INTEGER | 0–100 |
| created_at / updated_at | TIMESTAMP | |

### `tournaments`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR | Display name |
| type | VARCHAR | 'rolling', 'scheduled', 'sit_and_go' |
| status | VARCHAR | 'registering', 'running', 'final_table', 'finished' |
| buy_in | BIGINT | Chips to enter, CHECK ≥ 0 |
| starting_chips | BIGINT | Initial stack, CHECK > 0 |
| min_players / max_players | INTEGER | |
| players_per_table | INTEGER | Default 9 |
| turn_timeout_ms | INTEGER | Default 30000 |
| late_reg_ends_level | INTEGER | |
| rebuys_allowed | BOOLEAN | |
| scheduled_start_at | TIMESTAMP | For scheduled tournaments |
| started_at / finished_at | TIMESTAMP | |

### `games`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| table_id | UUID FK→tournament_tables | |
| tournament_id | UUID FK→tournaments | Nullable for cash games |
| status | VARCHAR | 'waiting', 'running', 'paused', 'finished' |
| total_hands | INTEGER | |
| started_at / finished_at | TIMESTAMP | |

### `hands`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| game_id | UUID FK→games | |
| tournament_id | UUID FK→tournaments | |
| hand_number | INTEGER | Sequential within game |
| dealer_bot_id | UUID FK→bots | |
| small_blind / big_blind / ante | BIGINT | Snapshot at hand start |
| community_cards | JSONB | Array of cards |
| pot | BIGINT | Final pot size |
| stage | VARCHAR | 'preflop', 'flop', 'turn', 'river', 'showdown' |
| started_at / finished_at | TIMESTAMP | |

### `actions`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| hand_id | UUID FK→hands | |
| bot_id | UUID FK→bots | |
| action_seq | INTEGER | Order within hand |
| action_type | VARCHAR | 'fold', 'check', 'call', 'bet', 'raise', 'all_in', 'blind', 'ante' |
| stage | VARCHAR | When action occurred |
| amount | BIGINT | Chips moved, CHECK ≥ 0 |
| pot_after | BIGINT | Pot after action |
| chips_after | BIGINT | Player chips after action |
| response_time_ms | INTEGER | Bot response latency |
| created_at | TIMESTAMP | |

### `chip_movements`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| bot_id | UUID FK→bots | |
| game_id | UUID FK→games | |
| hand_id | UUID FK→hands | |
| tournament_id | UUID FK→tournaments | |
| movement_type | VARCHAR | 'bet', 'win', 'ante', 'blind', 'refund', 'buy_in', 'cash_out' |
| amount | BIGINT | CHECK ≥ 0 |
| balance_before | BIGINT | |
| balance_after | BIGINT | CHECK ≥ 0 |
| description | VARCHAR | Human-readable description |
| context | JSONB | Additional data |
| created_at | TIMESTAMP | |

### `audit_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK→users | Nullable for anonymous |
| action | VARCHAR | 'register', 'login', 'create_bot', etc. |
| resource | VARCHAR | 'user', 'bot', 'tournament', etc. |
| resource_id | VARCHAR | ID of affected resource |
| ip_address | VARCHAR | |
| user_agent | VARCHAR | |
| http_method | VARCHAR | |
| status_code | INTEGER | |
| duration_ms | INTEGER | |
| request_body | JSONB | Sanitized (no secrets) |
| response_summary | VARCHAR | |
| error_message | TEXT | If failed |
| metadata | JSONB | |
| created_at | TIMESTAMP | |

---

## Analytics Tables

### `bot_stats`
Materialized aggregate updated after every hand:
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| bot_id | UUID FK→bots UNIQUE | |
| total_hands | INTEGER | |
| total_tournaments | INTEGER | |
| tournament_wins | INTEGER | |
| total_net | BIGINT | Net chips won/lost |
| vpip_hands | INTEGER | Voluntarily put $ in pot |
| pfr_hands | INTEGER | Preflop raise |
| wtsd_hands | INTEGER | Went to showdown |
| wmsd_hands | INTEGER | Won money at showdown |
| aggressive_actions | INTEGER | Bets/raises |
| passive_actions | INTEGER | Calls/checks |
| updated_at | TIMESTAMP | |

### `bot_events`
Tracks bot issues:
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| bot_id | UUID FK→bots | |
| game_id | UUID FK→games | |
| hand_id | UUID FK→hands | |
| event_type | VARCHAR | 'timeout', 'error', 'invalid_action', 'disconnect', 'validation_fail' |
| message | TEXT | |
| context | JSONB | |
| created_at | TIMESTAMP | |

---

## Edge Case Handling in Data

### Player Leaves During Hand
- Action recorded with `action_type: 'fold'` and `is_penalty: true` in context
- `bot_events` record created with `event_type: 'disconnect'`
- Strike count tracked in `bots.strikes` (not persisted, in-memory)

### Cash Game Last Player Standing
- Game status → 'finished'
- `games.finished_at` set
- No chip movements recorded (chips remain with player)

### Tournament Single Table Completion
- Tournament status → 'finished'
- Payouts calculated and recorded in `tournament_entries.payout`
- All entries updated with `finish_position`

### Out-of-Turn Actions
- Not recorded in `actions` table
- May create `bot_events` record if persistent issue
- No strike applied

---

## Backup Strategy

### Recommended Setup
1. **Streaming replication** to hot standby
2. **Daily pg_dump** to object storage (S3/GCS)
3. **Point-in-time recovery** enabled via WAL archiving
4. **Transaction logs** retained for 7 days

### Critical Tables (Never Lose)
- `hands`, `actions`, `hand_players` — full game history
- `chip_movements` — complete audit trail
- `tournament_entries` — payout records

### Rebuildable Tables
- `bot_stats` — can rebuild from `actions` + `hand_players`
- `audit_logs` — operational, not business-critical

---

## Query Patterns

### Leaderboard
```sql
SELECT b.id, b.name, bs.total_net, bs.total_tournaments, bs.tournament_wins
FROM bots b
JOIN bot_stats bs ON b.id = bs.bot_id
WHERE b.active = true
ORDER BY bs.total_net DESC
LIMIT 100;
```

### Hand History for Replay
```sql
SELECT h.*, json_agg(a.* ORDER BY a.action_seq) as actions
FROM hands h
JOIN actions a ON h.id = a.hand_id
WHERE h.id = $1
GROUP BY h.id;
```

### Bot Performance by Stage
```sql
SELECT
  a.stage,
  a.action_type,
  COUNT(*) as count,
  AVG(a.amount) as avg_amount
FROM actions a
WHERE a.bot_id = $1
GROUP BY a.stage, a.action_type;
```

### Chip Conservation Audit
```sql
SELECT
  h.id as hand_id,
  SUM(CASE WHEN cm.movement_type IN ('bet', 'ante', 'blind') THEN cm.amount ELSE 0 END) as total_in,
  SUM(CASE WHEN cm.movement_type IN ('win', 'refund') THEN cm.amount ELSE 0 END) as total_out
FROM hands h
JOIN chip_movements cm ON h.id = cm.hand_id
GROUP BY h.id
HAVING SUM(CASE WHEN cm.movement_type IN ('bet', 'ante', 'blind') THEN cm.amount ELSE 0 END)
    != SUM(CASE WHEN cm.movement_type IN ('win', 'refund') THEN cm.amount ELSE 0 END);
```

---

## Data Retention

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Game history (hands, actions) | Indefinite | Core product |
| Chip movements | Indefinite | Audit requirement |
| Tournament entries | Indefinite | Payout records |
| Bot events | 90 days | Operational |
| Audit logs | 30 days | Operational |
| Bot validation results | 7 days | Can re-run |
