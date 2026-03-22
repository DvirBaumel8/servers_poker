import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AnalyticsRepository } from "../../repositories/analytics.repository";
import { TournamentRepository } from "../../repositories/tournament.repository";

interface TournamentFinishedEvent {
  tournamentId: string;
  winnerId?: string;
  winnerName?: string;
  payouts: Array<{ position: number; amount: number }>;
}

/**
 * Listens for tournament events and updates bot statistics.
 */
@Injectable()
export class TournamentStatsListener {
  private readonly logger = new Logger(TournamentStatsListener.name);

  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly tournamentRepository: TournamentRepository,
  ) {}

  @OnEvent("tournament.finished")
  async handleTournamentFinished(
    event: TournamentFinishedEvent,
  ): Promise<void> {
    this.logger.log(
      `Updating stats for tournament ${event.tournamentId} (winner: ${event.winnerName || "unknown"})`,
    );

    try {
      const entries = await this.tournamentRepository.getEntries(
        event.tournamentId,
      );

      for (const entry of entries) {
        const isWinner = entry.bot_id === event.winnerId;
        const payout = Number(entry.payout) || 0;
        const tournament = await this.tournamentRepository.findById(
          event.tournamentId,
        );
        const buyIn = tournament ? Number(tournament.buy_in) : 0;
        const netProfit = payout - buyIn;

        await this.analyticsRepository.incrementBotStats(entry.bot_id, {
          total_tournaments: 1,
          tournament_wins: isWinner ? 1 : 0,
          total_net: netProfit,
        });

        this.logger.debug(
          `Updated stats for bot ${entry.bot_id}: +1 tournament${isWinner ? ", +1 win" : ""}, net: ${netProfit}`,
        );
      }

      this.logger.log(
        `Stats updated for ${entries.length} participants in tournament ${event.tournamentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update tournament stats: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
