import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { DataSource } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { FinanceService } from "../finance/finance.service";
import { LockService } from "../../common/redis/lock.service";
import { TournamentPodRepository } from "../../repositories/tournament-pod.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { TournamentEntry } from "../../entities/tournament-entry.entity";
import { MATCHMAKING_CONFIG } from "./matchmaking.config";

export interface BustRecord {
  botId: string;
  finishPosition: number;
  isTied: boolean;
}

export interface Payout {
  position: number;
  percentage: number;
  amount: bigint;
}

@Injectable()
export class PrizeDistributionService {
  private readonly logger = new Logger(PrizeDistributionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly financeService: FinanceService,
    private readonly lockService: LockService,
    private readonly tournamentPodRepository: TournamentPodRepository,
    private readonly botRepository: BotRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Event-driven handler — listens for pod completion, distributes 15% ITM payouts atomically.
   * Decoupled from GameEngine: only reacts to events, never calls game logic.
   */
  @OnEvent("tournament.podFinished")
  async handlePodFinished(payload: {
    podId: string;
    bustOrder: BustRecord[];
    winnerId: string;
  }): Promise<void> {
    const { podId } = payload;

    await this.lockService.withLock(
      { key: `lock:prize:pod:${podId}`, ttlMs: 30_000 },
      async () => this.doHandlePodFinished(payload),
    );
  }

  private async doHandlePodFinished(payload: {
    podId: string;
    bustOrder: BustRecord[];
    winnerId: string;
  }): Promise<void> {
    const { podId, bustOrder, winnerId } = payload;
    this.logger.log(`Processing payouts for pod ${podId}`);

    const pod = await this.tournamentPodRepository.findByIdOrThrow(podId);

    // Idempotency: skip if already processed
    if (pod.status === "finished") {
      this.logger.warn(
        `Pod ${podId} already finished — skipping duplicate payout`,
      );
      return;
    }

    const prizePool = pod.prize_pool;
    const playerCount = pod.player_count;

    if (prizePool <= 0n) {
      this.logger.warn(`Pod ${podId} has zero prize pool, skipping payouts`);
      return;
    }

    const payouts = this.calculatePodPayouts(prizePool, playerCount);

    // Build finish order: winner first, then bustOrder reversed (last busted = 2nd place)
    const finishOrder: string[] = [winnerId];
    for (let i = bustOrder.length - 1; i >= 0; i--) {
      if (bustOrder[i].botId !== winnerId) {
        finishOrder.push(bustOrder[i].botId);
      }
    }

    await this.dataSource.transaction(async (manager) => {
      for (const payout of payouts) {
        const botId = finishOrder[payout.position - 1];
        if (!botId) continue;

        const bot = await this.botRepository.findByIdOrThrow(botId, manager);
        const userId = bot.user_id;

        await this.financeService.creditPayout(
          userId,
          payout.amount,
          podId,
          `Pod #${pod.pod_number} — ${this.ordinal(payout.position)} place prize`,
          manager,
        );

        // Update tournament entry payout
        await manager
          .getRepository(TournamentEntry)
          .createQueryBuilder()
          .update()
          .set({ payout: payout.amount })
          .where("tournament_id = :tid AND bot_id = :bid", {
            tid: pod.master_tournament_id,
            bid: botId,
          })
          .execute();

        this.logger.log(
          `Paid ${payout.amount} to bot ${botId} (${this.ordinal(payout.position)} place)`,
        );
      }

      // Mark pod as finished
      await this.tournamentPodRepository.update(
        podId,
        { status: "finished", winner_bot_id: winnerId },
        manager,
      );
    });

    this.eventEmitter.emit("matchmaking.podPaidOut", { podId, winnerId });
    this.logger.log(`Payouts complete for pod ${podId}`);
  }

  /**
   * Calculate ITM payout structure for a pod.
   * 15% of players get paid with a steep curve: 1st 30%, 2nd 20%, 3rd 15%, rest split equally.
   * Uses BigInt math — remainder goes to 1st place.
   */
  calculatePodPayouts(prizePool: bigint, playerCount: number): Payout[] {
    const itmCount = Math.max(
      1,
      Math.floor(playerCount * MATCHMAKING_CONFIG.ITM_PERCENTAGE),
    );
    const curve = MATCHMAKING_CONFIG.PAYOUT_CURVE;

    let percentages: number[];
    if (itmCount === 1) {
      percentages = [100];
    } else if (itmCount === 2) {
      percentages = [65, 35];
    } else {
      // Use curve for top positions, split remainder equally among the rest
      const topSlots = Math.min(curve.length, itmCount);
      const topPercentages = curve.slice(0, topSlots);
      const topSum = topPercentages.reduce((a, b) => a + b, 0);
      const remainingSlots = itmCount - topSlots;
      const remainingPerShare =
        remainingSlots > 0 ? Math.floor((100 - topSum) / remainingSlots) : 0;
      const leftover =
        remainingSlots > 0
          ? 100 - topSum - remainingPerShare * remainingSlots
          : 100 - topSum;

      percentages = [...topPercentages];
      for (let i = 0; i < remainingSlots; i++) {
        percentages.push(remainingPerShare);
      }
      // Add leftover to 1st place
      percentages[0] += leftover;
    }

    let remaining = prizePool;
    const payouts: Payout[] = percentages.map((pct, i) => {
      const amount = (prizePool * BigInt(pct)) / 100n;
      remaining -= amount;
      return { position: i + 1, percentage: pct, amount };
    });

    // Remainder to 1st place (BigInt division rounding)
    if (remaining > 0n) {
      payouts[0].amount += remaining;
    }

    return payouts;
  }

  private ordinal(n: number): string {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
}
