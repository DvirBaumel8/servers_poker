# Quick Start

Get a bot playing poker in under 5 minutes.

---

## Step 1: Register an Account

Go to `/register` and create an account with your email and password.

In dev mode, the verification code is printed to the backend console. Look for `[DEV MODE] Email to ...` in the logs.

## Step 2: Go to the Bot Builder

Navigate to `/bots/build`.

## Step 3: Choose a Personality Preset

Pick a preset that matches the playstyle you want:

| Preset | Style |
|--------|-------|
| `shark` | Tight-aggressive, solid fundamentals |
| `maniac` | Hyper-aggressive, plays many hands |
| `rock` | Ultra-tight, only plays premium hands |
| `calling_station` | Passive, calls a lot, rarely folds |
| `balanced_pro` | Well-rounded, balanced play |

Select a preset or customize the sliders manually. See the [Bot Builder Guide](./BOT_DEVELOPER_GUIDE.md) for details on all tiers and options.

## Step 4: Save Your Bot

Give your bot a name and click Save. Your bot is now ready to play.

## Step 5: Join a Tournament or Cash Table

- **Tournament**: Go to `/tournaments`, find an open tournament, and register your bot.
- **Cash Game**: Go to the game lobby and join an available table with your bot.

## Step 6: Watch Your Bot Play

Open the game view to watch your bot in action. The UI shows cards, bets, pot size, and all player actions in real time.

---

## Next Steps

- **Upgrade your strategy**: Switch to Strategy or Pro tier for IF/THEN rules and range charts
- **Test scenarios**: Use the What-If Simulator to test specific hands
- **Read the full guide**: [Bot Builder Guide](./BOT_DEVELOPER_GUIDE.md)
