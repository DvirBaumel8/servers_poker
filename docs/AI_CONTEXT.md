# AI Assistant Context for Poker Bot Development

> **Instructions for AI**: Copy this entire file into your conversation with ChatGPT, Claude, or any AI assistant when you need help building a poker bot. The AI will have all the context it needs to help you.

---

## System Overview

You are helping build a bot for a poker tournament platform. The bot is an HTTP server that receives game state and returns an action.

**Bot requirements:**
- HTTP server with POST `/action` endpoint
- Responds with JSON action within 10 seconds
- GET `/health` endpoint returning 200 OK

---

## Request Format (What Your Bot Receives)

```json
{
  "gameId": "uuid-string",
  "handNumber": 15,
  "stage": "flop",
  "you": {
    "name": "MyBot",
    "chips": 9500,
    "holeCards": ["A♠", "K♥"],
    "bet": 100,
    "position": "BTN",
    "bestHand": {
      "name": "ONE_PAIR",
      "cards": ["A♠", "A♦", "K♥", "Q♣", "J♠"]
    }
  },
  "action": {
    "canCheck": false,
    "toCall": 100,
    "minRaise": 200,
    "maxRaise": 9400
  },
  "table": {
    "pot": 350,
    "currentBet": 200,
    "communityCards": ["A♦", "Q♣", "J♠"],
    "smallBlind": 50,
    "bigBlind": 100,
    "ante": 0
  },
  "players": [
    {
      "name": "Opponent1",
      "chips": 8000,
      "bet": 200,
      "folded": false,
      "allIn": false,
      "position": "SB",
      "disconnected": false
    }
  ]
}
```

### Field Explanations

| Field | Type | Description |
|-------|------|-------------|
| `stage` | string | `"pre-flop"`, `"flop"`, `"turn"`, or `"river"` |
| `you.holeCards` | string[] | Your two hole cards, e.g., `["A♠", "K♥"]` |
| `you.position` | string | `"BTN"`, `"SB"`, `"BB"`, `"CO"`, `"HJ"`, `"UTG"`, etc. |
| `you.bestHand` | object | Only present on flop/turn/river. Your best 5-card hand. |
| `you.bestHand.name` | string | `"HIGH_CARD"`, `"ONE_PAIR"`, `"TWO_PAIR"`, `"THREE_OF_A_KIND"`, `"STRAIGHT"`, `"FLUSH"`, `"FULL_HOUSE"`, `"FOUR_OF_A_KIND"`, `"STRAIGHT_FLUSH"`, `"ROYAL_FLUSH"` |
| `action.canCheck` | boolean | If true, you can check. If false, you must call, raise, or fold. |
| `action.toCall` | number | Chips needed to call the current bet |
| `action.minRaise` | number | Minimum additional chips to raise |
| `action.maxRaise` | number | Maximum additional chips to raise (your stack - toCall) |
| `players` | array | All players at table (excluding you). Shows their chips, bets, and status. |

---

## Response Format (What Your Bot Returns)

Your bot must return one of these JSON responses:

```json
{ "type": "fold" }
```
```json
{ "type": "check" }
```
```json
{ "type": "call" }
```
```json
{ "type": "raise", "amount": 300 }
```
```json
{ "type": "all_in" }
```

### Rules

1. **`check`** is only valid when `action.canCheck === true`
2. **`raise` amount** is the ADDITIONAL chips on top of the call
   - Must be between `minRaise` and `maxRaise`
   - Total investment = `toCall + amount`
3. **`all_in`** is equivalent to `raise` with `amount = maxRaise`
4. On any error, return `{ "type": "fold" }` to avoid disconnection

---

## Card Format

Cards are strings like `"A♠"`, `"K♥"`, `"10♦"`, `"2♣"`

- Ranks: `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`, `J`, `Q`, `K`, `A`
- Suits: `♠` (spades), `♥` (hearts), `♦` (diamonds), `♣` (clubs)

---

## Position Names

| Position | Description |
|----------|-------------|
| `BTN` | Button (dealer) - acts last post-flop |
| `SB` | Small blind |
| `BB` | Big blind |
| `UTG` | Under the gun - first to act pre-flop |
| `CO` | Cutoff - one before button |
| `HJ` | Hijack - two before button |
| `BTN/SB` | Heads-up: button is also small blind |

---

## Node.js Bot Template

```javascript
const http = require('http');

function decide(state) {
  // TODO: Implement your strategy here
  const { you, action, table, stage } = state;
  
  // Example: Simple tight-aggressive strategy
  if (stage === 'pre-flop') {
    // Only play strong hands pre-flop
    const cards = you.holeCards.join('');
    if (cards.includes('A') && cards.includes('K')) {
      return { type: 'raise', amount: table.bigBlind * 3 };
    }
    return action.canCheck ? { type: 'check' } : { type: 'fold' };
  }
  
  // Post-flop: bet with strong hands
  if (you.bestHand && ['TWO_PAIR', 'THREE_OF_A_KIND', 'STRAIGHT', 'FLUSH', 'FULL_HOUSE', 'FOUR_OF_A_KIND', 'STRAIGHT_FLUSH', 'ROYAL_FLUSH'].includes(you.bestHand.name)) {
    return { type: 'raise', amount: Math.floor(table.pot * 0.75) };
  }
  
  return action.canCheck ? { type: 'check' } : { type: 'fold' };
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }
  
  if (req.method === 'POST' && req.url === '/action') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const state = JSON.parse(body);
        const action = decide(state);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(action));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ type: 'fold' }));
      }
    });
    return;
  }
  
  res.writeHead(404);
  res.end();
});

server.listen(3001, () => console.log('Bot running on port 3001'));
```

---

## Python Bot Template

```python
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

def decide(state):
    # TODO: Implement your strategy here
    you = state['you']
    action = state['action']
    table = state['table']
    stage = state['stage']
    
    # Example: Simple tight-aggressive strategy
    if stage == 'pre-flop':
        cards = ''.join(you['holeCards'])
        if 'A' in cards and 'K' in cards:
            return {'type': 'raise', 'amount': table['bigBlind'] * 3}
        return {'type': 'check'} if action['canCheck'] else {'type': 'fold'}
    
    # Post-flop: bet with strong hands
    best_hand = you.get('bestHand')
    strong_hands = ['TWO_PAIR', 'THREE_OF_A_KIND', 'STRAIGHT', 'FLUSH', 
                    'FULL_HOUSE', 'FOUR_OF_A_KIND', 'STRAIGHT_FLUSH', 'ROYAL_FLUSH']
    if best_hand and best_hand['name'] in strong_hands:
        return {'type': 'raise', 'amount': int(table['pot'] * 0.75)}
    
    return {'type': 'check'} if action['canCheck'] else {'type': 'fold'}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
    
    def do_POST(self):
        if self.path == '/action':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                state = json.loads(body)
                result = decide(state)
            except:
                result = {'type': 'fold'}
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

HTTPServer(('', 3001), Handler).serve_forever()
```

---

## Common AI Prompts

### "Help me build a poker bot"
The AI now has full context. Just describe your strategy idea:
- "Make it play tight-aggressive"
- "Add bluffing on the river"
- "Use pot odds to decide calls"

### "My bot is timing out"
Ask the AI to optimize your `decide()` function for speed.

### "My bot keeps folding too much"
Share your `decide()` function and ask for adjustments.

### "Explain pot odds"
The AI can explain poker concepts in context of this bot format.

---

## Hand Strength Reference

For post-flop decisions, use `you.bestHand.name`:

| Hand | Strength | Typical Action |
|------|----------|----------------|
| `HIGH_CARD` | Weak | Check/fold unless bluffing |
| `ONE_PAIR` | Medium | Call small bets, fold to big bets |
| `TWO_PAIR` | Strong | Bet for value |
| `THREE_OF_A_KIND` | Very Strong | Bet/raise for value |
| `STRAIGHT` | Very Strong | Bet/raise, watch for flushes |
| `FLUSH` | Very Strong | Bet/raise for value |
| `FULL_HOUSE` | Monster | Bet big, try to get all-in |
| `FOUR_OF_A_KIND` | Monster | Slow-play or bet big |
| `STRAIGHT_FLUSH` | Nuts | Maximum value |
| `ROYAL_FLUSH` | Nuts | Maximum value |

---

## Pot Odds Formula

```
potOdds = toCall / (pot + toCall)
```

If your estimated hand equity > potOdds, calling is profitable.

Example: Pot is 300, toCall is 100
- potOdds = 100 / (300 + 100) = 0.25 = 25%
- You need >25% chance to win to call profitably

---

## Testing Your Bot

```bash
# Health check
curl http://localhost:3001/health

# Test decision
curl -X POST http://localhost:3001/action \
  -H "Content-Type: application/json" \
  -d '{"gameId":"test","handNumber":1,"stage":"pre-flop","you":{"name":"Bot","chips":10000,"holeCards":["A♠","K♥"],"bet":0,"position":"BTN"},"action":{"canCheck":false,"toCall":100,"minRaise":200,"maxRaise":9900},"table":{"pot":150,"currentBet":100,"communityCards":[],"smallBlind":50,"bigBlind":100,"ante":0},"players":[]}'
```

---

## Error Handling

Always wrap your logic in try/catch and return fold on error:

```javascript
function decide(state) {
  try {
    // Your strategy here
    return yourAction;
  } catch (error) {
    console.error('Bot error:', error);
    return { type: 'fold' };
  }
}
```

This prevents your bot from being disconnected after 3 errors.
