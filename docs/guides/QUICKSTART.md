# Quick Start

Get a live poker game running in under 2 minutes.

---

## One-Command Demo

```bash
npm run game:watch
```

This starts everything:
- ✅ Backend (port 3000)
- ✅ Frontend (port 5173)
- ✅ Live game with 5 bots
- 🌐 Opens browser to game URL automatically

Watch the bots play in real-time!

---

## Manual Setup (Advanced)

For more control over game creation and bot configuration:

### Step 1: Start the Stack

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

### Step 2: Create a Bot

1. Go to `http://localhost:5173/bots/build`
2. Register account if needed (email verification auto-skips in dev)
3. Choose a personality preset or customize sliders:
   - `shark` — Tight-aggressive
   - `maniac` — Hyper-aggressive
   - `rock` — Ultra-tight
   - `calling_station` — Passive
   - `balanced_pro` — Balanced
4. Save your bot

### Step 3: Create a Live Game (Via API)

```bash
curl -X POST http://localhost:3000/api/v1/testing/live-game \
  -H "Content-Type: application/json"
```

Returns `{ gameId, gameUrl }`. Open the URL to watch the game.

### Step 4: Watch Live

Open the game at `http://localhost:5173/games/{gameId}` to see real-time poker:
- Cards, bets, pot size, player actions
- Socket.IO live updates
- Game history

---

## Testing Without UI

Use the automated testing system:

```bash
# Run 50 games with 6 bots, validate invariants
npm run test:poker -- --games=50 --bots=6

# Output: POKER_BUGS.md with any issues found
```

See [TESTING.md](../TESTING.md) for details.

---

## Next Steps

- **Design QA**: `bash scripts/detect-ui-bugs.sh` to analyze UI design quality
- **Seed tournaments**: `npm run seed:tournaments` for tournament data
- **Read the full guide**: [Bot Developer Guide](../BOT_DEVELOPER_GUIDE.md)
