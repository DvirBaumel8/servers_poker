# Monster Army Architecture

## The Integration Pyramid

Bugs hide in the **seams** between systems. A chip calculation might work perfectly in isolation, but fail when combined with WebSocket updates, UI rendering, and database persistence. 

Our monster army is organized in **layers of integration**:

```
                              ▲
                             /│\
                            / │ \
     Layer 4:              /  │  \         FULL SYSTEM
     E2E Monster          /   │   \        Complete user journeys
     (runs weekly)       /────┼────\       across ALL systems
                        /     │     \
     Layer 3:          /      │      \     FLOW MONSTERS
     Integration      /       │       \    Multi-system flows
     (runs nightly)  /────────┼────────\   API→DB→WS→UI
                    /         │         \
     Layer 2:      /          │          \ CONNECTOR MONSTERS
     Connectors   /           │           \API↔DB, API↔WS, WS↔UI
     (runs on PR) /────────────┼────────────\
                 /             │             \
     Layer 1:   /              │              \ UNIT MONSTERS
     Unit      /               │               \API, Visual, Invariant
     (runs on every commit)    │                \
              ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
```

## Layer 1: Unit Monsters (Fast, Focused)

Test single systems in isolation. Run on **every commit**.

| Monster | System | What it tests |
|---------|--------|---------------|
| **API Monster** | Backend API | Endpoints, contracts, auth |
| **Visual Monster** | Frontend UI | Viewports, overflow, console |
| **Invariant Monster** | Game Logic | Poker rules, money, cards |
| **Guardian Monster** | Security | XSS, injection, a11y |

**Runtime:** ~30 seconds each

---

## Layer 2: Connector Monsters (Integration Points)

Test **two systems working together**. Run on **every PR**.

| Monster | Systems | What it tests |
|---------|---------|---------------|
| **API-DB Connector** | API ↔ Database | Data persistence, transactions, consistency |
| **API-WS Connector** | API ↔ WebSocket | Real-time updates, event propagation |
| **WS-UI Connector** | WebSocket ↔ UI | Client receives updates, state sync |
| **Auth-Flow Connector** | Auth ↔ All Systems | JWT flows, session handling |

**Runtime:** ~1-2 minutes each

### What Connector Monsters Catch

```
┌─────────────────────────────────────────────────────────────────┐
│ Example: API-WS Connector Monster                               │
│                                                                 │
│ 1. Bot makes action via API                                     │
│ 2. API processes action                                         │
│ 3. API emits WebSocket event                                    │
│ 4. Verify: Event contains correct data                          │
│ 5. Verify: Event sent to correct rooms/clients                  │
│ 6. Verify: Timing is acceptable (<100ms)                        │
│                                                                 │
│ BUGS THIS CATCHES:                                              │
│ - Event not emitted                                             │
│ - Event has stale/wrong data                                    │
│ - Event sent to wrong room                                      │
│ - Race condition between API and WS                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 3: Flow Monsters (Multi-System Integration)

Test **complete flows across 3+ systems**. Run **nightly**.

| Monster | Flow | Systems Involved |
|---------|------|------------------|
| **Game Flow Monster** | Complete hand | API → DB → WS → UI → Bot |
| **Tournament Flow Monster** | Tournament lifecycle | API → DB → WS → UI → Scheduler |
| **Betting Flow Monster** | Bet → Pot → Payout | API → DB → Invariants → WS |
| **Player Flow Monster** | Join → Play → Leave | Auth → API → DB → WS → UI |

**Runtime:** ~5-10 minutes each

### What Flow Monsters Catch

```
┌─────────────────────────────────────────────────────────────────┐
│ Example: Game Flow Monster                                      │
│                                                                 │
│ Tests a COMPLETE HAND from start to finish:                     │
│                                                                 │
│ 1. [API] Deal cards to players                                  │
│ 2. [DB] Persist game state                                      │
│ 3. [WS] Send cards to clients (hidden from opponents)           │
│ 4. [UI] Verify cards render correctly                           │
│ 5. [Bot] Bot makes decision via callback                        │
│ 6. [API] Process bot action                                     │
│ 7. [Invariant] Verify chips/cards are valid                     │
│ 8. [WS] Broadcast action to all players                         │
│ 9. [UI] Verify action appears in UI                             │
│ ... repeat for all players ...                                  │
│ 10. [API] Determine winner                                      │
│ 11. [DB] Persist results                                        │
│ 12. [WS] Send showdown data                                     │
│ 13. [UI] Verify winner animation                                │
│ 14. [Invariant] Final chip conservation check                   │
│                                                                 │
│ BUGS THIS CATCHES:                                              │
│ - Winner gets wrong amount                                      │
│ - Showdown cards don't match dealt cards                        │
│ - Side pots calculated incorrectly                              │
│ - UI shows stale state during hand                              │
│ - Bot timeout handling breaks hand                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 4: E2E Monster (Full System)

Tests **complete user journeys** across ALL systems. Runs **weekly** or before releases.

### Journeys Tested

1. **New User Journey**
   - Register → Verify Email → Login → Browse → Create Bot → Join Tournament → Play → Win/Lose → View History → Logout

2. **Tournament Lifecycle Journey**
   - Admin Creates → Players Register → Tournament Starts → Multi-table Play → Table Consolidation → Final Table → Winner Determined → Payouts → Leaderboard Updated

3. **Bot Developer Journey**
   - Register → Create Bot → Test Bot → Bot Joins Tournament → Bot Plays Hands → View Bot Stats → Improve Bot

4. **Spectator Journey**
   - Visit → Browse Tournaments → Spectate Game → Real-time Updates → View Leaderboard

**Runtime:** ~30-60 minutes

---

## Monster Dependency Graph

```
                    ┌───────────────────┐
                    │   E2E Monster     │
                    │ (All journeys)    │
                    └─────────┬─────────┘
                              │ depends on
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    ┌─────────────────┐ ┌──────────────┐ ┌──────────────┐
    │ Game Flow       │ │Tournament    │ │ Player Flow  │
    │ Monster         │ │Flow Monster  │ │ Monster      │
    └────────┬────────┘ └──────┬───────┘ └──────┬───────┘
             │                 │                │
             │     depends on  │                │
    ┌────────┴────────┬────────┴────────┬───────┴────────┐
    ▼                 ▼                 ▼                ▼
┌─────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐
│ API-DB  │    │  API-WS   │    │  WS-UI    │    │ Auth-Flow │
│Connector│    │ Connector │    │ Connector │    │ Connector │
└────┬────┘    └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
     │               │                │                │
     │   depends on  │                │                │
     └───────────────┼────────────────┼────────────────┘
                     │                │
    ┌────────────────┼────────────────┼────────────────┐
    ▼                ▼                ▼                ▼
┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
│   API   │    │  Visual  │    │ Invariant │    │ Guardian │
│ Monster │    │ Monster  │    │  Monster  │    │ Monster  │
└─────────┘    └──────────┘    └───────────┘    └──────────┘
```

---

## When to Run Each Layer

| Event | Layer 1 | Layer 2 | Layer 3 | Layer 4 |
|-------|---------|---------|---------|---------|
| Every commit | ✅ | ❌ | ❌ | ❌ |
| PR opened | ✅ | ✅ | ❌ | ❌ |
| PR merged to main | ✅ | ✅ | ✅ | ❌ |
| Nightly | ✅ | ✅ | ✅ | ❌ |
| Weekly | ✅ | ✅ | ✅ | ✅ |
| Pre-release | ✅ | ✅ | ✅ | ✅ |

---

## Commands

```bash
# Layer 1: Unit Monsters
npm run monsters:unit              # All unit monsters
npm run monsters:api               # Just API
npm run monsters:visual            # Just Visual
npm run monsters:invariant         # Just Invariant

# Layer 2: Connector Monsters
npm run monsters:connectors        # All connectors
npm run monsters:api-db            # API ↔ Database
npm run monsters:api-ws            # API ↔ WebSocket
npm run monsters:ws-ui             # WebSocket ↔ UI

# Layer 3: Flow Monsters
npm run monsters:flows             # All flow tests
npm run monsters:game-flow         # Complete hand
npm run monsters:tournament-flow   # Tournament lifecycle

# Layer 4: E2E Monster
npm run monsters:e2e               # Full system test

# Layered runs
npm run monsters:pr                # Layers 1+2 (for PRs)
npm run monsters:nightly           # Layers 1+2+3
npm run monsters:release           # All layers
```

---

## Bug Detection by Layer

| Bug Type | Layer 1 | Layer 2 | Layer 3 | Layer 4 |
|----------|---------|---------|---------|---------|
| API returns wrong data | ✅ | ✅ | ✅ | ✅ |
| API saves wrong data to DB | ❌ | ✅ | ✅ | ✅ |
| WS event not sent | ❌ | ✅ | ✅ | ✅ |
| WS event has stale data | ❌ | ✅ | ✅ | ✅ |
| UI doesn't update on WS event | ❌ | ✅ | ✅ | ✅ |
| Race condition across systems | ❌ | ❌ | ✅ | ✅ |
| Tournament flow edge case | ❌ | ❌ | ✅ | ✅ |
| User journey breaks | ❌ | ❌ | ❌ | ✅ |
| Multi-table coordination bug | ❌ | ❌ | ✅ | ✅ |
| Chip leak across multiple hands | ❌ | ❌ | ✅ | ✅ |

---

## The "Seam Bug" Problem

Most production bugs aren't in single components - they're in the **seams**:

```
┌─────────────────────────────────────────────────────────────────┐
│ EXAMPLE: The Phantom Chip Bug                                   │
│                                                                 │
│ Each system works perfectly alone:                              │
│ ✅ API correctly calculates pot split                           │
│ ✅ Database correctly stores chip values                        │
│ ✅ WebSocket correctly sends update events                      │
│ ✅ UI correctly displays chip counts                            │
│                                                                 │
│ But together, a bug appears:                                    │
│ 1. API calculates pot split (winner gets 1500 chips)            │
│ 2. API saves to DB (1500 chips saved)                           │
│ 3. API emits WS event (sends 1500)                              │
│ 4. RACE CONDITION: UI receives old state first                  │
│ 5. UI shows winner has 1000 chips (stale)                       │
│ 6. WS update arrives, but UI is in "hand complete" state        │
│ 7. Update ignored because "hand is over"                        │
│ 8. Winner sees 1000 chips, DB has 1500                          │
│                                                                 │
│ Unit tests: ALL PASS                                            │
│ Connector test (WS-UI): CATCHES THIS                            │
└─────────────────────────────────────────────────────────────────┘
```

This is why we need **connector monsters** and **flow monsters** - they test the seams where bugs hide.
