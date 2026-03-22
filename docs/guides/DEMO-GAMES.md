# Demo Games Guide

## Quick Start - Live Cash Game

**One command to start a live multi-player poker game:**

```bash
npm run demo        # 4 players (default)
npm run demo:6      # 6 players
```

This will:
1. Start mock bot servers
2. Register demo players with bots
3. Join them to an available table
4. Output the watch URL

**Watch at:** The command prints a link like:
```
http://localhost:3001/game/<table-id>
```

## Prerequisites

Before running the demo:

```bash
# Terminal 1: Start PostgreSQL
docker compose up -d postgres

# Terminal 2: Start backend
npm run dev  # or: npx nest build && node dist/src/main.js

# Terminal 3: Start frontend
cd frontend && npm run dev
```

## What the Demo Does

1. **Starts mock bot servers** - Simple HTTP servers that respond to poker action requests
2. **Registers demo players** - Uses the `register-developer` endpoint to create users with bots
3. **Joins bots to table** - Each bot joins the first available table
4. **Game auto-starts** - When 2+ bots join, the game begins automatically

## Manual Alternative

If you need more control:

```bash
# 1. Start a mock bot server
PORT=4000 npx ts-node scripts/mock-bot-server.ts

# 2. Register via API
curl -X POST http://localhost:3000/api/v1/auth/register-developer \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123",
    "name": "TestPlayer",
    "botName": "TestBot",
    "botEndpoint": "http://localhost:4000/action"
  }'

# 3. Join a table (use the token from step 2)
curl -X POST http://localhost:3000/api/v1/games/<table-id>/join \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"bot_id": "<bot-id>"}'
```

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
| Bot not responding | Check if mock bot server is running on correct port |
| "Conflict" when joining | One user can only have one bot per table |

## Architecture Note

The system enforces **one bot per user per table** for fair play. The demo works around this by creating separate demo users for each bot.
