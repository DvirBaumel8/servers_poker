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
import {
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
  Inject,
} from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  LiveGameManagerService,
  GameStateSnapshot,
} from "../../services/game/live-game-manager.service";
import { BotActivityService } from "../../services/bot/bot-activity.service";
import { BotRepository } from "../../repositories/bot.repository";
import { DEFAULT_CORS_ORIGINS } from "../../config/app.config";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  botId?: string;
  messageCount?: number;
  windowStart?: number;
}

// WebSocket rate limiting configuration
const WS_RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const WS_RATE_LIMIT_MAX_MESSAGES = 100; // 100 messages per minute per client

interface GameState {
  id: string;
  tableId: string;
  tournamentId?: string;
  status: string;
  handNumber: number;
  stage: string;
  pot: bigint;
  communityCards: Array<{ rank: string; suit: string }>;
  currentBet: bigint;
  currentPlayerId: string | null;
  dealerPosition: number;
  players: Array<{
    id: string;
    botId: string;
    name: string;
    position: number;
    chips: bigint;
    bet: bigint;
    folded: boolean;
    allIn: boolean;
    disconnected: boolean;
    strikes: number;
    holeCards: Array<{ rank: string; suit: string }>;
  }>;
  blinds: {
    small: bigint;
    big: bigint;
    ante: bigint;
  };
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
    origin: process.env.CORS_ORIGINS?.split(",") || DEFAULT_CORS_ORIGINS,
    credentials: true,
  },
  namespace: "/game",
})
export class GamesGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GamesGateway.name);
  private readonly localConnectedClients = new Map<
    string,
    AuthenticatedSocket
  >();
  private readonly eventHandlers: Array<{
    event: string;
    handler: (...args: unknown[]) => void;
  }> = [];

  /**
   * Check if a client is rate limited.
   * Returns true if the request should be blocked.
   */
  private isRateLimited(client: AuthenticatedSocket): boolean {
    const now = Date.now();

    // Initialize or reset window
    if (
      !client.windowStart ||
      now - client.windowStart > WS_RATE_LIMIT_WINDOW_MS
    ) {
      client.windowStart = now;
      client.messageCount = 1;
      return false;
    }

    // Increment and check
    client.messageCount = (client.messageCount || 0) + 1;

    if (client.messageCount > WS_RATE_LIMIT_MAX_MESSAGES) {
      this.logger.warn(
        `WebSocket rate limit exceeded for client ${client.id} (user: ${client.userId || "unknown"})`,
      );
      return true;
    }

    return false;
  }

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly liveGameManager: LiveGameManagerService,
    private readonly botRepository: BotRepository,
    @Optional()
    @Inject(BotActivityService)
    private readonly botActivityService: BotActivityService | null,
  ) {}

  onModuleInit() {
    this.setupLocalEventListeners();
    this.logger.log("Game event listeners registered");
  }

  onModuleDestroy() {
    for (const { event, handler } of this.eventHandlers) {
      this.eventEmitter.off(event, handler);
    }
    this.eventHandlers.length = 0;
    this.logger.log("Game event listeners cleaned up");
  }

  private registerEventHandler(
    event: string,
    handler: (...args: unknown[]) => void,
  ): void {
    this.eventEmitter.on(event, handler);
    this.eventHandlers.push({ event, handler });
  }

  private setupLocalEventListeners(): void {
    this.registerEventHandler(
      "game.stateUpdated",
      (event: {
        tableId: string;
        gameId: string;
        state: GameStateSnapshot;
      }) => {
        this.broadcastGameState(event.gameId, event.state as any);
      },
    );

    this.registerEventHandler(
      "game.handStarted",
      (event: {
        tableId: string;
        gameId: string;
        handNumber: number;
        provablyFair?: {
          serverSeedHash: string;
          clientSeed: string;
          nonce: number;
        };
      }) => {
        this.server.to(`table:${event.gameId}`).emit("handStarted", {
          tableId: event.gameId,
          handNumber: event.handNumber,
          provablyFair: event.provablyFair,
        });
      },
    );

    this.registerEventHandler("game.handComplete", (event: any) => {
      this.broadcastHandResult(event.gameId || event.tableId, {
        handNumber: event.handNumber,
        winners: event.winners.map((w: any) => ({
          botId: w.playerId,
          amount: w.amount,
          handName: w.hand?.name || "Winner",
        })),
        pot: event.winners.reduce((sum: number, w: any) => sum + w.amount, 0),
        provablyFair: event.provablyFair,
        showdownSequence: event.showdownSequence,
      });
    });

    this.registerEventHandler(
      "game.showdownReveal",
      (event: {
        tableId: string;
        gameId: string;
        handNumber: number;
        playerId: string;
        playerName: string;
        cardStatus: string;
        holeCards?: any[];
        hand?: any;
        isWinner: boolean;
      }) => {
        this.server.to(`table:${event.gameId}`).emit("showdownReveal", {
          playerId: event.playerId,
          playerName: event.playerName,
          cardStatus: event.cardStatus,
          holeCards: event.holeCards,
          hand: event.hand
            ? { name: event.hand.name, rank: event.hand.rank }
            : undefined,
          isWinner: event.isWinner,
        });
      },
    );

    this.registerEventHandler(
      "game.playerAction",
      (event: {
        tableId: string;
        gameId: string;
        botId: string;
        action: string;
        amount: number;
        pot: number;
      }) => {
        this.broadcastPlayerAction(event.gameId, {
          botId: event.botId,
          action: event.action,
          amount: event.amount,
          pot: event.pot,
        });
      },
    );

    this.registerEventHandler(
      "game.finished",
      (event: {
        tableId: string;
        gameId: string;
        winnerId?: string;
        winnerName?: string;
      }) => {
        this.broadcastGameFinished(event.gameId, {
          reason: "winner_determined",
          winnerId: event.winnerId,
          winnerName: event.winnerName,
        });
      },
    );

    this.registerEventHandler(
      "game.playerRemoved",
      (event: { tableId: string; gameId: string; playerId: string }) => {
        const state = this.getGameState(event.tableId);
        this.broadcastPlayerLeft(event.gameId, {
          playerId: event.playerId,
          playerName: "Player",
          reason: "disconnect",
          remainingPlayers:
            state?.players.filter((p) => !p.disconnected).length || 0,
        });
        this.broadcastBotActivityUpdate(event.playerId).catch((e) =>
          this.logger.error(
            `Failed to broadcast bot activity: ${e.message}`,
            e instanceof Error ? e.stack : undefined,
          ),
        );
      },
    );

    this.registerEventHandler(
      "game.playerJoined",
      (event: { tableId: string; gameId: string; player: { id: string } }) => {
        this.broadcastBotActivityUpdate(event.player.id).catch((e) =>
          this.logger.error(
            `Failed to broadcast bot activity: ${e.message}`,
            e instanceof Error ? e.stack : undefined,
          ),
        );
      },
    );
  }

  private getGameState(tableId: string): GameStateSnapshot | null {
    return this.liveGameManager.getGameState(tableId) || null;
  }

  afterInit(_server: Server) {
    this.logger.log("WebSocket Gateway initialized");
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.userId = undefined;
        this.localConnectedClients.set(client.id, client);
        this.logger.log(`Spectator connected: ${client.id} (no auth)`);
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>("JWT_SECRET"),
      });
      client.userId = payload.sub;

      this.localConnectedClients.set(client.id, client);
      this.logger.log(
        `Client connected: ${client.id} (user: ${client.userId})`,
      );
    } catch {
      client.userId = undefined;
      this.localConnectedClients.set(client.id, client);
      this.logger.log(
        `Spectator connected: ${client.id} (invalid token, spectating)`,
      );
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.localConnectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("subscribe")
  async handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tableId: string },
  ) {
    if (this.isRateLimited(client)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    const { tableId } = data;
    this.logger.log(`[subscribe] client=${client.id} table=${tableId}`);

    client.join(`table:${tableId}`);

    // Send initial game state; retry briefly in case game is still starting
    let snapshot = this.getGameState(tableId);
    let retries = 0;
    while (!snapshot && retries < 20) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      snapshot = this.getGameState(tableId);
      retries++;
    }

    if (snapshot) {
      client.emit("gameState", this.snapshotToGameState(snapshot));
    } else {
      this.logger.warn(
        `[subscribe] game not found for table=${tableId} after ${retries * 100}ms — sending waiting state`,
      );
      // No active game, send a waiting state
      client.emit("gameState", {
        id: tableId,
        tableId,
        status: "waiting",
        handNumber: 0,
        stage: "waiting",
        pot: 0,
        communityCards: [],
        currentBet: 0,
        currentPlayerId: null,
        dealerPosition: 0,
        players: [],
        blinds: { small: 0, big: 0, ante: 0 },
      });
    }

    return { success: true, tableId };
  }

  @SubscribeMessage("unsubscribe")
  async handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tableId: string },
  ) {
    if (this.isRateLimited(client)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    const { tableId } = data;

    client.leave(`table:${tableId}`);
    this.logger.debug(`Client ${client.id} unsubscribed from table ${tableId}`);

    return { success: true, tableId };
  }

  @SubscribeMessage("registerBot")
  async handleRegisterBot(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { botId: string },
  ) {
    if (this.isRateLimited(client)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    if (!client.userId) {
      return { success: false, error: "Authentication required" };
    }

    const { botId } = data;

    const bot = await this.botRepository.findById(botId);
    if (!bot || bot.user_id !== client.userId) {
      return { success: false, error: "Bot not found or access denied" };
    }

    client.botId = botId;
    this.logger.log(`Bot ${botId} registered on socket ${client.id}`);
    return { success: true, botId };
  }

  @SubscribeMessage("subscribeBotActivity")
  async handleSubscribeBotActivity(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { botId: string },
  ) {
    if (this.isRateLimited(client)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    if (!client.userId) {
      return { success: false, error: "Authentication required" };
    }

    const { botId } = data;

    const bot = await this.botRepository.findById(botId);
    if (!bot || bot.user_id !== client.userId) {
      return { success: false, error: "Bot not found or access denied" };
    }

    client.join(`bot:${botId}`);
    this.logger.debug(
      `Client ${client.id} subscribed to bot activity for ${botId}`,
    );

    if (this.botActivityService) {
      const activity = await this.botActivityService.getBotActivity(botId);
      if (activity) {
        client.emit("botActivity", activity);
      }
    }

    return { success: true, botId };
  }

  @SubscribeMessage("unsubscribeBotActivity")
  async handleUnsubscribeBotActivity(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { botId: string },
  ) {
    if (this.isRateLimited(client)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    const { botId } = data;

    client.leave(`bot:${botId}`);
    this.logger.debug(
      `Client ${client.id} unsubscribed from bot activity for ${botId}`,
    );

    return { success: true, botId };
  }

  @SubscribeMessage("subscribeActiveBots")
  async handleSubscribeActiveBots(
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (this.isRateLimited(client)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    client.join("activeBots");
    this.logger.debug(`Client ${client.id} subscribed to active bots`);

    if (this.botActivityService) {
      const activeBots = await this.botActivityService.getAllActiveBots();
      client.emit("activeBots", {
        bots: activeBots,
        totalActive: activeBots.length,
        timestamp: new Date().toISOString(),
      });
    }

    return { success: true };
  }

  @SubscribeMessage("unsubscribeActiveBots")
  handleUnsubscribeActiveBots(@ConnectedSocket() client: AuthenticatedSocket) {
    if (this.isRateLimited(client)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    client.leave("activeBots");
    this.logger.debug(`Client ${client.id} unsubscribed from active bots`);
    return { success: true };
  }

  @SubscribeMessage("subscribeTournaments")
  async handleSubscribeTournaments(
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (this.isRateLimited(client)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    client.join("tournaments");
    this.logger.debug(`Client ${client.id} subscribed to tournaments`);
    return { success: true };
  }

  @SubscribeMessage("unsubscribeTournaments")
  handleUnsubscribeTournaments(@ConnectedSocket() client: AuthenticatedSocket) {
    if (this.isRateLimited(client)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    client.leave("tournaments");
    this.logger.debug(`Client ${client.id} unsubscribed from tournaments`);
    return { success: true };
  }

  @SubscribeMessage("subscribeTournament")
  async handleSubscribeTournament(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tournamentId: string },
  ) {
    if (this.isRateLimited(client)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    const { tournamentId } = data;
    client.join(`tournament:${tournamentId}`);
    this.logger.debug(
      `Client ${client.id} subscribed to tournament ${tournamentId}`,
    );
    return { success: true };
  }

  @SubscribeMessage("unsubscribeTournament")
  handleUnsubscribeTournament(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tournamentId: string },
  ) {
    if (this.isRateLimited(client)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    const { tournamentId } = data;
    client.leave(`tournament:${tournamentId}`);
    this.logger.debug(
      `Client ${client.id} unsubscribed from tournament ${tournamentId}`,
    );
    return { success: true };
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
    if (this.isRateLimited(client)) {
      return { error: "Rate limit exceeded", code: "RATE_LIMITED" };
    }

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
    _botId: string,
    _error: { code: string; message: string; currentPlayerId?: string },
  ) {
    // Single-instance: errors are sent directly via game events
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
    const transformedState = {
      ...state,
      blinds: {
        small: (state as any).smallBlind || 0,
        big: (state as any).bigBlind || 0,
        ante: (state as any).ante || 0,
      },
      currentPlayerId: (state as any).activePlayerId || null,
      dealerPosition: this.getDealerPosition(state),
    };
    this.logger.log(
      `📤 Broadcasting gameState to room table:${tableId} (${transformedState.players?.length || 0} players, pot=${transformedState.pot})`,
    );
    this.server.to(`table:${tableId}`).emit("gameState", transformedState);
  }

  private getDealerPosition(state: GameState): number {
    const players = (state as any).players || [];
    const dealerIndex = players.findIndex(
      (p: any) => p.position === "Dealer" || p.position === "BTN",
    );
    return dealerIndex >= 0 ? dealerIndex : 0;
  }

  sendPrivateState(_botId: string, _state: PrivatePlayerState) {
    // Single-instance: private state is sent directly via game events
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
      provablyFair?: {
        serverSeed: string;
        serverSeedHash: string;
        clientSeed: string;
        nonce: number;
        combinedHash: string;
        deckOrder: number[];
        verificationUrl: string;
      };
      showdownSequence?: Array<{
        playerId: string;
        cardStatus: string;
        hand?: { name: string; rank: number };
        order: number;
      }>;
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
      type:
        | "player_bust"
        | "table_break"
        | "level_change"
        | "final_table"
        | "playerRegistered"
        | "stateUpdate"
        | "levelChanged"
        | "playerBusted"
        | "finished";
      data: Record<string, unknown>;
    },
  ) {
    this.server
      .to(`tournament:${tournamentId}`)
      .emit("tournamentUpdate", update);
  }

  async broadcastBotActivityUpdate(botId: string): Promise<void> {
    if (!this.botActivityService) return;

    const activity = await this.botActivityService.getBotActivity(botId);
    if (activity) {
      this.server.to(`bot:${botId}`).emit("botActivity", activity);
    }

    const activeBots = await this.botActivityService.getAllActiveBots();
    this.server.to("activeBots").emit("activeBots", {
      bots: activeBots,
      totalActive: activeBots.length,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastTournamentListUpdate(tournament: {
    id: string;
    name: string;
    status: string;
    entries_count: number;
    [key: string]: unknown;
  }): void {
    this.server.to("tournaments").emit("tournamentListUpdate", {
      tournament,
      timestamp: new Date().toISOString(),
    });
  }

  getConnectedCount(): number {
    return this.localConnectedClients.size;
  }

  async getTableSubscriberCount(tableId: string): Promise<number> {
    const room = this.server.sockets.adapter.rooms.get(`table:${tableId}`);
    return room?.size ?? 0;
  }

  private snapshotToGameState(snapshot: GameStateSnapshot): GameState {
    return {
      id: snapshot.gameId || snapshot.tableId,
      tableId: snapshot.tableId,
      status: snapshot.status,
      handNumber: snapshot.handNumber,
      stage: snapshot.stage,
      pot: snapshot.pot,
      communityCards: snapshot.communityCards.map((card) => {
        if (typeof card === "string" && card.length >= 2) {
          const chars = [...card];
          const suit = chars.pop() || "?";
          const rank = chars.join("");
          return { rank, suit };
        }
        return { rank: "?", suit: "?" };
      }),
      currentBet: snapshot.currentBet,
      currentPlayerId: snapshot.activePlayerId,
      dealerPosition: 0,
      players: snapshot.players.map((p, index) => ({
        id: p.id,
        botId: p.id,
        name: p.name || "Unknown",
        position: typeof p.position === "number" ? p.position : index,
        chips: p.chips ?? 0n,
        bet: p.bet ?? 0n,
        folded: p.folded || false,
        allIn: p.allIn || false,
        disconnected: p.disconnected || false,
        strikes: p.strikes || 0,
        holeCards: (p.holeCards || []).map((card: string) => {
          if (typeof card === "string" && card.length >= 2) {
            const chars = [...card];
            const suit = chars.pop() || "?";
            const rank = chars.join("");
            return { rank, suit };
          }
          return { rank: "?", suit: "?" };
        }),
      })),
      blinds: {
        small: snapshot.smallBlind ?? 0n,
        big: snapshot.bigBlind ?? 0n,
        ante: snapshot.ante ?? 0n,
      },
    };
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
