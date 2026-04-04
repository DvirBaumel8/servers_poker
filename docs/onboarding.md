# Onboarding — Welcome Carousel

The `WelcomeCarousel` is a 4-slide immersive modal that fires **once** on the Dashboard for every
new user. It introduces the platform's key concepts: the Arena, the Daily Tournament, tier limits,
and the Lab tools.

---

## Files

| File | Role |
|------|------|
| `frontend/src/components/WelcomeCarousel.tsx` | Self-contained carousel component + inline SVG illustrations |
| `frontend/src/pages/Home.tsx` | Mounts the carousel, owns all `localStorage` read/write logic |

---

## Visibility & localStorage Logic

### Key: `hasSeenWelcomeCarousel`

The carousel is gated by a single `localStorage` key:

```ts
// Home.tsx — state initialization (runs once on mount)
const [showCarousel, setShowCarousel] = useState(
  () => localStorage.getItem('hasSeenWelcomeCarousel') !== 'true'
)
```

`showCarousel` is `true` when the key is absent or set to any value other than `'true'`.

### When the key is written

The key is written **only** by two handlers in `Home.tsx`:

| Handler | Trigger | Condition |
|---------|---------|-----------|
| `handleCarouselClose(persist)` | X button, click-outside, "Build Your First Bot" | If `persist === true` |
| `handleCarouselUpgrade(persist)` | "Upgrade to Pro" button | If `persist === true` |

`persist` is the `dontShow` boolean from inside the carousel, controlled by the
"Don't show this again" checkbox on **Slide 4 only**.

### Special case: "Build Your First Bot" (Slide 4 CTA)

This button always calls `onClose(true)` regardless of the checkbox — clicking the final CTA
is treated as an implicit "I've seen the onboarding" signal.

### Reset during development

```js
localStorage.removeItem('hasSeenWelcomeCarousel')
```

Paste in the browser console and reload to see the carousel again.

---

## Carousel Structure

### Slide 1 — INTRODUCTION

- **Header:** `"Welcome, {userName}! The Arena Awaits."`
- **Content:** Confirms 1 Free Bot slot is active.
- **Illustration:** Female figure at a glowing poker table, large cyan `1` orb.
- **Navigation:** Next →

### Slide 2 — THE DAILY TOURNAMENT

- **Header:** `"FIGHT FOR GLORY. EVERY DAY."`
- **Content:** Explains the daily tournament schedule.
- **Illustration:** Animated circular countdown timer, bot battle icons.
- **Navigation:** ← Back | Next →

### Slide 3 — TIERS & LIMITS

- **Header:** `"TIERS & LIMITS: KNOW YOUR POWER."`
- **Content:** Free vs Pro tier comparison cards + prominent Upgrade button.
- **Illustration:** FREE bot (grey, small) vs PRO bot (cyan, armored).
- **Navigation:** ← Back | ⚡ Upgrade to Pro | Next →

### Slide 4 — THE LAB & SIMS (Final)

- **Header:** `"ANALYZE & OPTIMIZE in THE LAB."`
- **Content:** Scenario Lab, Deep Simulations, Hand Replay.
- **Illustration:** Cockpit dashboard with heatmap grid and holographic hands.
- **Checkbox:** "Don't show this again" (controls `dontShow` state)
- **Navigation:** ← Back | 🤖 Build Your First Bot

---

## Tier Definitions (as shown in the UI)

| Tier | Bots | Registration | Entry |
|------|------|-------------|-------|
| **FREE** | 1 bot | Manual | Must register each day |
| **PRO** | 5 bots | Automatic | Auto-entered into all daily tournaments |

> These limits are defined in the carousel UI copy only. The backend subscription system
> enforces them via `user.subscription_status` (`'free'` | `'active'` | `'cancelled'` | `'expired'`).

---

## Tournament Timings

| Time | Zone |
|------|------|
| **21:00** | IST (India Standard Time, UTC+5:30) |
| **19:00** | IST displayed as (UTC+0 reference shown in carousel) |
| **15:30** | UTC |

> The canonical scheduled start is stored on the tournament as `scheduled_start_at` (ISO 8601).
> The carousel hardcodes the human-readable display times for UX clarity.

**Correction note:** The tournament fires at **21:00 IST = 15:30 UTC** (not 19:00 UTC as
previously shown in slide 2 copy — that was a display approximation). The authoritative time
is always `scheduled_start_at` from the API.

---

## Animation & Transitions

- **Slide-in:** `@keyframes wc-fade` — opacity 0 → 1, translateY(8px → 0), 320ms ease
- **Slide close (fade-out):** `@keyframes wc-fadeout` — overlay opacity 1 → 0, card scale 1 → 0.96, 260ms ease; `onClose` is called after animation completes
- **Timer sweep:** `@keyframes wc-sweep` — `transform: rotate(0 → 360deg)`, 4s linear infinite (Slide 2 illustration)
- **Ambient glow:** `@keyframes wc-glow` — opacity pulse, 1.5–2.5s ease-in-out infinite

---

## Testing

Tests live in `frontend/src/components/WelcomeCarousel.test.tsx`.

Run:
```bash
cd frontend && npm test
```

Four tests cover:
1. Carousel renders when `localStorage` is empty
2. Carousel is hidden when `hasSeenWelcomeCarousel === 'true'`
3. "Don't show again" + close correctly sets `localStorage`
4. Next / Back slide navigation

See `.cursorrules` → **CRITICAL: Onboarding Flow Protection** for manual verification checklist.
