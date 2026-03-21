import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { GamesGateway } from "../games/games.gateway";

interface TournamentEvent {
  tournamentId: string;
  tournament?: {
    id: string;
    name: string;
    status: string;
    entries_count: number;
    [key: string]: unknown;
  };
}

@Injectable()
export class TournamentWebsocketListener {
  private readonly logger = new Logger(TournamentWebsocketListener.name);

  constructor(
    @Inject(forwardRef(() => GamesGateway))
    private readonly gamesGateway: GamesGateway,
  ) {}

  @OnEvent("tournament.created")
  handleTournamentCreated(event: TournamentEvent): void {
    this.logger.debug(`Broadcasting tournament created: ${event.tournamentId}`);
    if (event.tournament) {
      this.gamesGateway.broadcastTournamentListUpdate(event.tournament);
    }
  }

  @OnEvent("tournament.cancelled")
  handleTournamentCancelled(event: TournamentEvent): void {
    this.logger.debug(
      `Broadcasting tournament cancelled: ${event.tournamentId}`,
    );
    if (event.tournament) {
      this.gamesGateway.broadcastTournamentListUpdate(event.tournament);
    }
  }

  @OnEvent("tournament.botRegistered")
  handleBotRegistered(event: TournamentEvent): void {
    this.logger.debug(
      `Broadcasting bot registered to tournament: ${event.tournamentId}`,
    );
    this.gamesGateway.broadcastTournamentUpdate(event.tournamentId, {
      type: "playerRegistered",
      data: { ...event },
    });
  }

  @OnEvent("tournament.stateUpdated")
  handleStateUpdated(event: {
    tournamentId: string;
    state: Record<string, unknown>;
  }): void {
    this.logger.debug(
      `Broadcasting tournament state update: ${event.tournamentId}`,
    );
    this.gamesGateway.broadcastTournamentUpdate(event.tournamentId, {
      type: "stateUpdate",
      data: event.state,
    });
  }

  @OnEvent("tournament.levelChanged")
  handleLevelChanged(event: {
    tournamentId: string;
    level: number;
    blinds: { small_blind: number; big_blind: number; ante?: number };
  }): void {
    this.logger.debug(
      `Broadcasting tournament level change: ${event.tournamentId}`,
    );
    this.gamesGateway.broadcastTournamentUpdate(event.tournamentId, {
      type: "levelChanged",
      data: { level: event.level, blinds: event.blinds },
    });
  }

  @OnEvent("tournament.playerBusted")
  handlePlayerBusted(event: {
    tournamentId: string;
    botId: string;
    position: number;
  }): void {
    this.logger.debug(
      `Broadcasting player busted: ${event.botId} in ${event.tournamentId}`,
    );
    this.gamesGateway.broadcastTournamentUpdate(event.tournamentId, {
      type: "playerBusted",
      data: { botId: event.botId, position: event.position },
    });
  }

  @OnEvent("tournament.finished")
  handleTournamentFinished(event: {
    tournamentId: string;
    winnerId?: string;
    winnerName?: string;
    payouts: Array<{ position: number; amount: number }>;
  }): void {
    this.logger.debug(
      `Broadcasting tournament finished: ${event.tournamentId}`,
    );
    this.gamesGateway.broadcastTournamentUpdate(event.tournamentId, {
      type: "finished",
      data: {
        winnerId: event.winnerId,
        winnerName: event.winnerName,
        payouts: event.payouts,
      },
    });
  }
}
