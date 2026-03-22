import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { MetricsService } from "./metrics.service";
import { LiveGameManagerService } from "../../services/game/live-game-manager.service";
import { TournamentDirectorService } from "../tournaments/tournament-director.service";
import { GamesGateway } from "../games/games.gateway";

@Injectable()
export class MetricsCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsCollectorService.name);
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly metricsService: MetricsService,
    private readonly liveGameManager: LiveGameManagerService,
    private readonly tournamentDirector: TournamentDirectorService,
    @Optional()
    @Inject(forwardRef(() => GamesGateway))
    private readonly gamesGateway: GamesGateway | null,
  ) {}

  onModuleInit(): void {
    this.updateInterval = setInterval(() => {
      this.updateGaugeMetrics().catch((err) => {
        this.logger.error(
          `Failed to update gauge metrics: ${err.message}`,
          err instanceof Error ? err.stack : undefined,
        );
      });
    }, 5000);
    this.logger.log("Metrics collector initialized");
  }

  onModuleDestroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      this.logger.log("Metrics collector stopped");
    }
  }

  private async updateGaugeMetrics(): Promise<void> {
    const runningGames = this.liveGameManager.getRunningGameCount();
    this.metricsService.setActiveGames(runningGames);

    const activeTournaments =
      this.tournamentDirector.getActiveTournaments().length;
    this.metricsService.setActiveTournaments(activeTournaments);

    if (this.gamesGateway) {
      const wsConnections = await this.gamesGateway.getConnectedCount();
      this.metricsService.setWebsocketConnections(wsConnections);
    }

    // Update database pool metrics (GAP-2 fix)
    this.metricsService.updateDatabasePoolMetrics();
  }

  @OnEvent("game.handStarted")
  handleHandStarted(event: {
    tableId: string;
    gameId: string;
    handNumber: number;
  }): void {
    this.metricsService.incrementHandsDealt();

    if (event.handNumber === 1) {
      this.metricsService.incrementGamesStarted();
    }

    this.metricsService.addBreadcrumb(
      "game",
      `Hand #${event.handNumber} started`,
      {
        tableId: event.tableId,
        gameId: event.gameId,
        handNumber: event.handNumber,
      },
    );

    this.logger.debug(
      `Hand #${event.handNumber} started on table ${event.tableId}`,
    );
  }

  @OnEvent("game.handComplete")
  handleHandComplete(event: {
    tableId: string;
    gameId: string;
    handNumber: number;
    winners: Array<{ playerId: string; amount: number }>;
  }): void {
    this.logger.debug(
      `Hand #${event.handNumber} complete on table ${event.tableId}`,
    );
  }

  @OnEvent("game.playerAction")
  handlePlayerAction(event: {
    tableId: string;
    gameId: string;
    botId: string;
    action: string;
    amount?: number;
  }): void {
    this.metricsService.recordBotAction(event.action, event.botId);
  }

  @OnEvent("game.finished")
  handleGameFinished(event: {
    tableId: string;
    gameId: string;
    winnerId?: string;
    reason: string;
  }): void {
    this.metricsService.addBreadcrumb("game", "Game finished", {
      tableId: event.tableId,
      gameId: event.gameId,
      winnerId: event.winnerId,
      reason: event.reason,
    });

    this.logger.debug(`Game finished on table ${event.tableId}`);
    this.updateGaugeMetrics().catch((err) => {
      this.logger.error(
        `Failed to update metrics on game finish: ${err.message}`,
        err instanceof Error ? err.stack : undefined,
      );
    });
  }

  @OnEvent("tournament.levelChanged")
  handleTournamentLevelChanged(event: {
    tournamentId: string;
    level: number;
  }): void {
    this.logger.debug(
      `Tournament ${event.tournamentId} advanced to level ${event.level}`,
    );
  }

  @OnEvent("tournament.playerBusted")
  handleTournamentPlayerBusted(event: {
    tournamentId: string;
    botId: string;
    position: number;
  }): void {
    this.logger.debug(
      `Bot ${event.botId} busted in position ${event.position}`,
    );
  }

  @OnEvent("tournament.finished")
  handleTournamentFinished(event: {
    tournamentId: string;
    winnerId?: string;
    winnerName?: string;
  }): void {
    this.metricsService.incrementTournamentCompletions();

    this.metricsService.addBreadcrumb("tournament", "Tournament finished", {
      tournamentId: event.tournamentId,
      winnerId: event.winnerId,
      winnerName: event.winnerName,
    });

    this.updateGaugeMetrics().catch((err) => {
      this.logger.error(
        `Failed to update metrics on tournament finish: ${err.message}`,
        err instanceof Error ? err.stack : undefined,
      );
    });
    this.logger.debug(
      `Tournament ${event.tournamentId} finished. Winner: ${event.winnerName}`,
    );
  }

  @OnEvent("tournament.botRegistered")
  handleTournamentBotRegistered(event: {
    tournamentId: string;
    botId: string;
    botName: string;
  }): void {
    this.metricsService.incrementTournamentEntries();
    this.logger.debug(
      `Bot ${event.botName} registered for tournament ${event.tournamentId}`,
    );
  }
}
