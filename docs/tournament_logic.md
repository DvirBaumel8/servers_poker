# Tournament Logic

## Blind Level Progression

Blind levels in BotRoyale tournaments are determined by **hands dealt**, not by real-world time. This ensures consistent tournament structure regardless of simulation speed — whether running at 1 hand/second or 10,000 hands/second.

### How It Works

Each tournament has a `hands_per_level` setting. Every time the cumulative hand count across all active tables reaches a multiple of `hands_per_level`, the tournament advances to the next blind level.

```
totalHandsAcrossAllTables % hands_per_level === 0  →  Level Up
```

The tournament director tracks `handsThisLevel` and fires a level advance when it reaches `hands_per_level`, carrying any overflow hands into the new level.

### Default Values

| Speed Preset | `hands_per_level` | `turn_timeout_ms` |
|---|---|---|
| Slow | 100 | 10,000 ms |
| Fast | 20 | 3,000 ms |
| Custom | configurable (1–500) | configurable |
| Default (no preset) | 50 | 10,000 ms |

### Blind Schedule

The standard 15-level blind schedule (defined in `src/config/tournaments.config.ts`):

| Level | Small Blind | Big Blind | Ante |
|---|---|---|---|
| 1 | 25 | 50 | 10 |
| 2 | 50 | 100 | 15 |
| 3 | 75 | 150 | 25 |
| 4 | 100 | 200 | 25 |
| 5 | 150 | 300 | 50 |
| 6 | 200 | 400 | 50 |
| 7 | 300 | 600 | 75 |
| 8 | 400 | 800 | 100 |
| 9 | 600 | 1,200 | 150 |
| 10 | 800 | 1,600 | 200 |
| 11 | 1,000 | 2,000 | 300 |
| 12 | 1,500 | 3,000 | 400 |
| 13 | 2,000 | 4,000 | 500 |
| 14 | 3,000 | 6,000 | 750 |
| 15 | 5,000 | 10,000 | 1,000 |

Starting stack is 5,000 chips = 100 big blinds at Level 1.

### Creating a Tournament

When creating a tournament via the Admin Dashboard or API, set `hands_per_level`:

```json
POST /api/v1/tournaments
{
  "name": "My Tournament",
  "type": "rolling",
  "buy_in": 1000,
  "starting_chips": 5000,
  "min_players": 2,
  "max_players": 18,
  "players_per_table": 9,
  "turn_timeout_ms": 10000,
  "hands_per_level": 50
}
```

### Live Telemetry

The `GET /api/v1/tournaments/:id/state` endpoint returns:

```json
{
  "level": 3,
  "handsThisLevel": 12,
  "handsPerLevel": 50,
  ...
}
```

The Admin Dashboard displays this as: **"Lv 4 in 38 hands"** — the number of hands remaining until the next blind level.
