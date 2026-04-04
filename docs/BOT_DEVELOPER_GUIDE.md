# Bot Builder Guide

Build a poker bot without writing code. The Bot Builder UI lets you configure strategy through personality sliders, conditional rules, and preflop range charts.

**Status:** This guide describes the intended Bot Builder interface and strategy system. See `src/modules/bot-strategy/` for implementation details. The UI components are under active development in `frontend/src/components/builder/` and `frontend/src/pages/BotBuilder.tsx`.

---

## Getting Started

1. Navigate to `/bots/build`
2. Enter a name for your bot
3. Choose a tier (Quick, Strategy, or Pro)
4. Configure your bot's personality and strategy
5. Save and deploy

---

## Tiers

### Quick Tier

Personality sliders only. Choose a preset or dial in custom values. Best for getting started fast.

### Strategy Tier

Everything in Quick, plus:
- IF/THEN rules per street
- 13x13 preflop range chart

### Pro Tier

Everything in Strategy, plus:
- Per-position personality overrides
- Per-position rule overrides

---

## Personality Sliders

Each slider ranges from 0 to 100.

| Slider | What it controls |
|--------|-----------------|
| **Aggression** | How often the bot raises vs. calls. High = more raises. |
| **Bluff Frequency** | How often the bot bets or raises without a strong hand. |
| **Risk Tolerance** | Willingness to commit chips with marginal hands. |
| **Tightness** | Hand selection strictness. High = fewer hands played. |

---

## Personality Presets

Select a preset to auto-fill the sliders, then fine-tune if needed.

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

## Rules (Strategy & Pro Tiers)

Rules are IF/THEN conditions evaluated per street. Each rule has:

- **Street**: `preflop`, `flop`, `turn`, or `river`
- **Conditions**: one or more conditions that must all be true
- **Action**: what to do when conditions match (`fold`, `check`, `call`, `raise`, `all_in`)

### Condition Fields

| Field | Type | Description |
|-------|------|-------------|
| `handStrength` | string | Current hand rank: `HIGH_CARD`, `ONE_PAIR`, `TWO_PAIR`, etc. |
| `pairType` | string | `overpair`, `top_pair`, `middle_pair`, `bottom_pair`, `none` |
| `facingBet` | boolean | Whether an opponent has bet this street |
| `myPosition` | string | `BTN`, `CO`, `HJ`, `MP`, `UTG`, `SB`, `BB` |
| `potSizeBB` | number | Pot size in big blinds |
| `stackSizeBB` | number | Your stack in big blinds |
| `numOpponents` | number | Active opponents remaining in the hand |
| `street` | string | Current street: `preflop`, `flop`, `turn`, `river` |
| `isHeadsUp` | boolean | Only two players in the hand |
| `facingRaise` | boolean | Whether facing a raise (re-raise situation) |
| `betToCallBB` | number | Amount to call in big blinds |

### Example Rule

```json
{
  "street": "flop",
  "conditions": [
    { "field": "handStrength", "operator": ">=", "value": "TWO_PAIR" },
    { "field": "facingBet", "operator": "==", "value": true }
  ],
  "action": { "type": "raise", "sizing": "pot" }
}
```

Rules are evaluated top-to-bottom. The first matching rule determines the action. If no rule matches, the personality sliders drive the decision.

---

## Range Chart (Strategy & Pro Tiers)

A 13x13 grid representing all possible preflop hand combinations. Rows and columns are ranks (A through 2). Cells above the diagonal are suited hands, below are offsuit, and the diagonal is pairs.

For each cell, assign one of:
- **Raise** — open-raise or 3-bet
- **Call** — call a raise
- **Fold** — fold preflop

The range chart takes priority over personality sliders for preflop decisions.

---

## Position Overrides (Pro Tier)

Override personality sliders and rules for specific positions. For example:

- Play tighter from UTG (raise tightness to 90)
- Play more aggressively from BTN (raise aggression to 85)
- Add a 3-bet bluff rule only from the CO

Each position override can include:
- Custom personality slider values
- Additional rules or rule overrides

---

## Testing: What-If Simulator

Before deploying, test your bot with the What-If Simulator:

1. Open the simulator from the bot builder page
2. Set up a scenario: your cards, board cards, position, opponent actions
3. Run the simulation to see what action your bot would take
4. Adjust your strategy and re-test

---

## Strategy JSON Format

The bot's strategy is stored as JSON. You can export, edit, and import it directly.

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
        { "field": "handStrength", "operator": ">=", "value": "THREE_OF_A_KIND" }
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

The `StrategyEngineService` evaluates this JSON in-process on every action. No external servers or HTTP calls are involved.
