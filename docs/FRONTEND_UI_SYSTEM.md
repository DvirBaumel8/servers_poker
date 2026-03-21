# Frontend UI System

This document describes the frontend design system introduced in the full UI overhaul.

## Goals

The new frontend is built around four product goals:

- consistent visual language across marketing, auth, workspace, and gameplay
- reusable primitives instead of page-specific styling
- explicit loading, empty, error, success, and confirmation patterns
- route-level shell separation so each surface can feel intentional

## Shells

The frontend now uses four top-level shells in `frontend/src/App.tsx`:

- `MarketingLayout`
  - used for `/`
  - supports the public landing experience
- `AuthLayout`
  - used for `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`
  - supports focused onboarding/auth flows
- `Layout`
  - used for the main product workspace: tables, tournaments, bots, leaderboard, profile, admin analytics
  - provides the persistent product chrome
- `GameLayout`
  - used for `/game/:tableId`
  - keeps the gameplay surface isolated from workspace chrome

## Design Tokens

The base visual system lives in:

- `frontend/tailwind.config.js`
- `frontend/src/index.css`

These files define:

- color tokens for `surface`, `panel`, `line`, `accent`, and semantic status colors
- shell and panel gradients
- typography defaults
- shadows, spacing helpers, and interaction classes
- reusable CSS utility classes like `app-shell`, `page-shell`, `surface-card`, `btn-primary`, and `input-field`

When adding new UI, prefer extending tokens first instead of introducing page-local colors or gradients.

## Shared Primitives

The primary FE system file is:

- `frontend/src/components/ui/primitives.tsx`

Core primitives include:

- `PageShell`
- `PageHeader`
- `SurfaceCard`
- `Button`
- `TextField`
- `SegmentedTabs`
- `MetricCard`
- `StatusPill`
- `AlertBanner`
- `EmptyState`
- `LoadingBlock`
- `AppModal`
- `ConfirmDialog`

These primitives should be the default choice for new UI work.

## State Patterns

Every new page should use the same state language:

- loading
  - use `LoadingBlock` for page-level loading
- empty
  - use `EmptyState`
- error
  - use `AlertBanner`
- confirmation
  - use `ConfirmDialog`
- forms/dialogs
  - use `TextField` and `AppModal`

Avoid:

- native `confirm()`
- ad hoc alert boxes
- page-specific button/input implementations when primitives already exist

## Page Types

The redesign organizes the app into clear page categories:

- marketing
  - `Home`
- auth
  - `Login`, `Register`, `ForgotPassword`, `ResetPassword`, `VerifyEmail`
- lobbies
  - `Tables`, `Tournaments`
- workspaces
  - `Bots`, `BotProfile`, `TournamentDetail`, `Profile`, `Leaderboard`, `AdminAnalytics`
- gameplay
  - `GameView` and game components under `frontend/src/components/game`

## Storybook

Storybook is now intended to support the UI system, not just demo isolated examples.

Relevant stories include:

- `frontend/src/stories/WorkspacePrimitives.stories.tsx`
- card/chip stories already present in `frontend/src/stories`

When adding new reusable UI, add a story if the component is shared, visually rich, or behavior-heavy.

## Testing Expectations

Frontend tests should cover three layers:

1. routing and shell composition
2. primitives and interaction patterns
3. key page-level states and primary user flows

The frontend test setup lives in:

- `frontend/vitest.config.ts`
- `frontend/src/test/setup.ts`
- `frontend/src/test/test-utils.tsx`

Existing UI tests focus on:

- shell routing in `frontend/src/App.test.tsx`
- primitives in `frontend/src/components/ui/primitives.test.tsx`
- key redesigned pages like `Home`, `Tables`, `Tournaments`, and `Bots`

## Contribution Rules

When changing the FE:

- prefer `primitives.tsx` over custom one-off controls
- prefer shell-aware layout changes over page-local chrome
- update or add tests for new shared behavior
- add docs when shell structure, primitive contracts, or FE testing workflow changes
