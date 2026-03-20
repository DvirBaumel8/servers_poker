# Tournament Rules

This document defines the official rules of all tournaments hosted on this platform.
It is the operator's reference — written clearly enough that anyone running the platform
understands exactly how every tournament works without reading code.

Last updated: see git history.

---

## 1. Format

All tournaments are **No-Limit Texas Hold'em** multi-table tournaments (MTTs).

- Players start at randomly assigned tables of up to 9 players each
- As players bust out, tables are broken and players are redistributed to keep tables balanced
- The tournament ends when one player holds all the chips — they are declared the winner

---

## 2. Buy-In and Prize Pool

- Each entrant pays a **buy-in** in chips to enter
- 100% of all buy-ins go directly to the prize pool — there is no rake at this time
- The prize pool is displayed in real time as players register
- Payouts are calculated once registration closes and displayed in the tournament lobby

---

## 3. Starting Stack

All players receive **5,000 chips** at the start of the tournament, regardless of when they register (within the allowed registration window).

---

## 4. Blind Structure

Blinds and antes increase automatically. Levels advance based on **global hands played** across all active tables simultaneously — not per-table.

**Advancement:** every **10 hands** globally

| Level | Small Blind | Big Blind | Ante |
|-------|-------------|-----------|------|
| 1 | 25 | 50 | 10 |
| 2 | 50 | 100 | 15 |
| 3 | 75 | 150 | 25 |
| 4 | 100 | 200 | 25 |
| 5 | 150 | 300 | 50 |
| 6 | 200 | 400 | 50 |
| 7 | 300 | 600 | 75 |
| 8 | 400 | 800 | 100 |
| 9 | 600 | 1,200 | 150 |
| 10 | 800 | 1,600 | 200 |
| 11 | 1,000 | 2,000 | 300 |
| 12 | 1,500 | 3,000 | 400 |
| 13 | 2,000 | 4,000 | 500 |
| 14 | 3,000 | 6,000 | 750 |
| 15 | 5,000 | 10,000 | 1,000 |

After level 15, blinds remain at level 15 values until the tournament concludes.

### Antes
Antes are posted by **all active players** before each hand, starting from **level 1**.
A player with fewer chips than the ante posts what they have (all-in ante).

---

## 5. Registration

### Rolling Tournaments
Registration opens immediately when the tournament is created. The tournament starts automatically once the **minimum number of players** is reached. Registration may remain open for late entries after the tournament starts (see §6).

### Scheduled Tournaments
A start time is defined in advance. Registration opens before the start time and closes at the end of the late registration period (see §6).

### Capacity
Each tournament has a maximum player limit. Once full, no further registrations or rebuys are accepted.

---

## 6. Late Registration

Late registration allows bots to enter a tournament **after it has already started**.

- Late registration closes at the **end of blind level defined by `late_reg_ends_level`** (default: level 4)
- Late entrants receive the full starting stack of 5,000 chips
- Late entrants are seated at the table with the fewest players
- Late registration closes early if the tournament reaches the money (payouts begin)

After late registration closes, no new entries or rebuys are accepted.

---

## 7. Rebuys

Rebuys are available in tournaments where `rebuys_allowed = true` (freezeout tournaments do not permit rebuys).

- A bot may rebuy **after busting** (reaching 0 chips)
- Rebuys are only permitted while late registration is still open
- A rebuy creates a **new entry row** — the bot re-enters with a fresh starting stack of 5,000 chips
- Rebuys add to the prize pool at the same rate as the original buy-in
- A bot may only have **one active entry** at a time (one entry with no finish position)
- A bot's results show the sum of all payouts and their best finish position across all entries

**Freezeout tournaments** (`rebuys_allowed = false`): one entry per bot, no second chances.

---

## 8. Table Management

### Balancing
Tables are kept as even as possible. When the difference between the largest and smallest table exceeds 2 players, one player is moved from the largest to the smallest.

### Breaking
When a table falls to **4 or fewer players** and another table can absorb them without exceeding 9, the table is broken. Players are randomly redistributed to the remaining tables.

### Final Table
When 9 or fewer players remain across all tables, all surviving players are consolidated to a single **final table**. The final table is marked with a special indicator in the UI and database.

---

## 9. Bot Conduct and Fault Tolerance

### Turn Timeout
Each bot has a fixed time limit per action (default: 10 seconds, configurable per tournament). If a bot does not respond in time, it is automatically **folded**.

### Strike System
A failed action (timeout, network error, invalid response, illegal move) counts as a **strike**.

- **Strike 1–2:** Bot is folded for that action. Play continues.
- **Strike 3 (consecutive):** Bot is **disconnected** from the table. It sits out all future hands.
- **Strike reset:** Strikes reset to 0 on any successful valid action.

### Disconnection
A disconnected bot's chips remain in play but the bot is treated as having busted. The bot's finish position is recorded at the time of disconnection.

### Reconnection
A disconnected bot may rejoin the same tournament by re-registering via `POST /tournaments/:id/register`, provided late registration is still open. The bot receives the chips remaining at the time of disconnection, not a fresh stack.

### Chip Commitment
Any chips a bot has committed to the pot (blinds, antes, calls, raises) before disconnecting remain in the pot. This follows standard poker rules — money in the pot stays there.

---

## 10. Payout Structure

Approximately **15% of the field** receives a payout. Payouts are weighted towards the top finishers. The exact number of paid places and percentages depend on the number of entrants:

| Entrants | Places Paid | 1st | 2nd | 3rd | 4th | Others |
|----------|-------------|-----|-----|-----|-----|--------|
| 2–5 | 1 | 100% | — | — | — | — |
| 6–9 | 2 | 65% | 35% | — | — | — |
| 10–18 | 3 | 50% | 30% | 20% | — | — |
| 19–27 | 4 | 40% | 25% | 20% | 15% | — |
| 28–45 | 5 | 35% | 22% | 18% | 14% | 11% |
| 46–90 | 9 | 28% | 18% | 14% | 11% | distributed |
| 91–180 | 18 | 25% | 15% | 11% | 9% | distributed |

- Payout amounts are floored to whole chips. Any remainder from rounding goes to 1st place.
- Payout structure is finalized once late registration closes and rebuys are no longer accepted.
- Payouts are awarded in tournament chips (not real currency) unless otherwise specified.

---

## 11. Finish Position

- The **last bot standing** finishes 1st
- When a bot busts, they receive the finish position equal to the number of players remaining at that moment plus 1
- If two bots bust in the same hand, the bot who had more chips at the start of that hand finishes in the higher position
- A disconnected bot is assigned the finish position at the time of disconnection

---

## 12. Currently Available Tournaments

These tournaments are provisioned from `tournaments.config.js`. The operator may add, modify, or remove tournaments by updating this file and restarting the server.

### Micro Bot Cup
| Parameter | Value |
|-----------|-------|
| Type | Rolling (starts at min players) |
| Buy-in | 100 chips |
| Min players | 2 |
| Max players | 18 |
| Rebuys | Yes |
| Late registration | Through level 4 |

### Standard Championship
| Parameter | Value |
|-----------|-------|
| Type | Rolling |
| Buy-in | 500 chips |
| Min players | 9 |
| Max players | 90 |
| Rebuys | Yes |
| Late registration | Through level 4 |

### High Roller Invitational
| Parameter | Value |
|-----------|-------|
| Type | Rolling |
| Buy-in | 2,000 chips |
| Min players | 6 |
| Max players | 45 |
| Rebuys | No (Freezeout) |
| Late registration | Through level 3 |

---

## 13. Rule Changes

The operator reserves the right to modify these rules at any time by updating `tournaments.config.js` and this document. Changes take effect for new tournaments only — running tournaments complete under the rules in effect at their start time.
