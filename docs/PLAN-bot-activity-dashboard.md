# Feature Plan: Bot Activity Dashboard & Auto-Registration

**STATUS: IMPLEMENTED** (March 2026)

> This feature has been fully implemented. See the implementation notes at the end of this document.

---

## Problem Statement

A developer builds a poker bot. The bot joins a cash table or tournament at 8 PM. The developer opens the UI at 8 PM and has **no way to know**:

- Is my bot currently playing?
- Which table/tournament is it at?
- How is it doing right now?

Additionally, bots that want to play regularly (e.g. "join every evening tournament") must implement their own scheduling logic externally, which is friction we can remove.

---

## Two Features

This plan covers two complementary features:

| # | Feature | What it solves |
|---|---------|----------------|
| **A** | Bot Activity Dashboard | "Where is my bot right now?" |
| **B** | Auto-Registration (subscriptions) | "Keep my bot playing without me babysitting it" |

---

## Feature A: Bot Activity Dashboard

### Goal

When a developer opens the UI, they can instantly see which of their bots are in active games and jump straight to watching them.

### UX Design

#### A1. Global "Live" indicator in the navbar

When any of the user's bots are actively playing, show a pulsing indicator in the top navigation bar:

```
Home | Tables | Tournaments | Bots | Leaderboard | 🔴 2 Live | DevUser | Logout
```

- The "2 Live" badge shows how many of the user's bots are currently in active games.
- Clicking it opens a dropdown/popover listing each active bot with a "Watch" link.
- If no bots are active, the indicator is hidden.

#### A2. Bot Activity Panel on the Bots page (`/bots`)

At the top of the "My Bots" page, add an **"Active Now"** section:

```
┌─────────────────────────────────────────────────────┐
│  🟢 Active Now                                      │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │ MyBot-v3             │  │ AggressiveAI         │ │
│  │ 📍 Tournament: "Nigh │  │ 📍 Cash Table: "Tab  │ │
│  │ 💰 Chips: 15,200     │  │ 💰 Chips: 980        │ │
│  │ 🃏 Hand #47          │  │ 🃏 Hand #12          │ │
│  │       [Watch Live]   │  │       [Watch Live]   │ │
│  └──────────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

- Each card shows: bot name, game type (cash/tournament), table name, current chip count, current hand number.
- "Watch Live" links to `/game/:tableId` for that bot's table.
- Cards update in real-time via WebSocket.

#### A3. Bot Profile Page (`/bots/:id`)

Create a new dedicated bot detail page (the API `GET /api/v1/bots/:id/profile` already exists but has no frontend page):

- **Header**: bot name, endpoint, status, created date
- **Live Status**: if currently in a game, show a prominent banner with "Watch Live" link
- **Stats**: hands played, win rate, tournaments played, net profit (from `BotStats`)
- **Recent Games**: list of recent tournament results and cash game sessions
- **Activity Timeline**: visual timeline of when the bot played (daily/weekly activity chart)

### Backend Changes

#### A4. New API endpoint: `GET /api/v1/bots/:id/activity`

Returns the bot's current active games/tournaments:

```json
{
  "bot_id": "abc-123",
  "active_games": [
    {
      "type": "tournament",
      "game_id": "game-456",
      "table_id": "table-789",
      "tournament_id": "tourn-012",
      "tournament_name": "Nightly Championship",
      "chips": 15200,
      "status": "running",
      "hand_number": 47,
      "position": 3,
      "players_remaining": 12,
      "started_at": "2026-03-20T20:00:00Z"
    }
  ]
}
```

**Implementation**: Query `game_players` joined with `games` where `games.status IN ('waiting', 'active', 'running')`, filtered by `bot_id`.

#### A5. New API endpoint: `GET /api/v1/bots/my/activity`

Batch version: returns active games for ALL of the user's bots in one call. The navbar indicator and the "Active Now" panel both call this single endpoint.

```json
{
  "active_bots": [
    {
      "bot_id": "abc-123",
      "bot_name": "MyBot-v3",
      "games": [{ ... }]
    }
  ],
  "total_active": 2
}
```

#### A6. WebSocket enhancement: bot activity channel

Add a new WebSocket event so the frontend can get live updates without polling:

- **Client sends**: `subscribeBotActivity` with `{ botIds: [...] }`
- **Server emits**: `botActivityUpdate` whenever any of those bots' game state changes (joins game, hand starts, hand finishes, game ends)

This keeps the navbar badge and the "Active Now" panel live without polling.

### Frontend Changes

| Change | File(s) | Description |
|--------|---------|-------------|
| Navbar live badge | `Layout.tsx` (new component) | Poll `/bots/my/activity` on mount, then subscribe via WebSocket |
| Active Now panel | `Bots.tsx` | New section at top of My Bots page |
| Bot Profile page | New `BotProfile.tsx` | Route `/bots/:id`, uses existing profile API + new activity API |
| Router update | `App.tsx` | Add `/bots/:id` route |

---

## Feature B: Auto-Registration (Bot Subscriptions)

### Goal

A developer can tell the platform: "Keep my bot registered for every new tournament matching these criteria" — instead of writing their own cron job.

### UX Design

#### B1. Subscription settings on the Bot management card

Each bot card in "My Bots" gets a new "Auto-Register" toggle/section:

```
┌──────────────────────────────────────┐
│ MyBot-v3                        🟢   │
│ http://myserver.com:3002/action      │
│                                      │
│ ⚙️ Auto-Registration         [ON]   │
│  ├── Tournament types: Rolling, Scheduled  │
│  ├── Max buy-in: 10,000             │
│  ├── Max concurrent: 3              │
│  └── Active hours: 18:00 - 23:00    │
│                                      │
│ [Validate] [Edit] [Deactivate]       │
└──────────────────────────────────────┘
```

#### B2. Subscription configuration modal

When enabling Auto-Registration, a modal lets the user configure:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Tournament types | Multi-select | All | Which tournament types to auto-register for |
| Max buy-in | Number | Unlimited | Don't register if buy-in exceeds this |
| Min buy-in | Number | 0 | Don't register if buy-in is below this |
| Max concurrent tournaments | Number | 3 | Don't register if bot is already in N active tournaments |
| Active schedule | Time range | Always | Only auto-register during these hours (user's timezone) |
| Auto-join cash tables | Boolean | No | Also automatically join open cash tables |
| Preferred table size | Number range | 2-9 | Only join tables within this player range |

### Backend Changes

#### B3. New entity: `BotSubscription`

```typescript
@Entity("bot_subscriptions")
export class BotSubscription extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({ type: "boolean", default: true })
  enabled: boolean;

  @Column({ type: "jsonb" })
  config: {
    tournament_types: ("rolling" | "scheduled")[];
    max_buy_in: number | null;
    min_buy_in: number;
    max_concurrent: number;
    schedule: {
      enabled: boolean;
      start_hour: number;  // 0-23, in UTC
      end_hour: number;    // 0-23, in UTC
      timezone: string;    // e.g. "America/New_York"
    } | null;
    auto_join_cash: boolean;
    preferred_table_size: { min: number; max: number } | null;
  };

  @Column({ type: "integer", default: 0 })
  total_auto_registrations: number;

  @Column({ type: "timestamp with time zone", nullable: true })
  last_auto_registration_at: Date | null;
}
```

#### B4. New API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/bots/:id/subscription` | Get subscription config |
| `PUT` | `/api/v1/bots/:id/subscription` | Create/update subscription |
| `DELETE` | `/api/v1/bots/:id/subscription` | Disable auto-registration |

#### B5. Auto-registration service

New `BotAutoRegistrationService`:

- **Triggered by**: event listener on `tournament.created` (from EventEmitter)
- **Logic**:
  1. When a new tournament is created (status = `registering`), query all active subscriptions.
  2. For each matching subscription, check:
     - Tournament type matches filter?
     - Buy-in within range?
     - Bot not already at `max_concurrent` active tournaments?
     - Current time within schedule window?
     - Bot is active and healthy?
  3. If all checks pass, register the bot for the tournament.
  4. Emit a `bot.auto_registered` event for audit logging.

- **Also listens to**: `tournament.registering` (for late registration window) so bots can join tournaments that were created before the bot's subscription was enabled.

#### B6. Cash table auto-join service (optional, phase 2)

Similar logic but for cash tables:
- When a new table is created or has open seats, check subscriptions with `auto_join_cash: true`.
- Rate-limit to avoid overwhelming: at most one auto-join per bot per 5 minutes.

### Frontend Changes

| Change | File(s) | Description |
|--------|---------|-------------|
| Auto-Registration toggle | `Bots.tsx` | Toggle + "Configure" button on each bot card |
| Subscription config modal | New `AutoRegisterModal.tsx` | Form for subscription settings |
| Activity log | `BotProfile.tsx` | Show auto-registration history ("auto-registered for Tournament X at 8:00 PM") |
| New API calls | `bots.ts` | `getSubscription`, `updateSubscription`, `deleteSubscription` |

---

## Implementation Plan

### Phase 1: Bot Activity Dashboard (Feature A)

Addresses the core UX problem: "Where is my bot?"

| Step | Component | Work |
|------|-----------|------|
| 1.1 | Backend | Add `GET /api/v1/bots/:id/activity` endpoint |
| 1.2 | Backend | Add `GET /api/v1/bots/my/activity` endpoint |
| 1.3 | Backend | Add `botActivityUpdate` WebSocket event |
| 1.4 | Frontend | Create `BotProfile.tsx` page + route |
| 1.5 | Frontend | Add "Active Now" panel to `Bots.tsx` |
| 1.6 | Frontend | Add navbar live badge component |
| 1.7 | Tests | Unit tests for activity queries, integration test for WebSocket event |

### Phase 2: Auto-Registration (Feature B)

Removes the need for external scheduling by bot developers.

| Step | Component | Work |
|------|-----------|------|
| 2.1 | Backend | Create `BotSubscription` entity + migration |
| 2.2 | Backend | Add subscription CRUD endpoints |
| 2.3 | Backend | Create `BotAutoRegistrationService` with event listeners |
| 2.4 | Frontend | Auto-Registration toggle + config modal |
| 2.5 | Frontend | Show auto-registration history in bot profile |
| 2.6 | Tests | Unit tests for subscription matching logic, integration test for auto-registration flow |

### Phase 3: Polish & Extensions

| Step | Work |
|------|------|
| 3.1 | Cash table auto-join service |
| 3.2 | Email/webhook notifications when bot is auto-registered |
| 3.3 | Activity timeline chart on bot profile |
| 3.4 | Mobile-responsive "Active Now" panel |

---

## Database Changes Summary

| Table | Type | Phase |
|-------|------|-------|
| `bot_subscriptions` | New table | Phase 2 |

No new tables needed for Phase 1 — all activity data comes from existing `games`, `game_players`, `tournaments`, `tournament_entries`, and `tournament_seats` tables via joins.

---

## API Changes Summary

| Phase | Method | Endpoint | Description |
|-------|--------|----------|-------------|
| 1 | `GET` | `/api/v1/bots/:id/activity` | Bot's current active games |
| 1 | `GET` | `/api/v1/bots/my/activity` | All user's bots' active games |
| 1 | WS | `subscribeBotActivity` / `botActivityUpdate` | Real-time bot activity updates |
| 2 | `GET` | `/api/v1/bots/:id/subscription` | Get auto-registration config |
| 2 | `PUT` | `/api/v1/bots/:id/subscription` | Set auto-registration config |
| 2 | `DELETE` | `/api/v1/bots/:id/subscription` | Disable auto-registration |

---

## Open Questions

1. **Rate limiting on auto-registration**: Should we limit how many tournaments a bot can auto-register for per day? (Prevents runaway costs if someone sets max_buy_in too high.)
2. **Health check before auto-join**: Should we verify the bot endpoint is healthy before auto-registering? (Prevents dead bots from occupying tournament slots.)
3. **Notification preferences**: Should auto-registration events trigger email notifications? WebSocket push? Both?
4. **Cash table auto-join priority**: If multiple bots want to auto-join the same table, should we use a queue/lottery system?

---

## Implementation Notes (March 2026)

### What Was Implemented

**Phase 1 (Bot Activity Dashboard) - COMPLETE:**
- `BotActivityService` for real-time activity tracking
- API endpoints: `GET /bots/:id/activity`, `GET /bots/my/activity`, `GET /bots/active`
- WebSocket events: `subscribeBotActivity`, `subscribeActiveBots`, `botActivity`, `activeBots`
- Frontend `BotProfile.tsx` page with live activity display
- "Active Now" panel on Bots page showing currently playing bots
- Navbar live badge showing count of active bots
- Unit tests for activity service

**Phase 2 (Auto-Registration) - COMPLETE:**
- `BotSubscription` entity with migration (`1710864003000-AddBotSubscriptions.ts`)
- `BotSubscriptionRepository` with matching logic
- Subscription CRUD endpoints: `GET/POST/PUT/DELETE /bots/:botId/subscriptions`
- Pause/resume endpoints: `POST /bots/:botId/subscriptions/:id/pause|resume`
- `BotAutoRegistrationService` with:
  - Event-driven registration on `tournament.created` and `tournament.statusChanged`
  - Scheduled background processing every minute
  - Automatic cleanup of expired subscriptions
  - Priority-based processing
  - One bot per user per tournament enforcement
- Frontend subscription management UI in BotProfile page
- Unit tests for auto-registration service and subscriptions controller

**Phase 3 - NOT YET IMPLEMENTED:**
- Cash table auto-join
- Email/webhook notifications
- Activity timeline chart
- Mobile optimization

### Key Files Added/Modified

**New Services:**
- `src/services/bot-activity.service.ts`
- `src/services/bot-auto-registration.service.ts`

**New Entity:**
- `src/entities/bot-subscription.entity.ts`

**New Repository:**
- `src/repositories/bot-subscription.repository.ts`

**New Controllers:**
- `src/modules/bots/subscriptions.controller.ts`

**New Frontend Pages:**
- `frontend/src/pages/BotProfile.tsx`

**Modified Files:**
- `src/modules/bots/bots.controller.ts` - Added activity endpoints
- `src/modules/bots/bots.module.ts` - Added subscription components
- `src/modules/games/games.gateway.ts` - Added activity WebSocket events
- `src/services/services.module.ts` - Added new services
- `frontend/src/pages/Bots.tsx` - Added Active Now panel
- `frontend/src/components/layout/Layout.tsx` - Added navbar badge
- `frontend/src/api/bots.ts` - Added activity and subscription API methods
- `frontend/src/types/index.ts` - Added activity and subscription types

**New Tests:**
- `tests/unit/services/bot-activity.service.spec.ts`
- `tests/unit/services/bot-auto-registration.service.spec.ts`
- `tests/unit/modules/subscriptions.controller.spec.ts`
- Updated `tests/unit/modules/bots.controller.spec.ts`
