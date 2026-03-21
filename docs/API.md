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

### API Key Authentication

For bot endpoints, API key authentication is also supported:

```
Authorization: Bearer <api_key>
```

## Rate Limiting

- Default: 100 requests per minute per IP
- Bot action endpoints: 1000 requests per minute
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

#### POST /auth/regenerate-api-key

Generate a new API key. Requires authentication.

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
    "endpoint": "https://mybot.example.com/action",
    "description": "An intelligent poker bot",
    "active": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

#### GET /bots/my

List bots owned by current user. Requires authentication.

#### POST /bots

Create a new bot. Requires authentication.

**Request:**
```json
{
  "name": "MyBot",
  "endpoint": "https://mybot.example.com/action",
  "description": "Optional description"
}
```

**Validation:**
- `name`: 2-100 characters, alphanumeric with underscores/hyphens
- `endpoint`: Valid public HTTP(S) URL (no internal IPs)

#### PUT /bots/:id

Update bot configuration. Requires ownership.

#### POST /bots/:id/validate

Test bot endpoint connectivity and response.

**Response:**
```json
{
  "valid": true,
  "score": 100,
  "details": {
    "reachable": true,
    "respondedCorrectly": true,
    "responseTimeMs": 150,
    "errors": []
  }
}
```

#### DELETE /bots/:id

Deactivate a bot. Requires ownership.

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

Get tournament details.

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
  "createdAt": "2024-01-01T00:00:00Z"
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

### Metrics

#### GET /metrics

Prometheus metrics endpoint. Public endpoint.

Returns Prometheus-formatted metrics for scraping.

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

## Bot Endpoint Specification

Your bot must implement an HTTP POST endpoint that responds to action requests.

### Request Format

```json
{
  "gameId": "uuid",
  "handNumber": 15,
  "stage": "flop",
  "you": {
    "name": "MyBot",
    "chips": 9500,
    "holeCards": ["Ah", "Kh"],
    "bet": 100,
    "position": "BTN",
    "bestHand": {
      "name": "High Card",
      "cards": ["Ah", "Kh", "Qd", "Jc", "9s"]
    }
  },
  "action": {
    "canCheck": false,
    "toCall": 100,
    "minRaise": 200,
    "maxRaise": 9400
  },
  "table": {
    "pot": 350,
    "currentBet": 200,
    "communityCards": ["Qd", "Jc", "9s"],
    "smallBlind": 50,
    "bigBlind": 100,
    "ante": 0
  },
  "players": [
    {
      "name": "Opponent1",
      "chips": 8000,
      "bet": 200,
      "folded": false,
      "allIn": false,
      "position": "SB"
    }
  ]
}
```

### Response Format

```json
{
  "type": "call"
}
```

Or with amount:
```json
{
  "type": "raise",
  "amount": 300
}
```

**Valid Actions:**
- `fold` - Forfeit the hand
- `check` - Pass (when toCall is 0)
- `call` - Match the current bet
- `raise` / `bet` - Increase the bet (requires `amount`)
- `all_in` - Bet entire stack

### Timeouts

- Default timeout: 10 seconds
- After 3 consecutive timeouts, the bot is disconnected
- Timeouts count as a fold

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
