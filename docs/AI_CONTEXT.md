# AI Assistant Context for Poker Bot Development

> **Instructions for AI**: Copy this entire file into your conversation with ChatGPT, Claude, or any AI assistant when you need help with bot strategy. The AI will have all the context it needs.

---

## System Overview

You are helping configure a bot for a poker tournament platform. Bots are created through the Bot Builder UI at `/bots/build`. Strategy is defined as JSON and evaluated in-process by the `StrategyEngineService`. No external HTTP servers are involved.

---

## Bot Builder Tiers

| Tier | Features |
|------|----------|
| **Quick** | Personality sliders only |
| **Strategy** | + IF/THEN rules per street + preflop range chart |
| **Pro** | + per-position personality and rule overrides |

---

## Personality Sliders

Each ranges 0–100:

| Slider | Effect |
|--------|--------|
| `aggression` | Raise frequency vs. call frequency |
| `bluffFrequency` | Betting/raising without a strong hand |
| `riskTolerance` | Willingness to commit chips with marginal hands |
| `tightness` | Hand selection strictness (high = fewer hands) |

### Presets

| Preset | Aggression | Bluff Freq | Risk Tolerance | Tightness |
|--------|-----------|------------|----------------|-----------|
| `shark` | 70 | 30 | 50 | 70 |
| `rock` | 20 | 5 | 15 | 95 |
| `maniac` | 95 | 80 | 90 | 10 |
| `calling_station` | 15 | 5 | 70 | 30 |
| `nit` | 10 | 0 | 5 | 99 |
| `balanced_pro` | 60 | 35 | 45 | 60 |
| `tricky` | 55 | 65 | 55 | 50 |
| `bully` | 85 | 50 | 75 | 40 |

---

## Strategy JSON Format

```json
{
  "personality": {
    "aggression": 70,
    "bluffFrequency": 30,
    "riskTolerance": 50,
    "tightness": 70
  },
  "rules": [
    {
      "street": "flop",
      "conditions": [
        { "field": "handStrength", "operator": ">=", "value": "TWO_PAIR" },
        { "field": "facingBet", "operator": "==", "value": true }
      ],
      "action": { "type": "raise", "sizing": "pot" }
    }
  ],
  "rangeChart": {
    "AA": "raise", "AKs": "raise", "AKo": "raise",
    "72o": "fold"
  },
  "positionOverrides": {
    "UTG": {
      "personality": { "tightness": 90 }
    },
    "BTN": {
      "personality": { "aggression": 85 }
    }
  }
}
```

---

## Rule Condition Fields

| Field | Type | Description |
|-------|------|-------------|
| `handStrength` | string | `HIGH_CARD`, `ONE_PAIR`, `TWO_PAIR`, `THREE_OF_A_KIND`, `STRAIGHT`, `FLUSH`, `FULL_HOUSE`, `FOUR_OF_A_KIND`, `STRAIGHT_FLUSH`, `ROYAL_FLUSH` |
| `pairType` | string | `overpair`, `top_pair`, `middle_pair`, `bottom_pair`, `none` |
| `facingBet` | boolean | Whether an opponent has bet this street |
| `facingRaise` | boolean | Whether facing a raise/re-raise |
| `myPosition` | string | `BTN`, `CO`, `HJ`, `MP`, `UTG`, `SB`, `BB` |
| `potSizeBB` | number | Pot size in big blinds |
| `stackSizeBB` | number | Your stack in big blinds |
| `betToCallBB` | number | Amount to call in big blinds |
| `numOpponents` | number | Active opponents in the hand |
| `isHeadsUp` | boolean | Only two players in the hand |
| `street` | string | `preflop`, `flop`, `turn`, `river` |

---

## Range Chart

A 13x13 grid (A through 2). Above diagonal = suited, below = offsuit, diagonal = pairs. Each cell is `raise`, `call`, or `fold`.

---

## Position Names

| Position | Description |
|----------|-------------|
| `BTN` | Button (dealer) — acts last post-flop |
| `SB` | Small blind |
| `BB` | Big blind |
| `UTG` | Under the gun — first to act pre-flop |
| `CO` | Cutoff — one before button |
| `HJ` | Hijack — two before button |
| `BTN/SB` | Heads-up: button is also small blind |

---

## Hand Strength Reference

| Hand | Strength | Typical Strategy |
|------|----------|-----------------|
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

## Common AI Prompts

### "Help me build a bot strategy"
Describe the playstyle you want:
- "Make it tight-aggressive from early position, loose from the button"
- "Add a river bluff when facing a small bet with a missed draw"
- "Set up range chart for a LAG style"

### "My bot folds too much"
Share your strategy JSON and ask for adjustments to tightness and bluff frequency.

### "Explain pot odds"
Pot odds formula: `toCall / (pot + toCall)`. If your hand equity exceeds pot odds, calling is profitable.

---

## Pot Odds Formula

```
potOdds = toCall / (pot + toCall)
```

Example: Pot is 300, toCall is 100
- potOdds = 100 / 400 = 0.25 = 25%
- You need >25% equity to call profitably
