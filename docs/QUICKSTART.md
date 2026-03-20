# Build Your Poker Bot in 5 Minutes

This guide gets you from zero to playing in a tournament in under 5 minutes.

## Choose Your Path

### Option A: Copy & Run (Fastest)

**Node.js:**
```bash
# Download and run
curl -O https://yourserver.com/bots/bot.js
node bot.js 3001
```

**Python:**
```bash
# Download and run
curl -O https://yourserver.com/bots/bot.py
python bot.py 3001
```

Your bot is now running at `http://localhost:3001`. Skip to [Register Your Bot](#register-your-bot).

---

### Option B: Install SDK (Recommended)

**Node.js:**
```bash
npm install @poker-engine/sdk
```

Create `my-bot.js`:
```javascript
const { createBot } = require('@poker-engine/sdk');

createBot({
  port: 3001,
  decide: (state) => {
    // Your strategy here - this is ALL you need to implement
    if (state.action.canCheck) return { type: 'check' };
    if (state.you.bestHand?.isAtLeast('TWO_PAIR')) return { type: 'call' };
    return { type: 'fold' };
  }
});
```

Run it:
```bash
node my-bot.js
```

**Python:**
```bash
pip install poker-engine-sdk
```

Create `my_bot.py`:
```python
from poker_sdk import create_bot

def decide(state):
    # Your strategy here - this is ALL you need to implement
    if state.action.can_check:
        return {'type': 'check'}
    if state.you.best_hand and state.you.best_hand.is_at_least('TWO_PAIR'):
        return {'type': 'call'}
    return {'type': 'fold'}

create_bot(port=3001, decide=decide)
```

Run it:
```bash
python my_bot.py
```

---

## Register Your Bot

1. **Create an account** at `https://yourserver.com/register`

2. **Register your bot:**
```bash
curl -X POST https://yourserver.com/api/v1/bots \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyFirstBot",
    "endpoint": "https://your-server.com/action"
  }'
```

3. **Join a tournament:**
```bash
curl -X POST https://yourserver.com/api/v1/tournaments/TOURNAMENT_ID/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"bot_id": "YOUR_BOT_ID"}'
```

That's it! Your bot will start playing when the tournament begins.

---

## The Only Function You Need

Your entire bot is this one function:

```javascript
function decide(state) {
  // Return one of:
  return { type: 'fold' };
  return { type: 'check' };    // only when state.action.canCheck is true
  return { type: 'call' };
  return { type: 'raise', amount: 100 };
  return { type: 'all_in' };
}
```

The `state` object contains everything you need:

```javascript
state.you.chips          // Your chip count
state.you.holeCards      // Your cards: ['A♠', 'K♥']
state.you.bestHand       // Your best hand (post-flop): { name: 'TWO_PAIR', ... }
state.you.position       // 'BTN', 'SB', 'BB', 'CO', etc.

state.action.canCheck    // Can you check?
state.action.toCall      // How much to call
state.action.minRaise    // Minimum raise amount
state.action.maxRaise    // Maximum raise (your stack - toCall)

state.table.pot          // Current pot size
state.table.communityCards  // Board cards
state.stage              // 'pre-flop', 'flop', 'turn', 'river'

state.players            // All players at the table
```

---

## Quick Strategy Examples

### The Simplest Bot (Check/Fold)
```javascript
function decide(state) {
  return state.action.canCheck ? { type: 'check' } : { type: 'fold' };
}
```

### Tight-Aggressive
```javascript
function decide(state) {
  const { you, action, table } = state;
  
  // Pre-flop: only play premium hands
  if (state.stage === 'pre-flop') {
    const cards = you.holeCards.map(c => c.rank).join('');
    const premium = ['AA', 'KK', 'QQ', 'AK', 'AQ'].some(h => cards.includes(h));
    if (premium) return { type: 'raise', amount: table.bigBlind * 3 };
    return action.canCheck ? { type: 'check' } : { type: 'fold' };
  }
  
  // Post-flop: bet/call with strong hands
  if (you.bestHand?.isAtLeast('TWO_PAIR')) {
    return { type: 'raise', amount: Math.floor(table.pot * 0.75) };
  }
  return action.canCheck ? { type: 'check' } : { type: 'fold' };
}
```

### Calling Station
```javascript
function decide(state) {
  return state.action.canCheck ? { type: 'check' } : { type: 'call' };
}
```

---

## Test Your Bot Locally

```bash
# Test health endpoint
curl http://localhost:3001/health

# Test action endpoint
curl -X POST http://localhost:3001/action \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "test",
    "handNumber": 1,
    "stage": "pre-flop",
    "you": {
      "name": "MyBot",
      "chips": 10000,
      "holeCards": ["A♠", "K♥"],
      "bet": 0,
      "position": "BTN"
    },
    "action": {
      "canCheck": false,
      "toCall": 100,
      "minRaise": 200,
      "maxRaise": 9900
    },
    "table": {
      "pot": 150,
      "currentBet": 100,
      "communityCards": [],
      "smallBlind": 50,
      "bigBlind": 100,
      "ante": 0
    },
    "players": []
  }'
```

---

## Deploy Options

### Free Hosting
- **Render.com**: Free tier, auto-deploys from GitHub
- **Railway.app**: Free tier with generous limits
- **Fly.io**: Free tier, global edge deployment
- **Replit**: Free, instant deployment

### Example: Deploy to Render
1. Push your bot to GitHub
2. Connect Render to your repo
3. Set start command: `node bot.js $PORT`
4. Your bot is live at `https://your-bot.onrender.com/action`

---

## Common Issues

### "Bot timed out"
- Your bot must respond within **10 seconds**
- Check for slow code or network issues
- The boilerplate logs response time — aim for <1 second

### "Invalid action"
- Make sure `type` is one of: `fold`, `check`, `call`, `raise`, `all_in`
- For `raise`, include a positive integer `amount`
- Don't return `check` when `canCheck` is false

### "Bot disconnected"
- 3 consecutive errors/timeouts = disconnection
- Make sure your server stays running
- Handle all exceptions — return `{ type: 'fold' }` on error

---

## Next Steps

1. **Read the strategy guide**: [STRATEGY.md](./STRATEGY.md)
2. **Study example bots**: [/bots/examples/](../bots/examples/)
3. **Test with simulation**: Run games locally before going live
4. **Join Discord**: Get help from the community

---

## Need Help?

- **API Docs**: [API.md](./API.md)
- **Full Bot Protocol**: [BOT_PROTOCOL.md](./BOT_PROTOCOL.md)
- **Ask AI**: Copy [AI_CONTEXT.md](./AI_CONTEXT.md) into ChatGPT/Claude
