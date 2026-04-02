# Tournament System - Architecture & Real-Time Updates

## Executive Summary

Two critical issues need to be addressed:

1. **Access Control** - Who can watch tournament games?
2. **Real-Time Updates** - Tournaments are dynamic; users need live state

This document provides architecture, implementation guide, and deployment strategy.

---

## ISSUE 1: ACCESS CONTROL FOR WATCHING GAMES

### Current State
- **Problem**: Any authenticated user can watch any game (no restrictions)
- **Impact**: Privacy/spoiler issue, unfair advantage for non-participants

### Solution: Role-Based Spectating

```
┌─────────────────────────────────────────┐
│ User wants to watch tournament game    │
└────────────────┬────────────────────────┘
                 │
         ┌───────┴───────┐
         │               │
    Is tournament    Is game
    game?          finished?
    │  │              │  │
    │  └─→ YES        │  └─→ YES
    │                 │
    NO              NO
    │                │
    │            Is user
    │          registered?
    │            │  │
    │            │  └─→ YES → ALLOW
    │            └─→ NO
    │
    └─→ ALLOW (non-tournament)
         │
         └─→ DENY with message
             "Only registered players can
              watch live tournament games"
```

### Implementation

**Frontend (TournamentDetailPage.tsx):**
```tsx
// Show watch button only if eligible
const canWatchLive = hasJoined  // User registered
const canWatchArchive = true     // Always can watch finished games

<button
  onClick={() => {
    if (canWatchLive || canWatchArchive) {
      navigate(`/games/${tableId}`)
    }
  }}
  disabled={!canWatchLive && !canWatchArchive}
  title={!canWatchLive ? 'Join tournament to watch live games' : ''}
>
  {canWatchLive ? 'Watch Live →' : 'Watch Replay (After Game Finishes)'}
</button>
```

**Backend (GamesController):**
```typescript
@Get('/:id')
async getGame(@Param('id') gameId: string, @Req() req: any) {
  const game = await this.gamesService.findOne(gameId)

  // Tournament game access control
  if (game.tournamentId) {
    const userId = req.user?.id
    const isAdmin = req.user?.role === 'admin'

    if (!isAdmin) {
      const isRegistered = await this.tournamentsService
        .isUserRegistered(game.tournamentId, userId)
      const isFinished = game.status === 'finished'

      if (!isRegistered && !isFinished) {
        throw new ForbiddenException('Only registered players can watch live games')
      }
    }
  }

  return game
}
```

### Access Rules
| Scenario | Permission | Reason |
|----------|-----------|--------|
| Non-tournament game | Allow | Open for all |
| Tournament game, user registered | Allow | Participant |
| Tournament game, not registered, live | Deny | Competitive integrity |
| Tournament game, not registered, finished | Allow | Public archive |
| Tournament game, is admin | Allow | Admin override |

---

## ISSUE 2: REAL-TIME TOURNAMENT UPDATES

### Current Problem

```
OLD APPROACH (POLLING):
┌─────────────────────────────────────────────────┐
│ TournamentDetailPage loads                       │
├─────────────────────────────────────────────────┤
│ fetch GET /tournaments/:id                       │
│ (User sees stale data until next refresh)       │
│                                                  │
│ Events happening in background:                 │
│ • Player joins tournament ❌ User doesn't see   │
│ • Blinds increase        ❌ User doesn't see    │
│ • Player busts out       ❌ User doesn't see    │
│ • Tournament progresses  ❌ User doesn't see    │
│                                                  │
│ (Only sees updates after manual refresh or     │
│  every 10 seconds if polling)                  │
└─────────────────────────────────────────────────┘
```

### New Solution: Socket.IO Real-Time

```
NEW APPROACH (WEBSOCKET):
┌──────────────────────────────────────────────────────┐
│ TournamentDetailPage connects to /tournament         │
├──────────────────────────────────────────────────────┤
│ WebSocket connection established (instant)           │
│ Subscribe to "tournament:123" room                   │
│                                                      │
│ Events happening - ALL BROADCAST IN REAL-TIME:      │
│ • Player joins tournament ✓ Auto-updated instantly  │
│ • Blinds increase        ✓ Auto-updated instantly  │
│ • Player busts out       ✓ Auto-updated instantly  │
│ • Tournament progresses  ✓ Auto-updated instantly  │
│                                                      │
│ UI shows:                                            │
│ 1. Connection status pill (🟢 Live)                │
│ 2. Real-time notification banner                   │
│ 3. Updated participant count                       │
│ 4. Player action log (joined/busted)               │
└──────────────────────────────────────────────────────┘
```

### Architecture Diagram

```
FRONTEND                          BACKEND
════════════════════════════════════════════════════════════════════

┌──────────────────────┐         ┌──────────────────────────────────┐
│  TournamentDetailPage│         │  TournamentsService              │
│  • Uses                    │         │ • joinTournament()            │
│    useTournamentSocket()   │         │ • advanceBlinds()             │
│  • Displays updates        │         │ • playerBustOut()             │
│  • Shows notifications     │         └─────────────┬────────────────┘
└──────────────┬─────────────┘                       │
               │                                     │
               │ WebSocket                          │ Broadcasts
               │ /tournament                         │
               │                                     │
        ┌──────▼──────────────────────┐     ┌─────────▼────────┐
        │  Socket.IO                   │     │ TournamentsGateway
        │  - subscribe_tournament      │────▶│  • Room: tournament:123
        │  - unsubscribe_tournament    │     │  • Emits state updates
        │  - refresh_tournament_state  │     │  • Emits notifications
        └─────────────────────────────┘     └─────────────────┘
                  │                                    │
                  │ Receives                           │
                  │ - tournament_state_updated        │
                  │ - tournament_player_action        │
                  │ - tournament_notification         │
                  │                                    │
        ┌─────────▼──────────────────────┐           │
        │  Real-Time Updates              │           │
        │  • Connection status            │           │
        │  • Tournament state (live count)│           │
        │  • Player actions log           │           │
        │  • Blind increase notifications │           │
        │  • Final table reached alerts   │           │
        └────────────────────────────────┘           │
                                                    │
                                          Calls when events occur:
                                          • broadcastTournamentStateUpdate()
                                          • broadcastPlayerAction()
                                          • broadcastNotification()
```

### Real-Time Events

#### 1. Tournament State Update
**When:** Participant count changes, status changes, level advances
**Sent:** Every time tournament state mutates
```typescript
{
  tournamentId: "123",
  status: "registering",
  registered_count: 32,
  current_participants: 32,
  current_level?: 3,
  hands_played?: 45,
  timestamp: "2026-04-01T12:00:00Z"
}
```

#### 2. Player Action
**When:** Player joins, busts out, advances
**Sent:** Immediately upon action
```typescript
{
  tournamentId: "123",
  playerId: "user-456",
  botId: "bot-789",
  botName: "AggressiveAI",
  userName: "Alice",
  action: "joined" | "busted" | "advanced_level",
  chipCount?: 5000,
  tableNumber?: 2,
  timestamp: "2026-04-01T12:00:15Z"
}
```

#### 3. Notification
**When:** Important milestones
**Sent:** On events like blind increase, final table reached
```typescript
{
  tournamentId: "123",
  type: "blind_increase" | "player_joined" | "player_busted" | "final_table_reached",
  message: "Blinds increased: 100/200",
  data: { level: 3, blinds: { small: 100, big: 200 } },
  timestamp: "2026-04-01T12:00:30Z"
}
```

### Frontend Hook: useTournamentSocket

**Location:** `frontend/src/hooks/useTournamentSocket.ts`

**Usage:**
```typescript
const { connectionStatus, latestUpdate, playerUpdates, notifications } = useTournamentSocket({
  tournamentId: id,
  enabled: !!id && !loading,
})

// Returns:
// - connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
// - latestUpdate: { registered_count, status, ... }
// - playerUpdates: Array of recent player actions
// - notifications: Array of milestone alerts
```

**Features:**
- Auto-reconnect on connection loss (up to 5 attempts)
- Exponential backoff for reconnection
- Automatic cleanup on unmount
- Type-safe event handling

---

## IMPLEMENTATION ROADMAP

### Phase 1: Access Control (1-2 hours)
Priority: **HIGH** - Needed immediately for privacy
```
1. Add isUserRegistered() to TournamentsService
2. Add access check to GamesController.getGame()
3. Update TournamentDetailPage to show proper buttons
4. Test access control flows
```

### Phase 2: Real-Time Updates (3-4 hours)
Priority: **CRITICAL** - Core feature for tournament experience
```
1. Create TournamentsGateway (Socket.IO)
2. Add broadcastTournamentStateUpdate() method
3. Add broadcastPlayerAction() method
4. Add broadcastNotification() method
5. Integrate gateway into TournamentsService
6. Update TournamentDetailPage to use useTournamentSocket
7. Test Socket.IO connections and broadcasts
8. Add connection status indicator UI
```

### Phase 3: Real-Time Particle Effects (optional, 1-2 hours)
Priority: **LOW** - UX enhancement
```
1. Add animations for player join/bust notifications
2. Add "new players joined" pulse effect
3. Add blind level increase toast animation
4. Smooth participant count transitions
```

---

## DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] Add TournamentsGateway to module providers
- [ ] Update service to call broadcast methods
- [ ] Add isUserRegistered() helper
- [ ] Test access control with multiple users
- [ ] Test Socket.IO with multiple concurrent connections
- [ ] Test reconnection behavior
- [ ] Test with Redis adapter (if multi-instance)

### Deployment Steps
```bash
# 1. Deploy backend code
npm run build
docker build -t botroyale:latest .
docker push botroyale:latest

# 2. Restart backend services
kubectl rollout restart deployment/botroyale-api

# 3. Verify Socket.IO connection
curl http://localhost:3000/socket.io/?transport=websocket

# 4. Test tournament updates
# (See testing section below)

# 5. Monitor logs for connection errors
kubectl logs -f deployment/botroyale-api
```

### Rollback Plan
If issues occur:
```bash
# Revert to previous version
kubectl rollout undo deployment/botroyale-api

# Frontend will still work but show:
# - Stale tournament data
# - No real-time updates
# - "Connection lost" message
```

---

## MONITORING & ALERTS

### Metrics to Track
```typescript
// Number of active tournament subscriptions
tournamentsGateway.connectedClients.size

// WebSocket connection failures
prometheus.counter('tournament_socket_connection_errors_total')

// Broadcast latency
prometheus.histogram('tournament_broadcast_latency_ms')

// Message queue depth
prometheus.gauge('tournament_broadcast_queue_depth')
```

### Sample Prometheus Alerts
```yaml
- alert: TournamentSocketErrors
  expr: rate(tournament_socket_errors_total[5m]) > 0.1
  for: 5m
  annotations:
    summary: "High tournament socket error rate"

- alert: TournamentBroadcastLatency
  expr: histogram_quantile(0.99, tournament_broadcast_latency_ms) > 1000
  for: 5m
  annotations:
    summary: "Tournament broadcasts taking >1s (p99)"
```

---

## TESTING GUIDE

### Manual Testing

**Test 1: Access Control**
```typescript
// As non-registered user, try to watch live game:
const response = await fetch('http://localhost:3000/api/v1/games/game-123')
// Expected: 403 Forbidden

// After registering in tournament, same request:
// Expected: 200 OK

// After game finishes:
// Expected: 200 OK (even if not registered)
```

**Test 2: Real-Time Updates**
```bash
# Terminal 1: Start tournament watching
curl -N 'http://localhost:3000/api/v1/tournaments/tourn-123' \
  -H "Authorization: Bearer $TOKEN" | jq '.registered_count'

# Terminal 2: Join tournament in browser
# → Check Terminal 1 - should see count update in <1s

# Terminal 3: Monitor Socket.IO traffic
wscat -c 'ws://localhost:3000/tournament' \
  -H "Authorization: Bearer $TOKEN"
# → Should see tournament:state_updated events
```

**Test 3: Connection Recovery**
```typescript
// Open DevTools Network tab
// Kill backend server
// → Observe "Connecting..." status in UI
// Restart backend
// → Observe "Connected" status appears automatically
```

### Automated Testing

```typescript
// Test file: src/modules/tournaments/tournaments.gateway.spec.ts
describe('TournamentsGateway', () => {
  it('should broadcast state updates to all subscribers', async () => {
    const gateway = new TournamentsGateway(...)
    const mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) }
    gateway.server = mockServer

    gateway.broadcastTournamentStateUpdate('tourn-123', { registered_count: 5 })

    expect(mockServer.to).toHaveBeenCalledWith('tournament:tourn-123')
    expect(mockServer.to().emit).toHaveBeenCalledWith('tournament_state_updated', expect.objectContaining({
      tournamentId: 'tourn-123',
      registered_count: 5,
    }))
  })

  it('should only send updates to subscribed clients', async () => {
    // ...
  })

  it('should handle reconnection gracefully', async () => {
    // ...
  })
})
```

---

## TROUBLESHOOTING

### Issue: "Connection refused" errors
**Cause:** Socket.IO gateway not listening
**Fix:**
```typescript
// Verify in main.ts
const io = new IoAdapter(app)
app.useWebSocketAdapter(io)
```

### Issue: Updates not appearing
**Cause:** Service not calling broadcast methods
**Fix:** Add console.log in broadcastTournamentStateUpdate() to verify it's called

### Issue: Memory leak with many subscriptions
**Cause:** Not properly unsubscribing from rooms
**Fix:** Ensure handleDisconnect() calls client.leave()

### Issue: Real-time working for 1 user but not 2+
**Cause:** Redis adapter not configured for multi-instance
**Fix:** Set up Redis adapter in Socket.IO configuration

---

## PERFORMANCE OPTIMIZATION

### Bandwidth Usage
- **State update:** ~150 bytes per broadcast
- **Player action:** ~200 bytes per broadcast
- **Typical tournament:** 100 broadcasts/hour = ~5 KB/hour per client

### Scaling Considerations
| Users | Recommendations |
|-------|-----------------|
| < 100 | Single instance, no Redis needed |
| 100-500 | Multi-instance with Redis adapter |
| 500+ | Dedicated Socket.IO cluster + message queue |

### Recommended Redis Adapter Setup
```typescript
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'

const pubClient = createClient({ host: 'redis', port: 6379 })
const subClient = pubClient.duplicate()

const io = new Server(server, {
  adapter: createAdapter(pubClient, subClient),
})
```

---

## FUTURE ENHANCEMENTS

1. **Delayed Spectating** - Archive games visible after 10min delay
2. **Tournament Chat** - Live chat in tournament rooms
3. **Personal Notifications** - "Your bot advanced!" alerts
4. **Heatmaps** - Real-time visualizations of tournament progress
5. **Replay System** - Instant replays of important hands
6. **Commentary Feed** - Admin/commentator annotations during tournament

---

## SUMMARY

| Aspect | Old Way | New Way |
|--------|---------|---------|
| **Participant Updates** | Manual refresh | Real-time via WebSocket |
| **Blind Increases** | Unseen until page refresh | Instant notification |
| **Player Actions** | Polling every 10s | <100ms via WebSocket |
| **Spectator Access** | Anyone can watch | Only registered + finished |
| **User Experience** | Static, stale | Dynamic, live |
| **Architecture** | REST polling | REST + WebSocket hybrid |

The new real-time system transforms tournament spectating from a static polling experience into a **live, engaging viewing experience** similar to professional poker broadcasts.
