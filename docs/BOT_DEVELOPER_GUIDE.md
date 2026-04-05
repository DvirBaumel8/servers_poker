# Bot Builder Guide

Build a poker bot without writing code. The Bot Builder UI lets you configure strategy through personality sliders, conditional rules, and preflop range charts.

**Status:** This guide describes the intended Bot Builder interface and strategy system. See `src/modules/bot-strategy/` for implementation details. The UI components are under active development in `frontend/src/components/builder/` and `frontend/src/pages/BotBuilder.tsx`.

---

## Bot Slot Limits

| Plan | Bot slots | Tournament entry |
|---|---|---|
| **Free** (`subscription_status: 'free'`) | 1 | Manual daily registration |
| **Pro** (`subscription_status: 'active'`) | 5 | Automatic entry to all daily tournaments |

Cancelled or expired subscriptions fall back to Free limits (1 slot). The limit is enforced server-side in `BotsService` — the API returns `400` when the cap is reached. Deactivating an existing bot frees a slot.

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
- **Unset** (grey "F") — defaults to Fold (the engine treats unset cells as Fold)

The range chart takes priority over personality sliders for preflop decisions.

**Stats bar:** Shows Raise / Call / Fold percentages across all 1326 hand combinations. Unset cells are counted as Fold, so the total always equals 100%.

---

## Position Overrides (Pro Tier)

Override personality sliders, rules, and the range chart for specific positions. Available positions: UTG, HJ, CO, BTN, SB, BB.

**Position-specific range charts** are the most powerful Tier 3 feature:
- Switch to a position tab (e.g. BTN) above the range chart grid
- Tabs with a cyan dot have custom overrides; others inherit from the Global range
- Paint cells on the position tab to override specific hands from that seat
- A position with no painted cells shows "Inheriting from Global" and uses the global range

Each position override can include:
- Custom personality slider values
- Additional rules or rule overrides
- A full per-position preflop range chart

The engine fallback order: `positionOverrides[pos].rangeChart` → `globalRangeChart` → rules → personality.

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
