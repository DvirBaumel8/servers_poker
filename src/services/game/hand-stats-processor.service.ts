import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";

export interface HandStatsReadyEvent {
  gameId: string;
  handNumber: number;
  atShowdown: boolean;
  winners: Array<{ playerId: string; amount: bigint }>;
  players: Array<{
    id: string;
    folded: boolean;
    totalBet: bigint;
  }>;
}

export interface ActionStatsReadyEvent {
  botId: string;
  action: string;
  stage: string;
}

interface StatsIncrement {
  total_hands: number;
  total_net: bigint;
  vpip_hands: number;
  pfr_hands: number;
  wtsd_hands: number;
  wmsd_hands: number;
  aggressive_actions: number;
  passive_actions: number;
}

const FLUSH_INTERVAL_MS = 10_000;

@Injectable()
export class HandStatsProcessorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(HandStatsProcessorService.name);
  private pendingStats = new Map<string, StatsIncrement>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    this.flushTimer = setInterval(() => {
      this.flushStats().catch((err) => {
        this.logger.error(
          `Flush timer error: ${err instanceof Error ? err.message : err}`,
        );
      });
    }, FLUSH_INTERVAL_MS);
    this.logger.log(
      `Hand stats processor initialized (flush every ${FLUSH_INTERVAL_MS / 1000}s)`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushStats();
  }

  @OnEvent("hand.stats.ready", { async: true })
  handleHandStatsReady(event: HandStatsReadyEvent): void {
    try {
      for (const player of event.players) {
        const inc = this.getOrCreateIncrement(player.id);
        inc.total_hands += 1;

        const isWinner = event.winners.some((w) => w.playerId === player.id);
        const winAmount = event.winners
          .filter((w) => w.playerId === player.id)
          .reduce((sum, w) => sum + w.amount, 0n);
        const netChange = winAmount - player.totalBet;
        inc.total_net += netChange;

        if (event.atShowdown && !player.folded) {
          inc.wtsd_hands += 1;
          if (isWinner) {
            inc.wmsd_hands += 1;
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to process hand stats event: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  @OnEvent("action.stats.ready", { async: true })
  handleActionStatsReady(event: ActionStatsReadyEvent): void {
    try {
      const action = event.action?.toLowerCase();
      const stage = event.stage?.toLowerCase();
      const inc = this.getOrCreateIncrement(event.botId);

      if (action === "raise" || action === "bet") {
        inc.aggressive_actions += 1;
      } else if (action === "call" || action === "check") {
        inc.passive_actions += 1;
      }

      if (stage === "preflop" || stage === "pre-flop") {
        if (action === "call" || action === "raise" || action === "bet") {
          inc.vpip_hands += 1;
        }
        if (action === "raise" || action === "bet") {
          inc.pfr_hands += 1;
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to process action stats event: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async flushStats(): Promise<void> {
    if (this.pendingStats.size === 0) return;

    const batch = this.pendingStats;
    this.pendingStats = new Map();

    try {
      for (const [botId, inc] of batch) {
        await this.upsertBotStats(botId, inc);
      }
      this.logger.debug(`Flushed stats for ${batch.size} bot(s)`);
    } catch (error) {
      this.logger.error(
        `Failed to flush bot stats batch: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async upsertBotStats(
    botId: string,
    inc: StatsIncrement,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO bot_stats (id, bot_id, total_hands, total_net, vpip_hands, pfr_hands, wtsd_hands, wmsd_hands, aggressive_actions, passive_actions, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT (bot_id) DO UPDATE SET
         total_hands = bot_stats.total_hands + EXCLUDED.total_hands,
         total_net = bot_stats.total_net + EXCLUDED.total_net,
         vpip_hands = bot_stats.vpip_hands + EXCLUDED.vpip_hands,
         pfr_hands = bot_stats.pfr_hands + EXCLUDED.pfr_hands,
         wtsd_hands = bot_stats.wtsd_hands + EXCLUDED.wtsd_hands,
         wmsd_hands = bot_stats.wmsd_hands + EXCLUDED.wmsd_hands,
         aggressive_actions = bot_stats.aggressive_actions + EXCLUDED.aggressive_actions,
         passive_actions = bot_stats.passive_actions + EXCLUDED.passive_actions,
         updated_at = NOW()`,
      [
        uuidv4(),
        botId,
        inc.total_hands,
        inc.total_net.toString(),
        inc.vpip_hands,
        inc.pfr_hands,
        inc.wtsd_hands,
        inc.wmsd_hands,
        inc.aggressive_actions,
        inc.passive_actions,
      ],
    );
  }

  private getOrCreateIncrement(botId: string): StatsIncrement {
    let inc = this.pendingStats.get(botId);
    if (!inc) {
      inc = {
        total_hands: 0,
        total_net: 0n,
        vpip_hands: 0,
        pfr_hands: 0,
        wtsd_hands: 0,
        wmsd_hands: 0,
        aggressive_actions: 0,
        passive_actions: 0,
      };
      this.pendingStats.set(botId, inc);
    }
    return inc;
  }
}
