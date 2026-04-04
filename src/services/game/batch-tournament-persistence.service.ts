import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import {
  SimulationOutput,
  SimGame,
  SimHand,
  SimHandPlayer,
  SimAction,
  SimBustRecord,
} from "../../workers/simulation.types";
import { calculatePayouts } from "../../config/tournaments.config";

const CHUNK_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size)
    result.push(arr.slice(i, i + size));
  return result;
}

@Injectable()
export class BatchTournamentPersistenceService {
  private readonly logger = new Logger(BatchTournamentPersistenceService.name);

  async persistSimulationResult(
    output: SimulationOutput,
    dataSource: DataSource,
  ): Promise<void> {
    const {
      tournamentId,
      winnerId,
      bustOrder,
      games,
      hands,
      handPlayers,
      actions,
    } = output;

    this.logger.log(
      `Persisting simulation for tournament ${tournamentId}: ` +
        `${games.length} games, ${hands.length} hands, ${actions.length} actions`,
    );

    await dataSource.transaction(async (manager) => {
      const now = new Date();

      // ── 1. Insert games ──────────────────────────────────────────────────
      for (const batch of chunk(games, CHUNK_SIZE)) {
        const rows = batch.map((g: SimGame) => ({
          id: g.gameId,
          table_id: g.tableId,
          tournament_id: tournamentId,
          status: "finished",
          total_hands: hands.filter((h) => h.gameId === g.gameId).length,
          started_at: now,
          finished_at: now,
          created_at: now,
          updated_at: now,
        }));
        await manager
          .createQueryBuilder()
          .insert()
          .into("games")
          .values(rows)
          .orIgnore()
          .execute();
      }

      // ── 2. Insert hands ──────────────────────────────────────────────────
      for (const batch of chunk(hands, CHUNK_SIZE)) {
        const rows = batch.map((h: SimHand) => ({
          id: h.handId,
          game_id: h.gameId,
          tournament_id: tournamentId,
          hand_number: h.handNumber,
          small_blind: h.smallBlind,
          big_blind: h.bigBlind,
          ante: h.ante,
          community_cards: JSON.stringify(h.communityCards),
          pot: h.pot,
          stage: "complete",
          started_at: h.startedAt,
          finished_at: h.finishedAt,
          created_at: now,
          updated_at: now,
        }));
        await manager
          .createQueryBuilder()
          .insert()
          .into("hands")
          .values(rows)
          .orIgnore()
          .execute();
      }

      // ── 3. Insert hand_players ───────────────────────────────────────────
      for (const batch of chunk(handPlayers, CHUNK_SIZE)) {
        const rows = batch.map((hp: SimHandPlayer) => ({
          id: uuidv4(),
          hand_id: hp.handId,
          bot_id: hp.botId,
          position: hp.position,
          hole_cards: JSON.stringify(hp.holeCards),
          start_chips: hp.startChips,
          end_chips: hp.endChips,
          amount_bet: hp.amountBet,
          amount_won: hp.amountWon,
          won: hp.won,
          folded: hp.folded,
          all_in: hp.allIn,
          saw_showdown: hp.sawShowdown,
          saw_flop: false,
          created_at: now,
          updated_at: now,
        }));
        await manager
          .createQueryBuilder()
          .insert()
          .into("hand_players")
          .values(rows)
          .orIgnore()
          .execute();
      }

      // ── 4. Insert actions ────────────────────────────────────────────────
      for (const batch of chunk(actions, CHUNK_SIZE)) {
        const rows = batch.map((a: SimAction) => ({
          id: uuidv4(),
          hand_id: a.handId,
          bot_id: a.botId,
          action_seq: a.sequence,
          action_type: a.action,
          stage: a.street,
          amount: a.amount,
          pot_after: a.potAfter,
          chips_after: a.chipsAfter,
          response_time_ms: null,
          created_at: now,
          updated_at: now,
        }));
        await manager
          .createQueryBuilder()
          .insert()
          .into("actions")
          .values(rows)
          .orIgnore()
          .execute();
      }

      // ── 5. Update tournament_entries with bust positions ─────────────────
      const allBotIds = bustOrder.map((b: SimBustRecord) => b.botId);
      if (winnerId) allBotIds.push(winnerId);

      for (const bust of bustOrder) {
        await manager.query(
          `UPDATE tournament_entries
             SET finish_position = $1, bust_level = $2
           WHERE tournament_id = $3 AND bot_id = $4`,
          [bust.finishPosition, bust.bustLevel, tournamentId, bust.botId],
        );
      }
      if (winnerId) {
        await manager.query(
          `UPDATE tournament_entries
             SET finish_position = 1, bust_level = NULL
           WHERE tournament_id = $1 AND bot_id = $2`,
          [tournamentId, winnerId],
        );
      }

      // ── 6. Calculate & apply payouts ─────────────────────────────────────
      const totalEntrants = bustOrder.length + (winnerId ? 1 : 0);
      const tournamentRow = await manager.query(
        `SELECT buy_in FROM tournaments WHERE id = $1`,
        [tournamentId],
      );
      const buyIn = BigInt(tournamentRow[0]?.buy_in ?? 0);
      const prizePool = BigInt(totalEntrants) * buyIn;

      if (prizePool > 0) {
        const payouts = calculatePayouts(prizePool, totalEntrants);
        for (const payout of payouts) {
          if (winnerId && payout.position === 1) {
            await manager.query(
              `UPDATE tournament_entries SET payout = $1
               WHERE tournament_id = $2 AND bot_id = $3`,
              [payout.amount, tournamentId, winnerId],
            );
          } else {
            const bustEntry = bustOrder.find(
              (b) => b.finishPosition === payout.position,
            );
            if (bustEntry) {
              await manager.query(
                `UPDATE tournament_entries SET payout = $1
                 WHERE tournament_id = $2 AND bot_id = $3`,
                [payout.amount, tournamentId, bustEntry.botId],
              );
            }
          }
        }
      }

      // ── 7. Finalize tournament ───────────────────────────────────────────
      await manager.query(
        `UPDATE tournaments
           SET status = 'finished', finished_at = $1
         WHERE id = $2`,
        [now, tournamentId],
      );
    });

    this.logger.log(
      `Simulation persistence complete for tournament ${tournamentId}`,
    );
  }
}
