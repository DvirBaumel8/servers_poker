# Tournament Real-Time Updates - Backend Implementation Guide

## Overview

This document describes the backend changes needed to support real-time tournament state updates via Socket.IO and access control for spectating games.

## 1. CREATE TOURNAMENT SOCKET GATEWAY

**File:** `src/modules/tournaments/tournaments.gateway.ts`

```typescript
import { SubscribeMessage, WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Injectable } from '@nestjs/common'
import { TournamentsService } from './tournaments.service'
import { AuthService } from '../auth/auth.service'

@WebSocketGateway({
  namespace: '/tournament',
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  },
})
@Injectable()
export class TournamentsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  constructor(
    private tournamentsService: TournamentsService,
    private authService: AuthService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Extract and verify JWT token
      const token = client.handshake.auth.token
      if (!token) {
        client.disconnect(true)
        return
      }

      // Verify token and attach user to socket
      const user = await this.authService.verifyToken(token)
      ;(client.data as any).userId = user.id
      ;(client.data as any).user = user

      console.log(`✓ Tournament client connected: ${client.id} (user: ${user.id})`)
    } catch (error) {
      console.error('Connection error:', error)
      client.disconnect(true)
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`✗ Tournament client disconnected: ${client.id}`)
  }

  /**
   * Subscribe to tournament updates
   * Client emits: { tournamentId: string }
   */
  @SubscribeMessage('subscribe_tournament')
  async handleSubscribeTournament(client: Socket, payload: { tournamentId: string }) {
    const { tournamentId } = payload
    const userId = (client.data as any).userId

    if (!tournamentId) {
      client.emit('error', { message: 'Tournament ID required' })
      return
    }

    // Join a tournament-specific room: "tournament:{tournamentId}"
    client.join(`tournament:${tournamentId}`)

    // Fetch current tournament state and send to client
    const tournament = await this.tournamentsService.findOne(tournamentId)
    if (tournament) {
      client.emit('tournament_state_updated', {
        tournamentId,
        status: tournament.status,
        registered_count: tournament.entries?.length ?? 0,
        current_participants: tournament.entries?.length ?? 0,
        timestamp: new Date().toISOString(),
      })
    }

    console.log(`✓ User ${userId} subscribed to tournament ${tournamentId}`)
  }

  /**
   * Unsubscribe from tournament updates
   */
  @SubscribeMessage('unsubscribe_tournament')
  handleUnsubscribeTournament(client: Socket, payload: { tournamentId: string }) {
    const { tournamentId } = payload
    client.leave(`tournament:${tournamentId}`)
    console.log(`✗ Client ${client.id} unsubscribed from tournament ${tournamentId}`)
  }

  /**
   * Force refresh of tournament state
   */
  @SubscribeMessage('refresh_tournament_state')
  async handleRefreshTournament(client: Socket, payload: { tournamentId: string }) {
    const { tournamentId } = payload
    const tournament = await this.tournamentsService.findOne(tournamentId)

    if (tournament) {
      client.emit('tournament_state_updated', {
        tournamentId,
        status: tournament.status,
        registered_count: tournament.entries?.length ?? 0,
        current_participants: tournament.entries?.length ?? 0,
        timestamp: new Date().toISOString(),
      })
    }
  }

  // ─── Public methods for other services to broadcast updates ──────────────────

  /**
   * Broadcast tournament state update to all subscribers
   * Called by TournamentsService when state changes
   */
  broadcastTournamentStateUpdate(tournamentId: string, update: any) {
    this.server.to(`tournament:${tournamentId}`).emit('tournament_state_updated', {
      tournamentId,
      ...update,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Broadcast player action (joined, busted, advanced)
   */
  broadcastPlayerAction(
    tournamentId: string,
    action: 'joined' | 'busted' | 'advanced_level',
    data: {
      botId: string
      botName: string
      userId: string
      userName: string
      chipCount?: number
      tableNumber?: number
    },
  ) {
    this.server.to(`tournament:${tournamentId}`).emit('tournament_player_action', {
      tournamentId,
      playerId: data.userId,
      botId: data.botId,
      botName: data.botName,
      userName: data.userName,
      action,
      chipCount: data.chipCount,
      tableNumber: data.tableNumber,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Broadcast tournament notification (blind increase, milestones)
   */
  broadcastNotification(
    tournamentId: string,
    type: 'blind_increase' | 'player_joined' | 'player_busted' | 'final_table_reached',
    message: string,
    data?: Record<string, any>,
  ) {
    this.server.to(`tournament:${tournamentId}`).emit('tournament_notification', {
      tournamentId,
      type,
      message,
      data,
      timestamp: new Date().toISOString(),
    })
  }
}
```

## 2. UPDATE TOURNAMENTS SERVICE TO BROADCAST UPDATES

**File:** `src/modules/tournaments/tournaments.service.ts`

```typescript
export class TournamentsService {
  constructor(
    // ... existing dependencies
    private tournamentsGateway: TournamentsGateway,
  ) {}

  /**
   * Join tournament - broadcast to all subscribers
   */
  async joinTournament(tournamentId: string, botId: string, userId: string) {
    // ... existing join logic ...

    const bot = await this.botsService.findOne(botId)
    const user = await this.usersService.findOne(userId)

    // Broadcast player joined event
    this.tournamentsGateway.broadcastPlayerAction(tournamentId, 'joined', {
      botId,
      botName: bot.name,
      userId,
      userName: user.name,
    })

    // Broadcast updated state
    const tournament = await this.findOne(tournamentId)
    this.tournamentsGateway.broadcastTournamentStateUpdate(tournamentId, {
      status: tournament.status,
      registered_count: tournament.entries?.length ?? 0,
      current_participants: tournament.entries?.length ?? 0,
    })

    return entry
  }

  /**
   * Called by tournament director when blinds increase
   */
  async advanceTournamentLevel(tournamentId: string, newLevel: number, newBlinds: { small: number; big: number }) {
    // ... existing logic ...

    // Broadcast blind increase notification
    this.tournamentsGateway.broadcastNotification(
      tournamentId,
      'blind_increase',
      `Blinds increased: ${newBlinds.small}/${newBlinds.big}`,
      { level: newLevel, blinds: newBlinds },
    )

    // Broadcast state update
    this.tournamentsGateway.broadcastTournamentStateUpdate(tournamentId, {
      status: tournament.status,
      current_level: newLevel,
    })
  }

  /**
   * Called when player busts out
   */
  async playerBustOut(tournamentId: string, botId: string, finishPosition: number) {
    // ... existing logic ...

    const bot = await this.botsService.findOne(botId)
    const entry = await this.findPlayerEntry(tournamentId, botId)

    // Broadcast player busted
    this.tournamentsGateway.broadcastPlayerAction(tournamentId, 'busted', {
      botId,
      botName: bot.name,
      userId: entry.user_id,
      userName: entry.user?.name ?? 'Unknown',
    })

    // Update state if tournament ends
    if (finishPosition === 1) {
      this.tournamentsGateway.broadcastNotification(
        tournamentId,
        'final_table_reached',
        `🏆 ${bot.name} won the tournament!`,
      )
    }
  }
}
```

## 3. ADD TOURNAMENT GATEWAY TO TOURNAMENTS MODULE

**File:** `src/modules/tournaments/tournaments.module.ts`

```typescript
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TournamentsService } from './tournaments.service'
import { TournamentsController } from './tournaments.controller'
import { TournamentsGateway } from './tournaments.gateway'
import { Tournament } from './entities/tournament.entity'
// ... other imports ...

@Module({
  imports: [
    TypeOrmModule.forFeature([Tournament, /* ... other entities ... */]),
    // ... other imports ...
  ],
  controllers: [TournamentsController],
  providers: [TournamentsService, TournamentsGateway],
  exports: [TournamentsService, TournamentsGateway],
})
export class TournamentsModule {}
```

## 4. ADD ACCESS CONTROL FOR GAME SPECTATING

**File:** `src/modules/games/games.controller.ts`

```typescript
import { ForbiddenException } from '@nestjs/common'

export class GamesController {
  constructor(
    private gamesService: GamesService,
    private tournamentsService: TournamentsService,
  ) {}

  @Get('/:id')
  async getGame(@Param('id') gameId: string, @Req() req: any) {
    const game = await this.gamesService.findOne(gameId)

    if (!game) {
      throw new NotFoundException('Game not found')
    }

    // Check access control if this is a tournament game
    if (game.tournamentId) {
      const userId = req.user?.id
      const isFinished = game.status === 'finished'

      // Allow viewing if:
      // 1. User is registered in the tournament, OR
      // 2. Game is finished (public), OR
      // 3. User is admin
      if (userId && req.user?.role !== 'admin') {
        const isRegistered = await this.tournamentsService.isUserRegistered(game.tournamentId, userId)

        if (!isRegistered && !isFinished) {
          throw new ForbiddenException(
            'Only registered players can watch live games. ' +
            'Games become public 10 minutes after they finish.',
          )
        }
      }
    }

    return game
  }
}
```

**Add to TournamentsService:**

```typescript
async isUserRegistered(tournamentId: string, userId: string): Promise<boolean> {
  const entry = await this.entryRepository.findOne({
    where: {
      tournament: { id: tournamentId },
      user: { id: userId },
    },
  })
  return !!entry
}
```

## 5. EMISSION POINTS - WHERE TO CALL BROADCAST METHODS

Call these methods at key points in tournament lifecycle:

### Tournament Entry Joined
```typescript
// In TournamentsService.joinTournament()
this.tournamentsGateway.broadcastPlayerAction(...)
this.tournamentsGateway.broadcastTournamentStateUpdate(...)
```

### Blind Level Advances
```typescript
// In TournamentDirectorService.advanceBlinds()
this.tournamentsGateway.broadcastNotification('blind_increase', ...)
this.tournamentsGateway.broadcastTournamentStateUpdate(...)
```

### Player Busts Out
```typescript
// In LiveGameManagerService or GamesService when player is eliminated
this.tournamentsGateway.broadcastPlayerAction('busted', ...)
this.tournamentsGateway.broadcastTournamentStateUpdate(...)
```

### Tournament Reaches Final Table
```typescript
// In TournamentDirectorService.checkForFinalTable()
this.tournamentsGateway.broadcastNotification('final_table_reached', ...)
this.tournamentsGateway.broadcastTournamentStateUpdate({ status: 'final_table', ... })
```

### Tournament Finished
```typescript
// In TournamentDirectorService.finishTournament()
this.tournamentsGateway.broadcastNotification(...)
this.tournamentsGateway.broadcastTournamentStateUpdate({ status: 'finished', ... })
```

## 6. TESTING THE REAL-TIME UPDATES

**Manual Testing with Socket.IO Client:**

```bash
# Open browser console and run:
const socket = io('http://localhost:3000/tournament', {
  auth: { token: 'YOUR_JWT_TOKEN' }
})

socket.on('connect', () => {
  console.log('Connected')
  socket.emit('subscribe_tournament', { tournamentId: 'TOURNAMENT_ID' })
})

socket.on('tournament_state_updated', (data) => {
  console.log('Tournament state:', data)
})

socket.on('tournament_player_action', (data) => {
  console.log('Player action:', data)
})

socket.on('tournament_notification', (data) => {
  console.log('Notification:', data)
})
```

## 7. DEPLOYMENT CHECKLIST

- [ ] Add `TournamentsGateway` to `TournamentsModule` providers
- [ ] Add gateway imports/exports
- [ ] Update `TournamentsService` to use gateway for broadcasting
- [ ] Add `isUserRegistered()` method to TournamentsService
- [ ] Add access control to `GamesController.getGame()`
- [ ] Test Socket.IO connection from frontend
- [ ] Test real-time updates on tournament join
- [ ] Test blind level advancement broadcasts
- [ ] Test player bust-out broadcasts
- [ ] Verify access control on live game viewing

## 8. PERFORMANCE CONSIDERATIONS

- **Room broadcasts**: Socket.IO rooms are efficient - only subscribed clients receive messages
- **Database queries**: Consider caching tournament state to reduce queries
- **Scaling**: Use Redis adapter for multi-instance deployments:
  ```typescript
  import { createAdapter } from '@socket.io/redis-adapter'
  const io = new Server({ adapter: createAdapter(pubClient, subClient) })
  ```

## 9. FUTURE ENHANCEMENTS

- Delayed spectating (10min delay for live games)
- Live chat in tournament rooms
- Spectator-only replays of finished hands
- Tournament commentary/annotations
- Personal notifications when your bot advances/busts
