# API Reference

## Overview

The Poker Platform API is a RESTful JSON API with WebSocket support for real-time updates.

**Base URL:** `/api/v1`

## Authentication

### JWT Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Rate Limiting

- Default: 100 requests per minute per IP
- WebSocket connections: 10 concurrent per user

## Endpoints

### Authentication

#### POST /auth/register

Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "name": "User Name",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbG...",
  "expiresIn": 86400,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "user"
  }
}
```

#### POST /auth/login

Authenticate an existing user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

#### GET /auth/me

Get current user info. Requires authentication.

---

### Bots

#### GET /bots

List all active bots. Public endpoint.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "MyBot",
    "description": "An intelligent poker bot",
    "active": true,
    "created_at": "2024-01-01T00:00:00Z",
    "strategy": {}
  }
]
```

#### GET /bots/my

List bots owned by current user. Requires authentication.

#### PUT /bots/:id

Update bot configuration. Requires ownership.

#### POST /bots/:id/activate

Re-activate a deactivated bot. Requires ownership (`operate:bots` scope).

**Response:** `{ "success": true }`

#### DELETE /bots/:id

Deactivate a bot. Requires ownership.

**Response:** `{ "success": true }`

#### POST /bots/:id/duplicate

Create a copy of an existing bot with all its strategy settings. The duplicated bot will have " (Copy)" appended to its name. Requires ownership and that the user hasn't exceeded their tier bot limit (**Free: 1 bot, Pro: 5 bots**).

**Response:** Created bot representation (same as POST /bots/internal)

#### GET /bots/active

Get all currently active bots (playing in games/tournaments). Public endpoint.

**Response:**
```json
{
  "bots": [
    {
      "botId": "uuid",
      "botName": "ActiveBot",
      "isActive": true,
      "currentGames": [{ "tableId": "uuid", "chips": 5000 }],
      "currentTournaments": [{ "tournamentId": "uuid", "chips": 8000 }]
    }
  ],
  "totalActive": 3,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### GET /bots/my/activity

Get activity for all user's bots. Requires authentication.

#### GET /bots/:id/activity

Get activity for a specific bot. Public endpoint.

#### GET /bots/:id/profile

Get detailed bot profile with stats.

---

### Bot Builder (Internal Bots)

Metadata and creation endpoints for no-code / rule-builder bots (`bot_type: internal`). Paths are under `/api/v1/bots/internal`.

#### GET /bots/internal/presets

List personality presets for the bot builder. Public endpoint (no JWT).

**Response:**
```json
{
  "presets": []
}
```

Each preset is a `PersonalityPreset` object. The API returns **8** presets: `shark`, `rock`, `maniac`, `calling_station`, `nit`, `balanced_pro`, `tricky`, `bully`.

#### GET /bots/internal/condition-fields

List condition field definitions for the rule builder. Public endpoint (no JWT).

**Response:**
```json
{
  "fields": []
}
```

The API returns **19** `ConditionFieldDef` entries describing fields usable in strategy rules.

#### POST /bots/internal

Create an internal bot with a JSON strategy document. Requires JWT and the **`operate:bots`** OAuth-style scope.

**Bot slot limits (enforced server-side):** Free plan = 1 bot, Pro plan (`subscription_status: 'active'`) = 5 bots. Returns `400` with message `"Your plan allows a maximum of N bot(s). Upgrade to Pro for up to 5 bots."` when the limit is reached.

**Rate limit:** 10 requests per hour per scope (Throttler default bucket).

**Request:**
```json
{
  "name": "MyInternalBot",
  "strategy": {},
  "description": "Optional description"
}
```

- `name` (string, required): 2–100 characters; letters, numbers, underscores, hyphens only.
- `strategy` (object, required): validated strategy JSON for the bot engine.
- `description` (string, optional): max 500 characters; must not contain angle brackets (HTML).

**Response:** Created bot representation (includes `strategy`).

#### POST /bots/internal/simulate

Simulate a bot action for a given strategy and scenario (What-If Simulator).
Requires JWT. Does not persist anything — purely stateless computation.

**Rate limit:** 30 requests per minute.

**Request:**
```json
{
  "strategy": {
    "version": 1,
    "tier": "quick",
    "personality": { "aggression": 70, "bluffFrequency": 30, "riskTolerance": 50, "tightness": 60 }
  },
  "scenario": {
    "stage": "pre-flop",
    "holeCards": ["As", "Ah"],
    "communityCards": [],
    "position": "UTG",
    "stackSize": 1000,
    "potSize": 15,
    "bigBlind": 10,
    "facingBet": false,
    "betAmount": 0,
    "playersInHand": 6
  }
}
```

**Response:**
```json
{
  "action": { "type": "raise", "amount": 31 },
  "source": "personality",
  "explanation": "Opening raise (aggression: 70%, hand quality: 95%)"
}
```

- `action.type`: one of `fold`, `check`, `call`, `raise`, `all_in`
- `source`: what triggered the decision — `personality`, `rule`, `range_chart`, or `position_override`
- `explanation`: human-readable reason for the action

---

### Bot Subscriptions (Auto-Registration)

#### GET /bots/:botId/subscriptions

List all auto-registration subscriptions for a bot. Requires bot ownership.

#### POST /bots/:botId/subscriptions

Create a new subscription. Requires bot ownership.

**Request:**
```json
{
  "tournament_id": "uuid",
  "tournament_type_filter": "rolling",
  "min_buy_in": 0,
  "max_buy_in": 1000,
  "priority": 50,
  "expires_at": "2024-12-31T23:59:59Z"
}
```

#### PUT /bots/:botId/subscriptions/:id

Update a subscription. Requires bot ownership.

#### DELETE /bots/:botId/subscriptions/:id

Delete a subscription. Requires bot ownership.

#### POST /bots/:botId/subscriptions/:id/pause

Pause a subscription. Requires bot ownership.

#### POST /bots/:botId/subscriptions/:id/resume

Resume a paused subscription. Requires bot ownership.

#### GET /bots/:botId/subscriptions/stats

Get subscription statistics for a bot. Requires bot ownership.

**Response:**
```json
{
  "total": 5,
  "active": 3,
  "paused": 1,
  "expired": 1,
  "total_successful_registrations": 42,
  "total_failed_registrations": 2
}
```

---

### Tournaments

#### GET /tournaments

List tournaments with optional status filter.

**Query Parameters:**
- `status`: registering, running, finished (optional)

#### GET /tournaments/:id

Get tournament details. If the tournament is currently running, includes live blind state.

**Response:**
```json
{
  "id": "uuid",
  "name": "Daily Freeroll",
  "type": "rolling",
  "status": "registering",
  "buyIn": 0,
  "startingChips": 10000,
  "minPlayers": 4,
  "maxPlayers": 18,
  "playersPerTable": 9,
  "turnTimeoutMs": 10000,
  "entriesCount": 5,
  "currentLevel": 3,
  "smallBlind": 50,
  "bigBlind": 100,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### GET /tournaments/:id/state

Get live tournament state including current blind level, hand progress, and table information. Public endpoint.

**Response (running tournament):**
```json
{
  "tournamentId": "uuid",
  "name": "Daily Freeroll",
  "status": "running",
  "level": 3,
  "handsThisLevel": 12,
  "handsPerLevel": 20,
  "blinds": {
    "small": 50,
    "big": 100,
    "ante": 10
  },
  "playersRemaining": 45,
  "totalEntrants": 100,
  "tables": [
    {
      "tableId": "table-uuid",
      "tableNumber": 1,
      "isFinalTable": false,
      "gameState": { }
    }
  ],
  "buyIn": 0,
  "prizePool": 5000
}
```

**Response (non-running tournament):**
```json
{
  "tournamentId": "uuid",
  "name": "Daily Freeroll",
  "status": "registering",
  "playersRemaining": 0,
  "totalEntrants": 5
}
```

#### POST /tournaments

Create a tournament. Admin only.

**Request:**
```json
{
  "name": "Weekly Championship",
  "type": "scheduled",
  "buyIn": 1000,
  "startingChips": 10000,
  "minPlayers": 8,
  "maxPlayers": 100,
  "playersPerTable": 9,
  "scheduledStartAt": "2024-01-15T18:00:00Z",
  "blindLevels": [
    { "level": 1, "smallBlind": 25, "bigBlind": 50, "ante": 0 },
    { "level": 2, "smallBlind": 50, "bigBlind": 100, "ante": 10 }
  ]
}
```

#### POST /tournaments/:id/register

Register a bot for the tournament.

**Request:**
```json
{
  "bot_id": "uuid"
}
```

#### DELETE /tournaments/:id/register/:botId

Unregister a bot.

#### GET /tournaments/:id/leaderboard

Get current tournament standings.

**Response:**
```json
[
  {
    "position": 1,
    "botId": "uuid",
    "botName": "LeaderBot",
    "chips": 25000,
    "busted": false
  }
]
```

#### GET /tournaments/:id/results

Get final tournament results (finished tournaments only).

---

### Admin Tournament Management

#### GET /tournaments/admin/scheduler

Get scheduler status. Admin only.

**Response:**
```json
{
  "enabled": true,
  "cronExpression": "*/30 * * * * *",
  "lastCheck": "2024-01-01T00:00:00Z",
  "nextCheck": "2024-01-01T00:00:30Z"
}
```

#### PATCH /tournaments/admin/scheduler

Update scheduler configuration. Admin only.

**Request:**
```json
{
  "enabled": true,
  "cronExpression": "*/60 * * * * *"
}
```

#### PATCH /tournaments/:id/schedule

Update tournament scheduled start time. Admin only.

**Request:**
```json
{
  "scheduled_start_at": "2024-01-15T18:00:00Z"
}
```

#### GET /tournaments/scheduled/upcoming

List upcoming scheduled tournaments.

---

### Games

#### GET /games/:id

Get game details.

#### GET /games/:id/hands

Get hand history for a game.

**Query Parameters:**
- `limit`: Number of hands (default: 50, max: 100)
- `offset`: Pagination offset

#### GET /games/hands/:handId

Get detailed hand information including all actions.

---

### Testing

#### POST /testing/run-simulation

Run automated poker game simulations to validate game invariants. Public endpoint (no auth required).

**Rate limit:** 30 requests per minute.

**Request:**
```json
{
  "gameCount": 10,
  "botCount": 6,
  "startingChips": 1000,
  "smallBlind": 10,
  "bigBlind": 20
}
```

- `gameCount` (number, required): Number of games to simulate
- `botCount` (number, required): Number of bots per game (2-9)
- `startingChips` (number, optional): Starting chips per bot (default: 1000)
- `smallBlind` (number, optional): Small blind amount (default: 10)
- `bigBlind` (number, optional): Big blind amount (default: 20)

**Response:**
```json
{
  "totalGames": 10,
  "successful": 10,
  "failed": 0,
  "bugsFound": 0,
  "bugsFile": "/path/to/POKER_BUGS.md",
  "coverage": {
    "allInWithSidePots": 5,
    "headsUp": 8,
    "splitPot": 2,
    "playerElimination": 15,
    "everyoneFoldsToBlind": 3,
    "showdown": 12
  },
  "duration": 45000
}
```

- `bugsFile`: Path to generated bug report (created at project root)
- `coverage`: Scenario coverage metrics from these games
- `duration`: Total execution time in milliseconds

Bugs are logged to `POKER_BUGS.md` at project root and appended across runs.

---

### Health

#### GET /health

Basic health check. Public endpoint.

**Response:**
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" }
  }
}
```

#### GET /health/ready

Kubernetes readiness probe. Checks database and Redis.

#### GET /health/live

Kubernetes liveness probe. Checks memory only.

#### GET /health/detailed

Detailed health check including disk space. Public endpoint.

---

### Analytics

#### GET /analytics/platform/stats

Get public platform statistics. Public endpoint.

**Response:**
```json
{
  "totalUsers": 1500,
  "totalBots": 350,
  "totalHandsPlayed": 125000,
  "totalTournaments": 420,
  "liveGames": 5,
  "activeBots": 12
}
```

#### GET /analytics/admin/stats

Get detailed admin statistics with history. Admin only.

**Query Parameters:**
- `days`: Number of days of history (default: 30)

**Response:**
```json
{
  "totalUsers": 1500,
  "totalBots": 350,
  "totalHandsPlayed": 125000,
  "topPerformers": [...],
  "metricsHistory": [...]
}
```

#### POST /analytics/events

Record frontend analytics event. Public endpoint (rate limited).

**Request:**
```json
{
  "event_type": "page_view",
  "session_id": "uuid",
  "page_url": "/tournaments",
  "event_data": { "referrer": "/home" }
}
```

#### POST /analytics/admin/trigger-summary

Manually trigger daily summary email. Admin only.

#### POST /analytics/admin/save-metrics

Force save daily metrics snapshot. Admin only.

#### GET /analytics/events/summary

Get event counts by type. Admin only.

#### GET /analytics/metrics/history

Get historical metrics for charts. Admin only.

---

## WebSocket API

### Connection

Connect to the WebSocket namespace:

```javascript
const socket = io("/game", {
  auth: { token: "jwt_token" }
});
```

### Events

#### Client → Server

**subscribe**
```json
{ "tableId": "uuid" }
```

**unsubscribe**
```json
{ "tableId": "uuid" }
```

**registerBot**
```json
{ "botId": "uuid" }
```

**action**
```json
{
  "gameId": "uuid",
  "action": "raise",
  "amount": 100
}
```

#### Server → Client

**gameState**

Full game state update:
```json
{
  "id": "uuid",
  "tableId": "uuid",
  "status": "running",
  "handNumber": 15,
  "stage": "flop",
  "pot": 1500,
  "communityCards": [
    { "rank": "A", "suit": "hearts" },
    { "rank": "K", "suit": "spades" },
    { "rank": "7", "suit": "diamonds" }
  ],
  "currentBet": 200,
  "currentPlayerId": "uuid",
  "dealerPosition": 3,
  "players": [...]
}
```

**privateState**

Bot-specific information:
```json
{
  "botId": "uuid",
  "holeCards": [
    { "rank": "A", "suit": "spades" },
    { "rank": "K", "suit": "hearts" }
  ],
  "validActions": [
    { "action": "fold" },
    { "action": "call" },
    { "action": "raise", "minAmount": 100, "maxAmount": 5000 }
  ]
}
```

**handResult**
```json
{
  "handNumber": 15,
  "winners": [
    {
      "botId": "uuid",
      "amount": 1500,
      "handName": "Two Pair"
    }
  ],
  "pot": 1500
}
```

**playerAction**
```json
{
  "botId": "uuid",
  "action": "raise",
  "amount": 200,
  "pot": 1500
}
```

**tournamentUpdate**
```json
{
  "type": "player_bust",
  "data": {
    "botId": "uuid",
    "position": 5,
    "prize": 0
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Description of the error",
  "error": "Bad Request",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/v1/endpoint"
}
```

### Common Status Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing/invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

---

## Support

### POST /contact

Submit a support ticket. No authentication required.

**Rate limit:** 3 requests per IP per hour.

**Request:**
```json
{
  "email": "user@example.com",
  "subject": "Issue with hand history",
  "message": "Detailed description of the issue (min 10 chars).",
  "handId": "optional-hand-uuid",
  "tournamentId": "optional-tournament-uuid"
}
```

**Response (201):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "open"
}
```

**Behavior:**
- Ticket is persisted to `support_tickets` table with `status = open`.
- Metadata (userAgent, referer URL, handId, tournamentId) is stored in a JSONB column for debugging.
- An admin notification email is sent to `SUPPORT_ADMIN_EMAIL` asynchronously (fire-and-forget). If the email fails with a 5xx SMTP error it retries up to 3 times with exponential backoff (1s/2s/4s). 4xx errors are logged without retry. Email failure never affects the HTTP response.
- If `handId` is provided, the admin email includes a link to `/api/v1/hands/{handId}`.

---

### Leaderboard

#### GET /leaderboard

Get the bot leaderboard with advanced poker metrics, filterable by strategy tier, time period, and sort order. **Public — no auth required.**

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `tier` | `QUICK \| MATRIX \| ELITE` | — | Filter by strategy tier |
| `period` | `daily \| weekly \| monthly \| all_time` | `all_time` | Time period for stats |
| `sortBy` | `bb100 \| roi` | `bb100` | Sort by BB/100 or ROI |
| `minGames` | number | `10` | Minimum hands played to appear |
| `limit` | number | `50` | Page size (max 100) |
| `offset` | number | `0` | Pagination offset |

**Response (200):**
```json
{
  "data": [
    {
      "botId": "uuid",
      "botName": "SharkBot",
      "userId": "uuid",
      "tierBadge": "TIER_3_ELITE",
      "bb100": 12.5,
      "itmPct": 22.3,
      "roiPct": 45.0,
      "totalHands": 5000,
      "totalTournaments": 50,
      "tournamentWins": 8,
      "totalNet": "150000",
      "totalPayout": "300000",
      "rank": 1
    }
  ],
  "total": 142,
  "limit": 50,
  "offset": 0,
  "lastRefreshedAt": "2026-04-04T12:00:00.000Z"
}
```

**Tier Badge Mapping:**
- `TIER_1_QUICK` — Quick tier (personality sliders only)
- `TIER_2_MATRIX` — Strategy tier (rules + range chart)
- `TIER_3_ELITE` — Pro tier (position overrides)

**Behavior:**
- `all_time` period reads from a materialized view (sub-millisecond). Other periods compute aggregates at query time filtered by `finished_at`.
- The materialized view refreshes every 15 minutes via a cron job.
- BB/100 = `SUM(net_chips) / SUM(big_blind) * 100` (standard poker win rate metric).
- ITM% = percentage of finished tournaments where finish position was in the top 15%.
- ROI% = `(total_payout - total_buy_in) / total_buy_in * 100`.

---

#### GET /leaderboard/:botId

Get detailed performance metrics for a specific bot, including hot streak and consistency index. **Public — no auth required.**

**Response (200):**
```json
{
  "botId": "uuid",
  "botName": "SharkBot",
  "tierBadge": "TIER_3_ELITE",
  "bb100": 12.5,
  "itmPct": 22.3,
  "roiPct": 45.0,
  "totalHands": 5000,
  "totalTournaments": 50,
  "tournamentWins": 8,
  "totalNet": "150000",
  "totalPayout": "300000",
  "hotStreak": [
    {
      "tournamentId": "uuid",
      "tournamentName": "Daily Master 2026-04-03",
      "finishPosition": 2,
      "maxPlayers": 45,
      "isItm": true,
      "finishedAt": "2026-04-03T22:30:00.000Z"
    }
  ],
  "consistencyIndex": 3.2
}
```

**Response (404):** Bot not found on leaderboard.

**Behavior:**
- `hotStreak` returns the last 5 finished tournament results with ITM status.
- `consistencyIndex` is the standard deviation of finish positions across all finished tournaments. Lower values indicate more consistent performance. Returns `null` if fewer than 2 tournaments played.
