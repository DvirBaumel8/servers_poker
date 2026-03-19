import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Logger, OnModuleInit } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  LiveGameManagerService,
  GameStateSnapshot,
} from "../../services/live-game-manager.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  botId?: string;
}

interface GameState {
  id: string;
  tableId: string;
  tournamentId?: string;
  status: string;
  handNumber: number;
  stage: string;
  pot: number;
  communityCards: Array<{ rank: string; suit: string }>;
  currentBet: number;
  currentPlayerId: string | null;
  dealerPosition: number;
  players: Array<{
    botId: string;
    position: number;
    chips: number;
    bet: number;
    folded: boolean;
    allIn: boolean;
  }>;
}

interface PrivatePlayerState {
  botId: string;
  holeCards: Array<{ rank: string; suit: string }>;
  validActions: Array<{
    action: string;
    minAmount?: number;
    maxAmount?: number;
  }>;
}

@WebSocketGateway({
  cors: {
    origin: "*",
    credentials: true,
  },
  namespace: "/game",
})
export class GamesGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GamesGateway.name);
  private readonly connectedClients = new Map<string, AuthenticatedSocket>();
  private readonly tableSubscriptions = new Map<string, Set<string>>();
  private readonly playerSockets = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly liveGameManager: LiveGameManagerService,
  ) {}

  onModuleInit() {
    this.eventEmitter.on(
      "game.stateUpdated",
      (event: { tableId: string; state: GameStateSnapshot }) => {
        this.broadcastGameState(event.tableId, event.state as any);
      },
    );

    this.eventEmitter.on(
      "game.handStarted",
      (event: { tableId: string; handNumber: number }) => {
        this.server.to(`table:${event.tableId}`).emit("handStarted", {
          tableId: event.tableId,
          handNumber: event.handNumber,
        });
      },
    );

    this.eventEmitter.on("game.handComplete", (event: any) => {
      this.broadcastHandResult(event.tableId, {
        handNumber: event.handNumber,
        winners: event.winners.map((w: any) => ({
          botId: w.playerId,
          amount: w.amount,
          handName: w.hand?.name || "Winner",
        })),
        pot: event.winners.reduce((sum: number, w: any) => sum + w.amount, 0),
      });
    });

    this.eventEmitter.on(
      "game.finished",
      (event: { tableId: string; winnerId?: string; winnerName?: string }) => {
        this.broadcastGameFinished(event.tableId, {
          reason: "winner_determined",
          winnerId: event.winnerId,
          winnerName: event.winnerName,
        });
      },
    );

    this.eventEmitter.on(
      "game.playerRemoved",
      (event: { tableId: string; playerId: string }) => {
        const state = this.liveGameManager.getGameState(event.tableId);
        this.broadcastPlayerLeft(event.tableId, {
          playerId: event.playerId,
          playerName: "Player",
          reason: "disconnect",
          remainingPlayers:
            state?.players.filter((p) => !p.disconnected).length || 0,
        });
      },
    );

    this.logger.log("Game event listeners registered");
  }

  afterInit(_server: Server) {
    this.logger.log("WebSocket Gateway initialized");
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (token) {
        const payload = this.jwtService.verify(token, {
          secret: this.configService.get<string>("JWT_SECRET"),
        });
        client.userId = payload.sub;
      }

      this.connectedClients.set(client.id, client);
      this.logger.log(
        `Client connected: ${client.id} (user: ${client.userId || "anonymous"})`,
      );
    } catch (error) {
      this.logger.warn(`Auth failed for client ${client.id}`);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.connectedClients.delete(client.id);

    for (const [tableId, subscribers] of this.tableSubscriptions) {
      if (subscribers.delete(client.id)) {
        if (subscribers.size === 0) {
          this.tableSubscriptions.delete(tableId);
        }
      }
    }

    if (client.botId) {
      this.playerSockets.delete(client.botId);
    }

    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("subscribe")
  handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tableId: string },
  ) {
    const { tableId } = data;

    if (!this.tableSubscriptions.has(tableId)) {
      this.tableSubscriptions.set(tableId, new Set());
    }
    this.tableSubscriptions.get(tableId)!.add(client.id);

    client.join(`table:${tableId}`);
    this.logger.debug(`Client ${client.id} subscribed to table ${tableId}`);

    return { success: true, tableId };
  }

  @SubscribeMessage("unsubscribe")
  handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tableId: string },
  ) {
    const { tableId } = data;

    const subscribers = this.tableSubscriptions.get(tableId);
    if (subscribers) {
      subscribers.delete(client.id);
      if (subscribers.size === 0) {
        this.tableSubscriptions.delete(tableId);
      }
    }

    client.leave(`table:${tableId}`);
    this.logger.debug(`Client ${client.id} unsubscribed from table ${tableId}`);

    return { success: true, tableId };
  }

  @SubscribeMessage("registerBot")
  handleRegisterBot(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { botId: string },
  ) {
    const { botId } = data;
    client.botId = botId;
    this.playerSockets.set(botId, client.id);

    this.logger.log(`Bot ${botId} registered on socket ${client.id}`);
    return { success: true, botId };
  }

  @SubscribeMessage("action")
  async handleBotAction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      gameId: string;
      action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
      amount?: number;
    },
  ) {
    if (!client.botId) {
      return { error: "Bot not registered", code: "NOT_REGISTERED" };
    }

    this.logger.debug(
      `Bot ${client.botId} action: ${data.action} ${data.amount || ""}`,
    );

    return {
      success: true,
      botId: client.botId,
      action: data.action,
      amount: data.amount,
    };
  }

  sendError(
    botId: string,
    error: { code: string; message: string; currentPlayerId?: string },
  ) {
    const socketId = this.playerSockets.get(botId);
    if (socketId) {
      const socket = this.connectedClients.get(socketId);
      if (socket) {
        socket.emit("error", error);
      }
    }
  }

  broadcastGameFinished(
    tableId: string,
    result: {
      reason: string;
      winnerId?: string;
      winnerName?: string;
      finalChips?: Record<string, number>;
    },
  ) {
    this.server.to(`table:${tableId}`).emit("gameFinished", result);
  }

  broadcastPlayerLeft(
    tableId: string,
    data: {
      playerId: string;
      playerName: string;
      reason: "disconnect" | "timeout" | "voluntary";
      remainingPlayers: number;
    },
  ) {
    this.server.to(`table:${tableId}`).emit("playerLeft", data);
  }

  broadcastGameState(tableId: string, state: GameState) {
    this.server.to(`table:${tableId}`).emit("gameState", state);
  }

  sendPrivateState(botId: string, state: PrivatePlayerState) {
    const socketId = this.playerSockets.get(botId);
    if (socketId) {
      const socket = this.connectedClients.get(socketId);
      if (socket) {
        socket.emit("privateState", state);
      }
    }
  }

  broadcastHandResult(
    tableId: string,
    result: {
      handNumber: number;
      winners: Array<{
        botId: string;
        amount: number;
        handName: string;
      }>;
      pot: number;
    },
  ) {
    this.server.to(`table:${tableId}`).emit("handResult", result);
  }

  broadcastPlayerAction(
    tableId: string,
    action: {
      botId: string;
      action: string;
      amount: number;
      pot: number;
    },
  ) {
    this.server.to(`table:${tableId}`).emit("playerAction", action);
  }

  broadcastTournamentUpdate(
    tournamentId: string,
    update: {
      type: "player_bust" | "table_break" | "level_change" | "final_table";
      data: Record<string, any>;
    },
  ) {
    this.server
      .to(`tournament:${tournamentId}`)
      .emit("tournamentUpdate", update);
  }

  getConnectedCount(): number {
    return this.connectedClients.size;
  }

  getTableSubscriberCount(tableId: string): number {
    return this.tableSubscriptions.get(tableId)?.size || 0;
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }

    const queryToken = client.handshake.query.token;
    if (typeof queryToken === "string") {
      return queryToken;
    }

    return null;
  }
}
