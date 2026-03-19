# Data Dictionary

This document describes all data entities, their relationships, and data flows in the Poker Platform.

## Overview

The poker platform uses PostgreSQL as its primary database with TypeORM as the ORM layer. All chip amounts use `BIGINT` to prevent overflow, and critical operations use `SERIALIZABLE` transactions.

## Core Entities

### Users

**Table:** `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(36) | PRIMARY KEY | UUID v4 identifier |
| email | VARCHAR(100) | UNIQUE, NOT NULL | User's email address |
| name | VARCHAR(100) | NOT NULL | Display name |
| api_key_hash | VARCHAR(64) | NOT NULL | SHA-256 hash of API key |
| role | VARCHAR(20) | DEFAULT 'user' | admin, user |
| active | BOOLEAN | DEFAULT true | Account status |
| last_login_at | TIMESTAMP WITH TZ | NULLABLE | Last authentication |
| created_at | TIMESTAMP WITH TZ | NOT NULL | Record creation |
| updated_at | TIMESTAMP WITH TZ | NOT NULL | Last update |

**Indexes:**
- `idx_users_email` - UNIQUE on email
- `idx_users_api_key_hash` - on api_key_hash (for auth lookups)

---

### Bots

**Table:** `bots`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(36) | PRIMARY KEY | UUID v4 identifier |
| name | VARCHAR(100) | UNIQUE, NOT NULL | Bot display name |
| endpoint | VARCHAR(500) | NOT NULL | HTTP(S) endpoint URL |
| description | TEXT | NULLABLE | Bot description |
| active | BOOLEAN | DEFAULT true | Bot availability |
| user_id | VARCHAR(36) | FK users.id | Owner reference |
| last_validation | JSONB | NULLABLE | Last health check details |
| last_validation_score | INTEGER | NULLABLE | 0-100 score |
| created_at | TIMESTAMP WITH TZ | NOT NULL | Record creation |
| updated_at | TIMESTAMP WITH TZ | NOT NULL | Last update |

**Relationships:**
- `user_id` → `users.id` (CASCADE DELETE)

**Constraints:**
- Endpoint must be valid public HTTP(S) URL
- Internal/private IPs are blocked

---

### Tournaments

**Table:** `tournaments`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(36) | PRIMARY KEY | UUID v4 identifier |
| name | VARCHAR(100) | NOT NULL | Tournament name |
| type | VARCHAR(20) | NOT NULL | rolling, scheduled |
| status | VARCHAR(20) | DEFAULT 'registering' | Current state |
| buy_in | BIGINT | >= 0 | Entry cost |
| starting_chips | BIGINT | > 0 | Initial stack |
| min_players | INTEGER | >= 2 | Minimum to start |
| max_players | INTEGER | >= min_players | Maximum capacity |
| players_per_table | INTEGER | 2-10, DEFAULT 9 | Table size |
| turn_timeout_ms | INTEGER | DEFAULT 10000 | Bot timeout |
| late_reg_ends_level | INTEGER | DEFAULT 4 | Late registration cutoff |
| rebuys_allowed | BOOLEAN | DEFAULT true | Rebuy permission |
| scheduled_start_at | TIMESTAMP WITH TZ | NULLABLE | Scheduled start |
| started_at | TIMESTAMP WITH TZ | NULLABLE | Actual start |
| finished_at | TIMESTAMP WITH TZ | NULLABLE | Completion time |

**Status Values:**
- `registering` - Accepting entries
- `running` - Tournament in progress
- `final_table` - Down to one table
- `finished` - Completed
- `cancelled` - Cancelled before completion

---

### Games

**Table:** `games`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(36) | PRIMARY KEY | UUID v4 identifier |
| table_id | VARCHAR(36) | NOT NULL | Table reference |
| tournament_id | VARCHAR(36) | NULLABLE | Tournament reference |
| status | VARCHAR(20) | DEFAULT 'waiting' | waiting, running, finished |
| total_hands | INTEGER | >= 0, DEFAULT 0 | Hands played count |
| started_at | TIMESTAMP WITH TZ | NULLABLE | Game start time |
| finished_at | TIMESTAMP WITH TZ | NULLABLE | Game end time |

**Indexes:**
- `idx_games_table_id` - on table_id
- `idx_games_tournament_id` - on tournament_id (if not null)

---

### Hands

**Table:** `hands`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(36) | PRIMARY KEY | UUID v4 identifier |
| game_id | VARCHAR(36) | FK games.id | Game reference |
| tournament_id | VARCHAR(36) | NULLABLE | Tournament reference |
| hand_number | INTEGER | >= 1 | Sequential hand number |
| dealer_bot_id | VARCHAR(36) | NULLABLE | Dealer button holder |
| small_blind | BIGINT | NOT NULL | SB amount |
| big_blind | BIGINT | NOT NULL | BB amount |
| ante | BIGINT | DEFAULT 0 | Ante per player |
| community_cards | JSONB | DEFAULT [] | Board cards |
| pot | BIGINT | >= 0, DEFAULT 0 | Total pot |
| stage | VARCHAR(20) | DEFAULT 'preflop' | Current stage |
| started_at | TIMESTAMP WITH TZ | NULLABLE | Hand start |
| finished_at | TIMESTAMP WITH TZ | NULLABLE | Hand end |

**Stages:** preflop, flop, turn, river, showdown, complete

**Constraints:**
- UNIQUE(game_id, hand_number)

---

### Actions (Betting History)

**Table:** `actions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(36) | PRIMARY KEY | UUID v4 identifier |
| hand_id | VARCHAR(36) | FK hands.id | Hand reference |
| bot_id | VARCHAR(36) | FK bots.id | Acting bot |
| action_seq | INTEGER | >= 0 | Action sequence number |
| action_type | VARCHAR(20) | NOT NULL | Action type |
| stage | VARCHAR(20) | NOT NULL | Stage when action occurred |
| amount | BIGINT | >= 0, DEFAULT 0 | Chips involved |
| pot_after | BIGINT | NULLABLE | Pot after action |
| chips_after | BIGINT | NULLABLE | Bot chips after |
| response_time_ms | INTEGER | NULLABLE | Bot response latency |

**Action Types:**
- `ante` - Forced ante bet
- `small_blind` - Small blind post
- `big_blind` - Big blind post
- `fold` - Hand forfeit
- `check` - Pass action
- `call` - Match current bet
- `bet` - First bet in round
- `raise` - Increase current bet
- `all_in` - Bet entire stack

---

## Chip Movement Tracking

### ChipMovements

**Table:** `chip_movements`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(36) | PRIMARY KEY | UUID v4 identifier |
| bot_id | VARCHAR(36) | FK bots.id | Bot involved |
| game_id | VARCHAR(36) | NULLABLE | Game context |
| hand_id | VARCHAR(36) | NULLABLE | Hand context |
| tournament_id | VARCHAR(36) | NULLABLE | Tournament context |
| movement_type | VARCHAR(30) | NOT NULL | Type of movement |
| amount | BIGINT | NOT NULL | Absolute chip amount |
| balance_before | BIGINT | NOT NULL | Balance before |
| balance_after | BIGINT | >= 0 | Balance after |
| description | TEXT | NULLABLE | Human-readable note |
| context | JSONB | NULLABLE | Additional context |
| created_at | TIMESTAMP WITH TZ | NOT NULL | When movement occurred |

**Movement Types:**
- `ante`, `blind`, `bet`, `call`, `raise`, `all_in`
- `win`, `refund`
- `tournament_buyin`, `tournament_payout`, `rebuy`

**Critical Constraint:**
- `balance_after >= 0` enforced at database level

---

## Data Flows

### Hand Lifecycle

```
1. Hand Start
   ├── Deduct antes (chip_movements: ante)
   ├── Post blinds (chip_movements: blind)
   └── Deal cards (hand_players: hole_cards)

2. Betting Rounds (preflop → flop → turn → river)
   └── For each action:
       ├── Validate action legality
       ├── Record action (actions table)
       ├── Record chip movement
       └── Check betting round complete

3. Showdown / Winner Determination
   ├── Evaluate hands
   ├── Calculate pot shares
   ├── Distribute winnings (chip_movements: win)
   └── Update hand/game stats

4. Hand Complete
   ├── Update hand_players (end_chips, won, etc.)
   ├── Update game_players stats
   └── Assert chip conservation
```

### Tournament Flow

```
1. Registration
   └── Create tournament_entries

2. Start
   ├── Create tournament_tables
   ├── Assign seats (tournament_seats)
   └── Initialize blind levels

3. Play
   ├── Run hands at each table
   ├── Track eliminations
   ├── Balance tables periodically
   └── Advance blind levels

4. Final Table
   ├── Merge remaining players
   └── Continue until winner

5. Completion
   ├── Calculate payouts
   ├── Update tournament_entries
   └── Update bot_stats
```

---

## Indexes Strategy

### High-Frequency Lookups
- User authentication: `users(api_key_hash)`
- Active bots: `bots(user_id, active)`
- Tournament status: `tournaments(status)`

### Analytics Queries
- Bot performance: `bot_stats(bot_id)`
- Hand history: `actions(hand_id, action_seq)`
- Chip tracking: `chip_movements(bot_id, created_at)`

### Audit Trail
- User actions: `audit_logs(user_id, created_at)`
- Resource access: `audit_logs(resource, resource_id, created_at)`

---

## Data Retention

| Data Type | Retention Period | Archive Strategy |
|-----------|-----------------|------------------|
| Game data | Indefinite | Partition by month |
| Audit logs | 1 year | Archive to cold storage |
| Bot events | 90 days | Aggregate to stats |
| Chip movements | Indefinite | Critical audit trail |

---

## Recovery Procedures

### Chip Conservation Violation

If a chip conservation error is detected:

1. Halt the affected game immediately
2. Log detailed state snapshot to `bot_events`
3. Roll back to last verified state using `chip_movements` history
4. Alert administrators via monitoring system
5. Investigate root cause before resuming

### Tournament State Recovery

Tournament state can be reconstructed from:
- `tournament_entries` - Player registrations
- `tournament_seats` - Current positions
- `tournament_seat_history` - Movement audit trail
- `hands` - All played hands
- `chip_movements` - Chip audit trail

---

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐
│   users     │       │   bots      │
├─────────────┤       ├─────────────┤
│ id (PK)     │──┬───>│ id (PK)     │
│ email       │  │    │ user_id(FK) │
│ name        │  │    │ name        │
│ api_key_hash│  │    │ endpoint    │
│ role        │  │    │ active      │
└─────────────┘  │    └──────┬──────┘
                 │           │
                 │    ┌──────┴──────┐
                 │    │             │
           ┌─────┴────▼──┐   ┌──────▼──────┐
           │ tournaments │   │   games     │
           ├─────────────┤   ├─────────────┤
           │ id (PK)     │   │ id (PK)     │
           │ name        │   │ table_id    │
           │ status      │   │ tournament_id│
           │ buy_in      │   │ status      │
           └──────┬──────┘   └──────┬──────┘
                  │                 │
           ┌──────▼──────┐   ┌──────▼──────┐
           │ entries     │   │   hands     │
           ├─────────────┤   ├─────────────┤
           │ tournament_id│   │ game_id    │
           │ bot_id      │   │ hand_number │
           │ finish_pos  │   │ pot        │
           │ payout      │   │ stage      │
           └─────────────┘   └──────┬──────┘
                                    │
                             ┌──────▼──────┐
                             │   actions   │
                             ├─────────────┤
                             │ hand_id     │
                             │ bot_id      │
                             │ action_type │
                             │ amount      │
                             └─────────────┘
```
