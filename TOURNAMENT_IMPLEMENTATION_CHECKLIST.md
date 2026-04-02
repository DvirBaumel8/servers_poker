# Tournament Real-Time Updates - Implementation Checklist

## Quick Start Guide

Choose your priority level:

- **ASAP (High Risk)**: Start with **Phase 1: Access Control**
- **Next Sprint**: Add **Phase 2: Real-Time Updates**
- **Quality Polish**: Add **Phase 3: UI Animations**

---

## PHASE 1: ACCESS CONTROL (1-2 hours) ⭐ START HERE

### Backend Changes
- [ ] Add method to `TournamentsService`:
  ```typescript
  async isUserRegistered(tournamentId: string, userId: string): Promise<boolean>
  ```
  See: `TOURNAMENT_REALTIME_BACKEND.md` - Section 4

- [ ] Update `GamesController.getGame()` with access check:
  ```typescript
  if (game.tournamentId && !isUserRegistered && !isFinished) {
    throw new ForbiddenException(...)
  }
  ```
  See: `TOURNAMENT_REALTIME_BACKEND.md` - Section 4

### Frontend Changes
- [ ] In `TournamentDetailPage.tsx`, add logic to show/hide watch button:
  ```typescript
  const canWatchLive = hasJoined
  const isGameFinished = game?.status === 'finished'

  <button disabled={!canWatchLive && !isGameFinished}>
    {canWatchLive ? 'Watch Live' : 'Watch Replay'}
  </button>
  ```

### Testing
```bash
# Test 1: Non-registered user tries to watch
# Expected: 403 Forbidden

# Test 2: Registered user watches
# Expected: 200 OK

# Test 3: Non-registered watches finished game
# Expected: 200 OK
```

**Status**: ❌ NOT STARTED | 🟡 IN PROGRESS | ✅ DONE

---

## PHASE 2: REAL-TIME UPDATES (3-4 hours) ⭐⭐ CORE FEATURE

### Files to Create
- [ ] `src/modules/tournaments/tournaments.gateway.ts`
  - Create new file with TournamentsGateway class
  - See: `TOURNAMENT_REALTIME_BACKEND.md` - Section 1
  - Copy-paste ready code provided

- [ ] Already created: `frontend/src/hooks/useTournamentSocket.ts`
  - ✅ Frontend hook already implemented
  - Type-safe Socket.IO connection

- [ ] Already updated: `frontend/src/pages/TournamentDetailPage.tsx`
  - ✅ Already imports and uses useTournamentSocket
  - ✅ Already displays real-time notifications
  - ✅ Already shows connection status

### Backend Implementation
- [ ] Copy `TournamentsGateway` code to new file

- [ ] Update `TournamentsModule` to provide gateway:
  ```typescript
  @Module({
    providers: [TournamentsService, TournamentsGateway],
    exports: [TournamentsService, TournamentsGateway],
  })
  ```

- [ ] Inject gateway into `TournamentsService`:
  ```typescript
  constructor(
    // ... existing
    private tournamentsGateway: TournamentsGateway,
  ) {}
  ```

- [ ] Call broadcast methods in `TournamentsService`:
  ```typescript
  // In joinTournament()
  this.tournamentsGateway.broadcastPlayerAction(...)
  this.tournamentsGateway.broadcastTournamentStateUpdate(...)
  ```

### Emission Points (Call broadcasts when):
- [ ] Player joins tournament → `broadcastPlayerAction('joined', ...)`
- [ ] Blind level increases → `broadcastNotification('blind_increase', ...)`
- [ ] Player busts out → `broadcastPlayerAction('busted', ...)`
- [ ] Tournament reaches final table → `broadcastNotification('final_table_reached', ...)`
- [ ] Tournament status changes → `broadcastTournamentStateUpdate(...)`

### Testing
```typescript
// Browser console test:
const socket = io('http://localhost:3000/tournament', {
  auth: { token: YOUR_TOKEN }
})
socket.on('connect', () => {
  socket.emit('subscribe_tournament', { tournamentId: 'ID' })
})
socket.on('tournament_state_updated', console.log)
socket.on('tournament_player_action', console.log)
```

**Status**: ❌ NOT STARTED | 🟡 IN PROGRESS | ✅ DONE

---

## PHASE 3: UI POLISH (1-2 hours) OPTIONAL

### Frontend Animations
- [ ] Add slide-in animation for notifications (already in CSS)
- [ ] Add pulse effect for "X players joined" updates
- [ ] Add smooth count transitions (CSS transition)
- [ ] Add connection status pulse animation

**Status**: ❌ NOT STARTED | 🟡 IN PROGRESS | ✅ DONE

---

## INTEGRATION CHECKLIST

### Before Going to Production
- [ ] All TournamentsGateway methods have JSDoc comments
- [ ] Access control tested with multiple user accounts
- [ ] Socket.IO reconnection tested (kill backend, verify auto-reconnect)
- [ ] No console errors in browser
- [ ] No errors in backend logs
- [ ] Tournament state stays consistent during updates
- [ ] No memory leaks (check DevTools memory over 5 min)

### Deployment
- [ ] Code reviewed by team
- [ ] Tests passing (if applicable)
- [ ] No breaking changes
- [ ] Backwards compatible with existing games
- [ ] Documentation updated

---

## FILE REFERENCE GUIDE

### Created Files
| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/hooks/useTournamentSocket.ts` | WebSocket hook | ✅ Done |
| `frontend/src/pages/TournamentDetailPage.tsx` | Updated to use real-time | ✅ Done |
| `TOURNAMENT_REALTIME_BACKEND.md` | Backend implementation guide | ✅ Done |
| `TOURNAMENT_ARCHITECTURE.md` | Full architecture doc | ✅ Done |

### Files to Create/Update
| File | Required Changes | Phase |
|------|------------------|-------|
| `src/modules/tournaments/tournaments.gateway.ts` | CREATE NEW | Phase 2 |
| `src/modules/tournaments/tournaments.module.ts` | Add gateway provider | Phase 2 |
| `src/modules/tournaments/tournaments.service.ts` | Add broadcasts | Phase 2 |
| `src/modules/games/games.controller.ts` | Add access check | Phase 1 |

---

## QUICK COMMAND REFERENCE

### Check Socket.IO is working
```bash
curl -i http://localhost:3000/socket.io/?transport=websocket
# Should return: HTTP/1.1 200 OK
```

### Monitor backend logs
```bash
npm run dev  # Watch for [TournamentsGateway] messages
```

### Test via curl (basic check)
```bash
# Frontend should be able to fetch game without errors
curl http://localhost:3000/api/v1/games/GAME_ID \
  -H "Authorization: Bearer TOKEN"
```

---

## COMMON ISSUES & QUICK FIXES

### "Cannot find TournamentsGateway"
**Fix:** Add to TournamentsModule providers:
```typescript
providers: [TournamentsService, TournamentsGateway],
```

### "subscription not working"
**Fix:** Check socket emit name matches:
```typescript
socket.emit('subscribe_tournament', { tournamentId })  // exact match
```

### "High memory usage with many tournament subscribers"
**Fix:** Verify unsubscribe is called:
```typescript
socket.on('disconnect', () => {
  socket.leave(`tournament:${tournamentId}`)
})
```

### "Updates not showing in UI"
**Fix:** Verify state update handler:
```typescript
useEffect(() => {
  if (latestUpdate?.tournamentId === id) {
    setTournament(prev => ({ ...prev, ...latestUpdate }))
  }
}, [latestUpdate])
```

---

## SUCCESS CRITERIA

### Phase 1: Access Control ✅
- [ ] Non-registered users cannot watch live games
- [ ] Registered users can watch their own tournament
- [ ] Finished games are public
- [ ] Error message is user-friendly

### Phase 2: Real-Time Updates ✅
- [ ] Tournament count updates within 100ms
- [ ] Notifications appear without page refresh
- [ ] Connection indicator shows status
- [ ] Auto-reconnect on disconnect
- [ ] No console errors

### Phase 3: Polish ✅
- [ ] Animations are smooth (60fps)
- [ ] No layout shifts
- [ ] Professional appearance

---

## TIME ESTIMATE

| Phase | Duration | Difficulty | Priority |
|-------|----------|------------|----------|
| Phase 1 | 1-2 hrs | Easy | 🔴 Critical |
| Phase 2 | 3-4 hrs | Medium | 🔴 Critical |
| Phase 3 | 1-2 hrs | Easy | 🟡 Nice-to-have |
| **Total** | **5-8 hrs** | **Medium** | - |

---

## SUPPORT & REFERENCE

Full documentation:
- **Architecture & Design**: `TOURNAMENT_ARCHITECTURE.md`
- **Backend Implementation**: `TOURNAMENT_REALTIME_BACKEND.md`
- **Frontend Hook**: `frontend/src/hooks/useTournamentSocket.ts`

Code examples:
- See `TOURNAMENT_REALTIME_BACKEND.md` for copy-paste ready code
- See `TOURNAMENT_ARCHITECTURE.md` for diagrams and flow charts

Questions?
- Check TOURNAMENT_REALTIME_BACKEND.md Section 9 (Troubleshooting)
- Check TOURNAMENT_ARCHITECTURE.md Section "TROUBLESHOOTING"

---

## SIGN-OFF TEMPLATE

When complete, update this section:

```markdown
## COMPLETION SIGN-OFF

Completed by: [Name]
Date: [Date]
All tests: [PASS/FAIL]
Deployed to: [Environment]
Notes: [Any issues encountered]
```

---

**Last Updated**: 2026-04-01
**Status**: Ready for Implementation
