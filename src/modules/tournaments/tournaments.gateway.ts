import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { OnEvent } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { TournamentsService } from "./tournaments.service";
import { TournamentRepository } from "../../repositories/tournament.repository";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(",") || [
      "http://localhost:5173",
      "http://localhost:3000",
    ],
    credentials: true,
  },
  namespace: "/tournament",
})
export class TournamentsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TournamentsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tournamentsService: TournamentsService,
    private readonly tournamentRepository: TournamentRepository,
  ) {}

  afterInit() {
    this.logger.log(
      `TournamentsGateway initialized - /tournament namespace ready`,
    );
  }

  handleConnection(@ConnectedSocket() client: AuthenticatedSocket): void {
    try {
      const token = this.extractToken(client);
      if (token) {
        const payload = this.jwtService.verify(token, {
          secret: this.configService.get("JWT_SECRET"),
        });
        client.userId = payload.sub;
        this.logger.debug(
          `User ${client.userId} connected to tournament namespace`,
        );
      } else {
        this.logger.debug(`Spectator connected to tournament namespace`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to authenticate tournament socket: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  @SubscribeMessage("subscribe_tournament")
  async handleSubscribeTournament(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tournamentId: string },
  ): Promise<void> {
    const { tournamentId } = data;

    // Join the tournament room
    client.join(`tournament:${tournamentId}`);
    this.logger.debug(
      `Client ${client.id} (user: ${client.userId || "spectator"}) subscribed to tournament ${tournamentId}`,
    );

    try {
      // Fetch current tournament state
      const tournament = await this.tournamentsService.findById(tournamentId);
      if (!tournament) {
        this.logger.warn(`Tournament not found: ${tournamentId}`);
        client.emit("error", { message: "Tournament not found" });
        return;
      }

      // Fetch registered players with bot and user names
      const entries = await this.tournamentRepository.getEntries(tournamentId);
      this.logger.debug(
        `Found ${entries.length} entries for tournament ${tournamentId}`,
      );

      const players = entries
        .map((entry) => ({
          id: entry.id,
          botId: entry.bot_id,
          botName: entry.bot?.name || "Unknown",
          userId: entry.bot?.user_id,
          userName: entry.bot?.user?.name || "Unknown",
          joinedAt: entry.created_at,
        }))
        .sort(
          (a, b) =>
            new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
        );

      this.logger.debug(
        `Sending ${players.length} players to client ${client.id}`,
      );

      // Send initial state to the client
      client.emit("tournament_state_updated", {
        tournamentId,
        status: tournament.status,
        registeredCount: players.length,
        timestamp: new Date().toISOString(),
      });

      // Send registered players list
      client.emit("tournament_registered_players", {
        tournamentId,
        players,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to fetch tournament state for ${tournamentId}:`,
        error instanceof Error ? error.message : String(error),
      );
      client.emit("error", { message: "Failed to load tournament state" });
    }
  }

  @OnEvent("tournament.botRegistered")
  handleBotRegistered(event: {
    tournamentId: string;
    botId: string;
    botName: string;
    userId: string;
    userName?: string;
  }): void {
    if (!this.server) {
      this.logger.warn(
        `[Gateway] Server not initialized, ignoring tournament.botRegistered for ${event.tournamentId}`,
      );
      return;
    }

    this.server
      .to(`tournament:${event.tournamentId}`)
      .emit("tournament_player_action", {
        tournamentId: event.tournamentId,
        action: "joined",
        botId: event.botId,
        botName: event.botName,
        userId: event.userId,
        userName: event.userName || "Player",
        timestamp: new Date().toISOString(),
      });
  }

  @OnEvent("tournament.stateUpdated")
  handleStateUpdated(event: {
    tournamentId: string;
    status?: string;
    registeredCount?: number;
    currentParticipants?: number;
  }): void {
    if (!this.server) {
      this.logger.warn(
        `[Gateway] Server not initialized, ignoring tournament.stateUpdated for ${event.tournamentId}`,
      );
      return;
    }

    this.logger.debug(
      `[Gateway] Received tournament.stateUpdated event for ${event.tournamentId}`,
    );
    this.logger.debug(
      `[Gateway] Broadcasting to room tournament:${event.tournamentId} - status: ${event.status}`,
    );
    const roomClients = this.server.sockets?.adapter?.rooms?.get(
      `tournament:${event.tournamentId}`,
    );
    this.logger.debug(`[Gateway] ${roomClients?.size || 0} clients in room`);

    this.server
      .to(`tournament:${event.tournamentId}`)
      .emit("tournament_state_updated", {
        tournamentId: event.tournamentId,
        status: event.status,
        registeredCount: event.registeredCount,
        currentParticipants: event.currentParticipants,
        timestamp: new Date().toISOString(),
      });
  }

  @OnEvent("tournament.playerBusted")
  handlePlayerBusted(event: {
    tournamentId: string;
    botId: string;
    botName?: string;
    position: number;
  }): void {
    if (!this.server) {
      this.logger.warn(
        `[Gateway] Server not initialized, ignoring tournament.playerBusted for ${event.tournamentId}`,
      );
      return;
    }

    this.server
      .to(`tournament:${event.tournamentId}`)
      .emit("tournament_player_action", {
        tournamentId: event.tournamentId,
        action: "busted",
        botId: event.botId,
        botName: event.botName,
        position: event.position,
        timestamp: new Date().toISOString(),
      });
  }

  @OnEvent("tournament.finished")
  handleTournamentFinished(event: {
    tournamentId: string;
    winnerId?: string;
    winnerName?: string;
    payouts?: Array<{ position: number; amount: number }>;
  }): void {
    if (!this.server) {
      this.logger.warn(
        `[Gateway] Server not initialized, ignoring tournament.finished for ${event.tournamentId}`,
      );
      return;
    }

    this.server
      .to(`tournament:${event.tournamentId}`)
      .emit("tournament_state_updated", {
        tournamentId: event.tournamentId,
        status: "finished",
        winnerId: event.winnerId,
        winnerName: event.winnerName,
        payouts: event.payouts,
        timestamp: new Date().toISOString(),
      });
  }

  @OnEvent("tournament.blindIncreased")
  handleBlindIncreased(event: {
    tournamentId: string;
    blindLevel: number;
    smallBlind: number;
    bigBlind: number;
  }): void {
    if (!this.server) {
      this.logger.warn(
        `[Gateway] Server not initialized, ignoring tournament.blindIncreased for ${event.tournamentId}`,
      );
      return;
    }

    this.server
      .to(`tournament:${event.tournamentId}`)
      .emit("tournament_notification", {
        tournamentId: event.tournamentId,
        type: "blind_increase",
        message: `Blinds increased to ${event.smallBlind}/${event.bigBlind}`,
        data: {
          blindLevel: event.blindLevel,
          smallBlind: event.smallBlind,
          bigBlind: event.bigBlind,
        },
        timestamp: new Date().toISOString(),
      });
  }

  @OnEvent("tournament.notification")
  handleNotification(event: {
    tournamentId: string;
    type: string;
    message: string;
    data?: Record<string, any>;
  }): void {
    if (!this.server) {
      this.logger.warn(
        `[Gateway] Server not initialized, ignoring tournament.notification for ${event.tournamentId}`,
      );
      return;
    }

    this.server
      .to(`tournament:${event.tournamentId}`)
      .emit("tournament_notification", {
        tournamentId: event.tournamentId,
        type: event.type,
        message: event.message,
        data: event.data,
        timestamp: new Date().toISOString(),
      });
  }

  @SubscribeMessage("refresh_tournament_state")
  async handleRefreshTournamentState(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tournamentId: string },
  ): Promise<void> {
    const { tournamentId } = data;

    try {
      const tournament = await this.tournamentsService.findById(tournamentId);
      if (!tournament) {
        client.emit("error", { message: "Tournament not found" });
        return;
      }

      const entries = await this.tournamentRepository.getEntries(tournamentId);

      client.emit("tournament_state_updated", {
        tournamentId,
        status: tournament.status,
        current_participants: entries.filter((e) => !e.finish_position).length,
        registered_count: entries.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to refresh tournament state for ${tournamentId}:`,
        error instanceof Error ? error.message : String(error),
      );
      client.emit("error", { message: "Failed to refresh tournament state" });
    }
  }

  @SubscribeMessage("unsubscribe_tournament")
  handleUnsubscribeTournament(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tournamentId: string },
  ): void {
    const { tournamentId } = data;
    client.leave(`tournament:${tournamentId}`);
    this.logger.debug(
      `Client ${client.id} unsubscribed from tournament ${tournamentId}`,
    );
  }

  private extractToken(client: AuthenticatedSocket): string | null {
    // Try Authorization header first
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }

    // Fall back to query string
    const token = client.handshake.query.token;
    if (typeof token === "string") {
      return token;
    }

    return null;
  }
}
