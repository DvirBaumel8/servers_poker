# Bot Developer Guide

Welcome. This guide tells you everything you need to build a bot that competes on this platform.
Your bot is a plain HTTP server. We call it when it's your turn, you respond with an action.
That's the entire integration.

---

## Quick Start

1. **Register an account** — `POST /users/register`
2. **Register your bot** — `POST /bots` with your server's URL
3. **Run the validator** — `POST /bots/:id/validate` to confirm your bot handles all scenarios
4. **Enter a tournament** — `POST /tournaments/:id/register`
5. **Watch it play** — open the dashboard and select your tournament

---

## Your Bot is an HTTP Server

Your bot needs exactly **one endpoint**:

```
POST /action
```

The game server sends a JSON body describing the current game state.
You respond with a JSON action. That's it.

**Requirements:**
- Must respond within the turn timeout (default 10 seconds)
- Must return `Content-Type: application/json`
- Must return a valid action (see §Actions)
- Can run anywhere — localhost, a VPS, a cloud function

**What happens if your bot fails:**
- Timeout, network error, or invalid response → your bot is **folded** for that action (strike 1)
- 3 consecutive failures → your bot is **disconnected** from the table and sits out
- Strikes reset to 0 on any successful response

---

## The Game State Payload

Every time it's your turn, we POST this to your `/action` endpoint:

```json
{
  "gameId": "tourn_micro",
  "handNumber": 7,
  "stage": "flop",

  "you": {
    "name": "MyBot",
    "chips": 4200,
    "holeCards": ["A♠", "K♥"],
    "bet": 100,
    "position": "CO",
    "bestHand": {
      "name": "ONE_PAIR",
      "cards": ["A♠", "K♥", "A♦", "Q♣", "J♠"]
    }
  },

  "action": {
    "canCheck": false,
    "toCall": 200,
    "minRaise": 400,
    "maxRaise": 4000
  },

  "table": {
    "pot": 850,
    "currentBet": 300,
    "communityCards": ["A♦", "Q♣", "J♠"],
    "smallBlind": 75,
    "bigBlind": 150,
    "ante": 25
  },

  "players": [
    {
      "name": "MyBot",
      "chips": 4200,
      "bet": 100,
      "folded": false,
      "allIn": false,
      "position": "CO",
      "disconnected": false
    },
    {
      "name": "Opponent",
      "chips": 1800,
      "bet": 300,
      "folded": false,
      "allIn": false,
      "position": "BTN",
      "disconnected": false
    }
  ]
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `gameId` | string | The tournament ID |
| `handNumber` | number | Current hand count (starts at 1) |
| `stage` | string | `pre-flop` \| `flop` \| `turn` \| `river` |
| `you.name` | string | Your bot's name |
| `you.chips` | number | Your current chip stack |
| `you.holeCards` | string[] | Your two hole cards, e.g. `["A♠","K♥"]` |
| `you.bet` | number | Chips you've already put in this street |
| `you.position` | string | Your position at the table (see §Positions) |
| `you.bestHand` | object \| absent | Your current best hand (absent pre-flop) |
| `you.bestHand.name` | string | Hand name, e.g. `"FLUSH"` |
| `you.bestHand.cards` | string[] | The 5 cards making the hand |
| `action.canCheck` | boolean | Whether you can check (true = no one has bet) |
| `action.toCall` | number | Chips needed to call (0 if you can check) |
| `action.minRaise` | number | Minimum raise amount (additional chips) |
| `action.maxRaise` | number | Maximum raise amount before all-in |
| `table.pot` | number | Total chips in the pot |
| `table.currentBet` | number | The current bet on this street |
| `table.communityCards` | string[] | Shared cards (0–5) |
| `table.smallBlind` | number | Current small blind |
| `table.bigBlind` | number | Current big blind |
| `table.ante` | number | Current ante (posted by all players before each hand) |
| `players` | array | All players at the table, including you |
| `players[].name` | string | Bot name |
| `players[].chips` | number | Chip stack |
| `players[].bet` | number | Chips committed this street |
| `players[].folded` | boolean | Has this player folded this hand |
| `players[].allIn` | boolean | Is this player all-in |
| `players[].position` | string | Table position |
| `players[].disconnected` | boolean | Is this bot disconnected |

**Note:** Opponent hole cards are never sent. You only see your own `holeCards`.

---

## Actions

Your bot must respond with one of these:

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

**Rules:**
- `check` is only valid when `action.canCheck` is `true`
- `raise.amount` is **additional chips** on top of the call — NOT the total bet
  - If `toCall` is 200 and you want to raise by 300, send `{ "type": "raise", "amount": 300 }` — you put in 500 total
  - `amount` must be ≥ `action.minRaise`
  - `amount` must be ≤ `action.maxRaise` (or you go all-in)
- An invalid action (wrong type, illegal check, raise below minimum) results in an automatic fold + strike

---

## Hand Names

`you.bestHand.name` will be one of:

| Name | Description |
|------|-------------|
| `HIGH_CARD` | No pair |
| `ONE_PAIR` | Two cards of the same rank |
| `TWO_PAIR` | Two different pairs |
| `THREE_OF_A_KIND` | Three cards of the same rank |
| `STRAIGHT` | Five consecutive ranks |
| `FLUSH` | Five cards of the same suit |
| `FULL_HOUSE` | Three of a kind + a pair |
| `FOUR_OF_A_KIND` | Four cards of the same rank |
| `STRAIGHT_FLUSH` | Straight + flush |
| `ROYAL_FLUSH` | A-K-Q-J-10 of the same suit |

---

## Positions

| Position | Meaning |
|----------|---------|
| `BTN` | Button (dealer) — acts last post-flop |
| `SB` | Small blind |
| `BB` | Big blind |
| `UTG` | Under the gun — first to act pre-flop |
| `UTG+1` | One seat left of UTG |
| `MP` | Middle position |
| `MP+1` | One seat left of MP |
| `HJ` | Hijack — two seats right of BTN |
| `CO` | Cutoff — one seat right of BTN |
| `BTN/SB` | Heads-up: button also posts small blind |

Position is relative — it changes every hand as the dealer rotates.

---

## Tournament Context

### Antes
Every hand, all active players post an **ante** before the blinds are dealt. The ante is in `table.ante`. You've already paid it before your turn — it's included in `table.pot`.

### Blind Levels
Blinds increase every 10 hands globally across all tables. Your `table.smallBlind`, `table.bigBlind`, and `table.ante` will increase over time. Plan your stack management accordingly.

### Stack Pressure
With antes from level 1, every hand costs chips. At level 1 (25/50/10 ante) a 9-player table spends 115 chips before cards are dealt. Your effective stack depth decreases quickly as levels advance.

### Late Registration
Your bot may be added to a running tournament during the late registration window (through level 4 by default). You'll receive the full starting stack but with higher blinds already in effect.

---

## Validation

Before entering a tournament, run the validator against your bot:

```bash
# Via the API
curl -X POST https://api.example.com/bots/<bot_id>/validate \
  -H "Authorization: Bearer <api_key>"
```

The validator sends your bot a series of 15 poker scenarios and checks:
- Your bot responds within the timeout
- Your bot returns valid JSON
- Your bot returns a legal action for each scenario
- Your bot handles edge cases: all-in, side pots, short-stack, pre-flop only

You get a detailed report showing which scenarios passed and failed.

Validation also runs automatically when you register a bot. You can re-run it anytime after updating your endpoint.

---

## Testing Locally

You don't need a running server to test. Send yourself example payloads with curl:

```bash
# Start your bot
python bot.py  # or node bot.js, etc.

# Send a test turn
curl -X POST http://localhost:8080/action \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "test",
    "handNumber": 1,
    "stage": "pre-flop",
    "you": {
      "name": "MyBot",
      "chips": 4975,
      "holeCards": ["A♠", "K♦"],
      "bet": 25,
      "position": "SB"
    },
    "action": {
      "canCheck": false,
      "toCall": 25,
      "minRaise": 50,
      "maxRaise": 4975
    },
    "table": {
      "pot": 85,
      "currentBet": 50,
      "communityCards": [],
      "smallBlind": 25,
      "bigBlind": 50,
      "ante": 10
    },
    "players": [
      { "name": "MyBot", "chips": 4975, "bet": 25, "folded": false, "allIn": false, "position": "SB", "disconnected": false },
      { "name": "Villain", "chips": 4940, "bet": 50, "folded": false, "allIn": false, "position": "BB", "disconnected": false }
    ]
  }'
```

Expected response: `{"type":"call"}` or `{"type":"raise","amount":50}` or `{"type":"fold"}`

---

## Boilerplate Code

Starter bots are available in:
- `boilerplate/node/` — Node.js
- `boilerplate/python/` — Python
- `boilerplate/java/` — Java

Each boilerplate:
- Parses the incoming game state into typed objects
- Implements a `decideAction(gameState)` function you fill in
- Handles HTTP server boilerplate, logging, and error responses
- Includes pot odds and position utilities

Start with the boilerplate, implement `decideAction`, and you're ready to compete.

---

## Common Mistakes

**Returning total bet instead of raise amount**
```json
// WRONG — this means raise BY 500, not raise TO 500
{ "type": "raise", "amount": 500 }

// If you want your total bet to be 500 and you've already bet 100:
{ "type": "raise", "amount": 400 }
```

**Trying to check when you can't**
Always check `action.canCheck` before returning `{ "type": "check" }`. If `canCheck` is `false` and you return check, your bot gets folded and a strike.

**Ignoring the ante**
The ante is already deducted before your turn. `you.chips` is your stack *after* posting the ante. Don't subtract it again.

**Not handling `stage: "pre-flop"` with no `bestHand`**
`you.bestHand` is absent pre-flop. Your code must handle `undefined`/`null` gracefully.

**Slow startup on first request**
The first request to a cold server might be slow. The validator uses a generous timeout, but in live play your bot has 10 seconds. Make sure your server is warm before joining a tournament.

---

## FAQ

**Can I change my bot's endpoint after registering?**
Yes. `PATCH /bots/:id` with a new `endpoint` URL. Re-run the validator after changing it.

**Can my bot join multiple tournaments simultaneously?**
Each bot can only have one active entry per tournament. You can register the same bot in different tournaments.

**What if I want to test against real opponents before a real tournament?**
Enter the Micro Bot Cup — it starts with just 2 players and has low buy-in. Perfect for testing.

**Can I see my bot's hand history?**
Yes. `GET /tournaments/:id/history` (requires auth) returns all hands with positions, actions, and outcomes for all bots.

**My bot keeps getting strikes but it's responding fine locally — what's wrong?**
The most common cause is the server being unreachable from the outside. Make sure your firewall allows inbound connections on your bot's port. Use the validator to confirm reachability.
