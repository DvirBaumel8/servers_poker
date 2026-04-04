# Tournament System - Comprehensive Test Suite

## Test Structure

```
tests/
├── unit/
│   ├── tournaments/
│   │   ├── tournaments-gateway.spec.ts       ← Socket.IO gateway
│   │   ├── tournaments-service.spec.ts       ← Business logic
│   │   └── tournaments-controller.spec.ts    ← HTTP endpoints
│   └── hooks/
│       └── useTournamentSocket.spec.ts       ← Frontend hook
│
├── integration/
│   ├── tournament-registration.spec.ts       ← Join tournament flow
│   ├── tournament-realtime-updates.spec.ts   ← WebSocket broadcasts
│   └── tournament-access-control.spec.ts     ← Game spectating auth
│
└── e2e/
    ├── tournament-discovery.e2e.ts            ← Browse & view tournaments
    ├── tournament-registration.e2e.ts        ← Join tournament flow
    └── tournament-realtime.e2e.ts            ← Real-time updates
```

---

## Unit Tests

### 1. Frontend Hook: useTournamentSocket.spec.ts

```typescript
// frontend/src/hooks/useTournamentSocket.spec.ts
import { renderHook, waitFor } from '@testing-library/react'
import { useTournamentSocket } from './useTournamentSocket'
import * as ioModule from 'socket.io-client'

vi.mock('socket.io-client')

describe('useTournamentSocket', () => {
  let mockSocket: any

  beforeEach(() => {
    mockSocket = {
      on: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    }
    vi.mocked(ioModule.io).mockReturnValue(mockSocket)
  })

  it('should connect to tournament namespace with JWT token', async () => {
    const { result } = renderHook(() =>
      useTournamentSocket({ tournamentId: 'tourn-123' })
    )

    await waitFor(() => {
      expect(ioModule.io).toHaveBeenCalledWith(
        expect.stringContaining('/tournament'),
        expect.objectContaining({
          auth: expect.objectContaining({ token: expect.any(String) }),
        })
      )
    })
  })

  it('should subscribe to tournament room on connect', async () => {
    const { result } = renderHook(() =>
      useTournamentSocket({ tournamentId: 'tourn-123' })
    )

    // Simulate connect event
    const connectHandler = mockSocket.on.mock.calls.find(
      (call: any[]) => call[0] === 'connect'
    )[1]
    connectHandler()

    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe_tournament', {
        tournamentId: 'tourn-123',
      })
    })
  })

  it('should update state when tournament_state_updated is received', async () => {
    const { result } = renderHook(() =>
      useTournamentSocket({ tournamentId: 'tourn-123' })
    )

    const stateUpdateHandler = mockSocket.on.mock.calls.find(
      (call: any[]) => call[0] === 'tournament_state_updated'
    )[1]

    const update = {
      tournamentId: 'tourn-123',
      registered_count: 32,
      status: 'registering',
    }
    stateUpdateHandler(update)

    await waitFor(() => {
      expect(result.current.latestUpdate).toEqual(update)
    })
  })

  it('should track player actions in order', async () => {
    const { result } = renderHook(() =>
      useTournamentSocket({ tournamentId: 'tourn-123' })
    )

    const playerActionHandler = mockSocket.on.mock.calls.find(
      (call: any[]) => call[0] === 'tournament_player_action'
    )[1]

    const action1 = { botName: 'Alice', action: 'joined' }
    const action2 = { botName: 'Bob', action: 'joined' }

    playerActionHandler(action1)
    playerActionHandler(action2)

    await waitFor(() => {
      expect(result.current.playerUpdates).toHaveLength(2)
      expect(result.current.playerUpdates[0]).toEqual(action2) // Most recent first
    })
  })

  it('should handle connection errors gracefully', async () => {
    const { result } = renderHook(() =>
      useTournamentSocket({ tournamentId: 'tourn-123' })
    )

    const errorHandler = mockSocket.on.mock.calls.find(
      (call: any[]) => call[0] === 'connect_error'
    )[1]
    errorHandler(new Error('Connection failed'))

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('error')
    })
  })

  it('should auto-reconnect on disconnect', async () => {
    const { result } = renderHook(() =>
      useTournamentSocket({ tournamentId: 'tourn-123' })
    )

    const disconnectHandler = mockSocket.on.mock.calls.find(
      (call: any[]) => call[0] === 'disconnect'
    )[1]
    disconnectHandler()

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('disconnected')
    })

    // Simulate reconnect
    const connectHandler = mockSocket.on.mock.calls.find(
      (call: any[]) => call[0] === 'connect'
    )[1]
    connectHandler()

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected')
    })
  })

  it('should clean up on unmount', () => {
    const { unmount } = renderHook(() =>
      useTournamentSocket({ tournamentId: 'tourn-123' })
    )

    unmount()

    expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribe_tournament', {
      tournamentId: 'tourn-123',
    })
    expect(mockSocket.disconnect).toHaveBeenCalled()
  })

  it('should not connect if disabled', () => {
    renderHook(() =>
      useTournamentSocket({ tournamentId: 'tourn-123', enabled: false })
    )

    expect(ioModule.io).not.toHaveBeenCalled()
  })

  it('should not connect without tournamentId', () => {
    renderHook(() =>
      useTournamentSocket({ tournamentId: '', enabled: true })
    )

    expect(ioModule.io).not.toHaveBeenCalled()
  })
})
```

### 2. Backend Gateway: tournaments-gateway.spec.ts

```typescript
// src/modules/tournaments/tournaments.gateway.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { TournamentsGateway } from './tournaments.gateway'
import { TournamentsService } from './tournaments.service'
import { AuthService } from '../auth/auth.service'
import { Socket, Server } from 'socket.io'

describe('TournamentsGateway', () => {
  let gateway: TournamentsGateway
  let tournamentsService: TournamentsService
  let authService: AuthService
  let mockSocket: any
  let mockServer: any

  beforeEach(async () => {
    mockSocket = {
      handshake: {
        auth: { token: 'valid-token' },
      },
      data: {},
      join: vi.fn(),
      leave: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      id: 'socket-123',
    }

    mockServer = {
      to: vi.fn().mockReturnValue({
        emit: vi.fn(),
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsGateway,
        {
          provide: TournamentsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            verifyToken: vi.fn().mockResolvedValue({ id: 'user-123' }),
          },
        },
      ],
    }).compile()

    gateway = module.get<TournamentsGateway>(TournamentsGateway)
    tournamentsService = module.get<TournamentsService>(TournamentsService)
    authService = module.get<AuthService>(AuthService)
    gateway.server = mockServer as Server
  })

  describe('handleConnection', () => {
    it('should verify JWT token and attach user to socket', async () => {
      await gateway.handleConnection(mockSocket)

      expect(authService.verifyToken).toHaveBeenCalledWith('valid-token')
      expect(mockSocket.data.userId).toBe('user-123')
    })

    it('should disconnect client without valid token', async () => {
      mockSocket.handshake.auth.token = undefined

      await gateway.handleConnection(mockSocket)

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true)
    })

    it('should disconnect on invalid token', async () => {
      vi.mocked(authService.verifyToken).mockRejectedValueOnce(
        new Error('Invalid token')
      )

      await gateway.handleConnection(mockSocket)

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true)
    })
  })

  describe('handleSubscribeTournament', () => {
    it('should join tournament room and send current state', async () => {
      mockSocket.data.userId = 'user-123'
      const tournament = {
        id: 'tourn-123',
        status: 'registering',
        entries: [{ id: 'entry-1' }, { id: 'entry-2' }],
      }

      vi.mocked(tournamentsService.findOne).mockResolvedValueOnce(tournament)

      await gateway.handleSubscribeTournament(mockSocket, {
        tournamentId: 'tourn-123',
      })

      expect(mockSocket.join).toHaveBeenCalledWith('tournament:tourn-123')
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'tournament_state_updated',
        expect.objectContaining({
          tournamentId: 'tourn-123',
          registered_count: 2,
        })
      )
    })

    it('should handle missing tournament ID', async () => {
      mockSocket.data.userId = 'user-123'

      await gateway.handleSubscribeTournament(mockSocket, { tournamentId: '' })

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: 'Tournament ID required' })
      )
    })
  })

  describe('broadcastTournamentStateUpdate', () => {
    it('should broadcast to tournament room', () => {
      gateway.broadcastTournamentStateUpdate('tourn-123', {
        registered_count: 33,
        status: 'registering',
      })

      expect(mockServer.to).toHaveBeenCalledWith('tournament:tourn-123')
      expect(mockServer.to().emit).toHaveBeenCalledWith(
        'tournament_state_updated',
        expect.objectContaining({
          tournamentId: 'tourn-123',
          registered_count: 33,
        })
      )
    })
  })

  describe('broadcastPlayerAction', () => {
    it('should broadcast player action', () => {
      gateway.broadcastPlayerAction('tourn-123', 'joined', {
        botId: 'bot-123',
        botName: 'AliceBot',
        userId: 'user-456',
        userName: 'Alice',
      })

      expect(mockServer.to().emit).toHaveBeenCalledWith(
        'tournament_player_action',
        expect.objectContaining({
          tournamentId: 'tourn-123',
          action: 'joined',
          botName: 'AliceBot',
        })
      )
    })
  })

  describe('broadcastNotification', () => {
    it('should broadcast tournament notification', () => {
      gateway.broadcastNotification(
        'tourn-123',
        'blind_increase',
        'Blinds: 100/200'
      )

      expect(mockServer.to().emit).toHaveBeenCalledWith(
        'tournament_notification',
        expect.objectContaining({
          type: 'blind_increase',
          message: 'Blinds: 100/200',
        })
      )
    })
  })
})
```

---

## Integration Tests

### 1. Tournament Registration Integration Test

```typescript
// tests/integration/tournament-registration.spec.ts
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'

describe('Tournament Registration Flow (Integration)', () => {
  let app: INestApplication
  let tournamentId: string
  let botId: string
  let authToken: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  it('should register bot in tournament', async () => {
    // 1. Create user
    const userRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `test-${Date.now()}@test.com`,
        password: 'password123',
        name: 'Test User',
      })

    authToken = userRes.body.token
    expect(authToken).toBeDefined()

    // 2. Create bot
    const botRes = await request(app.getHttpServer())
      .post('/api/v1/bots')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'TestBot',
        description: 'Test bot',
        strategy: { personality: {} },
      })

    botId = botRes.body.id
    expect(botId).toBeDefined()

    // 3. Get upcoming tournament
    const tourRes = await request(app.getHttpServer())
      .get('/api/v1/tournaments/scheduled/upcoming')

    tournamentId = tourRes.body[0].id
    expect(tournamentId).toBeDefined()

    // 4. Join tournament
    const joinRes = await request(app.getHttpServer())
      .post(`/api/v1/tournaments/${tournamentId}/join`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ botId })

    expect(joinRes.status).toBe(200)
    expect(joinRes.body.bot_id).toBe(botId)

    // 5. Verify registration
    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/tournaments/${tournamentId}`)
      .set('Authorization', `Bearer ${authToken}`)

    const isRegistered = detailRes.body.entries.some(
      (e: any) => e.bot_id === botId
    )
    expect(isRegistered).toBe(true)
  })

  afterAll(async () => {
    await app.close()
  })
})
```

### 2. Real-Time Updates Integration Test

```typescript
// tests/integration/tournament-realtime-updates.spec.ts
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { io, Socket } from 'socket.io-client'

describe('Tournament Real-Time Updates (Integration)', () => {
  let app: INestApplication
  let socket1: Socket
  let socket2: Socket
  let tournamentId: string
  let token: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()

    // Create test tournament
    const tourRes = await app.get('TournamentsService').seed()
    tournamentId = tourRes[0].id
  })

  it('should broadcast state updates to all subscribers', async () => {
    return new Promise<void>((done) => {
      const updates: any[] = []

      // Client 1 subscribes
      socket1 = io('http://localhost:3000/tournament', {
        auth: { token },
      })

      socket1.on('connect', () => {
        socket1.emit('subscribe_tournament', { tournamentId })
      })

      socket1.on('tournament_state_updated', (update) => {
        updates.push(update)
        if (updates.length === 1) {
          // Got first update, now subscribe second client
          socket2 = io('http://localhost:3000/tournament', {
            auth: { token },
          })

          socket2.on('connect', () => {
            socket2.emit('subscribe_tournament', { tournamentId })
          })

          socket2.on('tournament_state_updated', (update) => {
            updates.push(update)
            if (updates.length === 3) {
              // Both clients got updates
              expect(updates).toHaveLength(3)
              socket1.disconnect()
              socket2.disconnect()
              done()
            }
          })

          // Trigger state update
          app.get('TournamentsGateway').broadcastTournamentStateUpdate(
            tournamentId,
            { registered_count: 33 }
          )
        }
      })
    })
  })

  afterAll(async () => {
    socket1?.disconnect()
    socket2?.disconnect()
    await app.close()
  })
})
```

---

## E2E Tests

### 1. Tournament Discovery E2E Test

```typescript
// tests/e2e/tournament-discovery.e2e.ts
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Page, Browser, chromium } from 'playwright'

describe('Tournament Discovery (E2E)', () => {
  let app: INestApplication
  let browser: Browser
  let page: Page
  let baseUrl: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()

    baseUrl = 'http://localhost:5173'
    browser = await chromium.launch()
  })

  it('should display tournament list on discovery page', async () => {
    page = await browser.newPage()

    // Sign in first
    await page.goto(`${baseUrl}/signin`)
    await page.fill('input[type="email"]', 'test@test.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button:has-text("Sign In")')
    await page.waitForNavigation()

    // Navigate to tournaments
    await page.goto(`${baseUrl}/tournaments`)

    // Wait for tournament cards to load
    await page.waitForSelector('[data-testid="tournament-card"]')

    // Check tournaments are displayed
    const cards = await page.locator('[data-testid="tournament-card"]').count()
    expect(cards).toBeGreaterThan(0)

    // Check card content
    const firstCard = page.locator('[data-testid="tournament-card"]').first()
    expect(await firstCard.locator('.tournament-name').isVisible()).toBe(true)
    expect(await firstCard.locator('.participant-count').isVisible()).toBe(true)
    expect(await firstCard.locator('.start-countdown').isVisible()).toBe(true)
  })

  it('should filter tournaments by start time', async () => {
    await page.click('button:has-text("Start Time")')

    // Verify cards are sorted
    const cards = await page.locator('[data-testid="tournament-card"]').all()
    const times = []

    for (const card of cards) {
      const time = await card.locator('.tournament-start').textContent()
      times.push(time)
    }

    // Times should be in chronological order
    expect(times).toEqual([...times].sort())
  })

  afterAll(async () => {
    await browser.close()
    await app.close()
  })
})
```

---

## Test Execution

### Run All Tests

```bash
# Unit tests only
npm run test:unit -- tournaments

# Integration tests only
npm run test:integration -- tournament

# E2E tests only
npm run test:e2e -- tournament

# All tests with coverage
npm run test -- tournaments --coverage

# Watch mode
npm run test -- tournaments --watch
```

### Expected Coverage

| Module | Coverage Target |
|--------|-----------------|
| `useTournamentSocket.ts` | 95%+ |
| `TournamentsGateway` | 90%+ |
| `TournamentsService` | 85%+ |
| `TournamentDetailPage` | 80%+ |
| Integration flows | 85%+ |
| **Overall** | **85%+** |

---

## Test Scenarios

### Access Control Tests

```typescript
// Backend: GamesController.getGame() access check
describe('Game Spectating Access Control', () => {
  it('should deny non-registered user from watching live tournament game', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/games/${gameId}`)
      .set('Authorization', `Bearer ${nonRegisteredUserToken}`)

    expect(response.status).toBe(403)
    expect(response.body.message).toContain('registered')
  })

  it('should allow registered user to watch live game', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/games/${gameId}`)
      .set('Authorization', `Bearer ${registeredUserToken}`)

    expect(response.status).toBe(200)
  })

  it('should allow non-registered user to watch finished game', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/games/${finishedGameId}`)
      .set('Authorization', `Bearer ${anyUserToken}`)

    expect(response.status).toBe(200)
  })
})
```

---

## Coverage Report

Generate coverage report:

```bash
npm run test -- tournaments --coverage

# View HTML report
open coverage/index.html
```

---

## Continuous Integration

**GitHub Actions Workflow:**

```yaml
name: Tournament Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit -- tournaments
      - run: npm run test:integration -- tournament
      - run: npm run test:e2e -- tournament --no-file-parallelism
      - uses: codecov/codecov-action@v3
```

---

## Manual Testing Checklist

### Phase 1: Access Control
- [ ] Non-registered user blocked from live game (403)
- [ ] Registered user can watch live game (200)
- [ ] Finished game public for anyone (200)
- [ ] Admin can watch any game (200)

### Phase 2: Real-Time Updates
- [ ] WebSocket connects successfully
- [ ] Connection status shows 🟢 Live
- [ ] Tournament state updates in <100ms
- [ ] Player action notifications appear instantly
- [ ] Participant count auto-updates
- [ ] Auto-reconnect on disconnect
- [ ] Multiple clients see same updates

### Phase 3: Full Flow
- [ ] Discover tournament
- [ ] Open tournament detail
- [ ] See live participant count
- [ ] Register bot (modal opens)
- [ ] Confirmation & success message
- [ ] Participant list updates
- [ ] Real-time notifications appear

---

**Status:** Test files ready to implement
**Coverage Goal:** 85%+
**Priority:** Phase 1 tests first (access control), then Phase 2 (real-time)
