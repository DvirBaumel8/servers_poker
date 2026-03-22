# Demo Games Guide

## Quick Start

```bash
npm run demo        # 4 players (default)
npm run demo:6      # 6 players
```

This creates strategy bots, joins them to a table, and starts a game. No external servers needed.

**Watch at:** The command prints a link like:
```
http://localhost:3001/game/<table-id>
```

## Prerequisites

```bash
# Terminal 1: Start PostgreSQL
docker compose up -d postgres

# Terminal 2: Start backend
npm run dev  # or: npx nest build && node dist/src/main.js

# Terminal 3: Start frontend
cd frontend && npm run dev
```

## What the Demo Does

1. **Runs the seed script** to create users with strategy bots (various personality presets)
2. **Joins bots to a table** — each bot joins the first available table
3. **Game auto-starts** — when 2+ bots join, the game begins automatically

All bots use in-process strategy evaluation via the `StrategyEngineService`. Each bot has a personality preset (shark, rock, maniac, etc.) that determines its play style.

## Manual Alternative

Use the seed script directly for more control:

```bash
npx ts-node scripts/seed-data.ts
```

This creates demo users with pre-configured strategy bots. You can then join them to tables via the UI or API.

## Monitoring

Watch the game state via API:

```bash
# Current state
curl http://localhost:3000/api/v1/games/<table-id>/state | jq

# Quick status
curl -s http://localhost:3000/api/v1/games/<table-id>/state | jq '{hand: .handNumber, stage, players: [.players[].name]}'
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No available tables" | An admin needs to create a table via UI or API |
| "Backend not running" | Start with `npm run dev` |
| "Conflict" when joining | One user can only have one bot per table |

## Architecture Note

The system enforces **one bot per user per table** for fair play. The demo creates separate users for each bot. All bot decisions are evaluated in-process — no HTTP calls or external servers are involved.
