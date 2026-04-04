# Changelog

All notable changes to BotRoyale are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

---

## [2026-04-04] — Onboarding Carousel & Engineering Excellence

### Added

#### Welcome Carousel (Onboarding)
- **`frontend/src/components/WelcomeCarousel.tsx`** — New 4-slide immersive modal shown once
  to every new user on the Dashboard.
  - Slide 1 (Introduction): username greeting, Free Bot confirmation, arena SVG illustration
  - Slide 2 (Daily Tournament): 21:00 IST schedule, animated countdown timer SVG
  - Slide 3 (Tiers & Limits): FREE vs PRO comparison grid, prominent Upgrade CTA
  - Slide 4 (Lab & Sims): Scenario Lab / Deep Simulations / Hand Replay feature overview
  - "Don't show this again" checkbox on final slide
  - ⚡ Upgrade to Pro pill accessible from all slides
  - Smooth `wc-fade` slide-in + `wc-fadeout` close animation (260ms)
  - All illustrations are inline SVG — no image file dependencies
  - Responsive: illustration panel hidden on screens ≤ 620px

- **`frontend/src/pages/Home.tsx`** — Carousel integration:
  - Imports `useAuthStore` to read `user.name` for personalised greeting
  - `showCarousel` state initialised from `localStorage.getItem('hasSeenWelcomeCarousel') !== 'true'`
  - `handleCarouselClose(persist)` and `handleCarouselUpgrade(persist)` handlers
  - Carousel and upgrade Toast rendered at the `Home()` level (not inside a child component)

- **`.cursorrules`** — Project-wide Cursor rule file with:
  - CRITICAL onboarding flow protection rules
  - Frontend/backend conventions summary
  - Testing requirements
  - Documentation update checklist

- **`docs/onboarding.md`** — Full documentation:
  - localStorage gate logic explained
  - Tier definitions (FREE: 1 bot manual; PRO: 5 bots auto)
  - Tournament timing reference (21:00 IST / 15:30 UTC)
  - Animation catalogue
  - Reset instructions for development

- **`frontend/src/components/WelcomeCarousel.test.tsx`** — Vitest + React Testing Library suite:
  - Test 1: Carousel renders on first load (empty localStorage)
  - Test 2: Carousel hidden when `hasSeenWelcomeCarousel === 'true'`
  - Test 3: "Don't show again" + close correctly persists to localStorage
  - Test 4: Next → and ← Back slide navigation

- **`frontend/src/test-setup.ts`** — Vitest setup file importing `@testing-library/jest-dom` matchers

- **`frontend/vite.config.ts`** — Added `test` block: jsdom environment, globals, setup file

- **`frontend/package.json`** — Added `"test": "vitest"` and `"test:ui": "vitest --ui"` scripts

### Changed

#### Global UI Unification
- **`frontend/src/styles/tokens.ts`** (prior session) — Extracted `C`, `T`, `barTrack`, `barFill`,
  `glassChip` design tokens into a shared module; all pages import from this module instead of
  defining local `C` objects. `WelcomeCarousel` retains a local `C` (self-contained component
  pattern for portability).
- **`frontend/src/components/CustomSelect.tsx`** — Dynamic width, real-time search (>8 options),
  two-column grid for flat option lists, elevated shadow/blur, 400px max-height.

### Fixed
- **Double-winner bug** (2026-04-03): `playerTotalBets` not reset after hand — chip conservation
  validator was reporting false positives. Fixed in `live-game-manager.service.ts`.
- **Action sequence ordering bug** (2026-04-03): `street_progression` invariant now correctly
  handles preflop < flop < turn < river action ordering.

---

## [2026-04-04] — Scenario Lab, Simulation Delete, Simulation History Polish

### Added
- **`/scenario-lab`** — Single-hand workbench: construct any poker situation, see bot reasoning,
  action tendency bars, CardPicker modal.
- **`DELETE /api/v1/simulations/:id`** — Ownership-checked simulation delete (204 No Content).
- **Simulation History UI** — Per-row trash icon with inline confirm, "Clear History" two-click
  guard (only deletes COMPLETED/FAILED, preserves in-progress).
- **Equity Curve (Compare Mode)** — recharts `LineChart` overlaying profit curves for Run A vs B.
- **Winning Highlight** — Compare panel highlights the winning metric with green glow.
- **CustomSelect v2** — Search, two-column grid, dynamic width (see Global UI Unification above).

---

## [2026-04-04] — Range Chart: Position Tabs, Unset=Fold, Stats

### Changed
- **`RangeChart.tsx`** — Position tab bar (Global/UTG/HJ/CO/BTN/SB/BB), inheritance indicator,
  `F` watermark on unset cells, stats bar showing Raise/Call/Fold as segments.
- **`BotBuilder.tsx`** — `positionOverrides` wired through save/load/auto-save for Pro tier bots.

---

## [2026-04-04] — Contact Support Page + Sidebar Refactor

### Added
- **`/support`** — Contact form with pre-filled name/email, subject dropdown, char counter,
  calls existing `POST /api/v1/contact` endpoint.
- **`frontend/src/components/Sidebar.tsx`** — Shared sidebar extracted; all pages use `<Sidebar />`
  with no props.

---

## [2026-04-04] — Tournament Analytics "The Quant Deck" (V2.0)

### Added
- **`/games`** — High-performance forensics IDE: SVG heatmap scrubber, equity pulse bars,
  terminal-style Logic Stream, Math Matrix popover, Fork to Simulator.
- **`analyticsStore`** — Zustand store for active tournament/hand/playback state.
- **`GET /api/v1/tournaments/:id/hands-manifest`** — Lightweight hand list for heatmap rendering.

---

## [2026-04-04] — Leaderboard: User-Based Developer Rankings

### Changed
- Leaderboard now ranks **users** (developers) by aggregating all their bots' stats.
  Bot names hidden from this view. `activeBotCount` tooltip shows count only.
- `mv_user_leaderboard` materialized view added.

---

## [2026-04-03] — Headless Simulation Engine, Worker Pool, Strategy Engine Optimizations

### Added
- Headless bot simulation sandbox (Worker Threads, no DB writes during simulation).
- Worker pool (`WorkerPool`) with fixed-size reuse and heartbeat monitoring.
- Strategy engine: bitwise Uint8Array LUT, LRU eval cache, lazy preflop evaluation.
- Equity service: Rule of 2/4 heuristic + Monte Carlo, EV calculation.
- Positional awareness multipliers (BTN 0.5× → UTG 1.0× tightness scaling).
- Seeded RNG: SHA-256 decision seeds derived from provably fair chain.
- Showdown rules: last aggressor ordering, muck/show logic, step-by-step reveal.

---

## [2026-04-01] — Full Tournament System

### Added
- Tournament discovery, registration, lobby, live viewing, and results pages.
- Socket.IO real-time updates for player count, lobby countdown, live game state.
- `GET /api/v1/tournaments/:id/results` — public results endpoint with payout data.
- Podium visualization for top 3 finishers (gold/silver/bronze).

---

*Older entries condensed — see `CLAUDE.md` for full implementation history.*
