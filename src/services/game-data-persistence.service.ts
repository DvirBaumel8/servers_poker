import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { Game } from "../entities/game.entity";
import { Hand } from "../entities/hand.entity";
import { HandPlayer } from "../entities/hand-player.entity";
import { Action, ActionType, ActionStage } from "../entities/action.entity";
import { GamePlayer } from "../entities/game-player.entity";
import { BotStats } from "../entities/bot-stats.entity";
import { BotEvent } from "../entities/bot-event.entity";
import { ChipMovement } from "../entities/chip-movement.entity";

interface PlayerActionEvent {
  tableId: string;
  gameId: string;
  botId: string;
  action: string;
  amount: number;
  pot: number;
  handNumber?: number;
  stage?: string;
  chipsAfter?: number;
  responseTimeMs?: number;
}

interface HandStartedEvent {
  tableId: string;
  gameId: string;
  handNumber: number;
  players?: Array<{
    id: string;
    chips: number;
    position: number;
  }>;
  dealerBotId?: string;
  smallBlind?: number;
  bigBlind?: number;
}

interface HandCompleteEvent {
  tableId: string;
  gameId: string;
  handNumber: number;
  winners: Array<{
    playerId: string;
    amount: number;
    hand?: {
      name: string;
      rank: number;
      cards: Array<{ rank: string; suit: string }>;
    };
  }>;
  atShowdown: boolean;
  communityCards?: Array<{ rank: string; suit: string }>;
  pot?: number;
  players?: Array<{
    id: string;
    chips: number;
    folded: boolean;
    allIn: boolean;
    totalBet?: number;
  }>;
}

interface GameFinishedEvent {
  tableId: string;
  gameId: string;
  reason: string;
  winnerId?: string;
  winnerName?: string;
  handNumber?: number;
  players?: Array<{
    id: string;
    chips: number;
    position?: number;
  }>;
}

@Injectable()
export class GameDataPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(GameDataPersistenceService.name);

  private handIdCache: Map<string, string> = new Map();
  private actionSeqCache: Map<string, number> = new Map();
  private gameStatusCache: Map<string, "running" | "finished"> = new Map();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    @InjectRepository(Hand)
    private readonly handRepository: Repository<Hand>,
    @InjectRepository(HandPlayer)
    private readonly handPlayerRepository: Repository<HandPlayer>,
    @InjectRepository(Action)
    private readonly actionRepository: Repository<Action>,
    @InjectRepository(GamePlayer)
    private readonly gamePlayerRepository: Repository<GamePlayer>,
    @InjectRepository(BotStats)
    private readonly botStatsRepository: Repository<BotStats>,
    @InjectRepository(BotEvent)
    private readonly botEventRepository: Repository<BotEvent>,
    @InjectRepository(ChipMovement)
    private readonly chipMovementRepository: Repository<ChipMovement>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log("Game Data Persistence Service initialized");

    this.eventEmitter.on("game.handStarted", this.onHandStarted.bind(this));
    this.eventEmitter.on("game.playerAction", this.onPlayerAction.bind(this));
    this.eventEmitter.on("game.handComplete", this.onHandComplete.bind(this));
    this.eventEmitter.on("game.finished", this.onGameFinished.bind(this));
    this.eventEmitter.on("game.penaltyFold", this.onPenaltyFold.bind(this));

    await this.cleanupOrphanedGames();
  }

  private async cleanupOrphanedGames(): Promise<void> {
    try {
      const orphaned = await this.gameRepository.find({
        where: { status: "running" as any },
      });

      if (orphaned.length > 0) {
        for (const game of orphaned) {
          await this.gameRepository.update(game.id, {
            status: "finished" as any,
            finished_at: new Date(),
          });

          await this.dataSource.query(
            `UPDATE game_players SET end_chips = COALESCE(end_chips, start_chips) WHERE game_id = $1 AND end_chips IS NULL`,
            [game.id],
          );

          await this.dataSource.query(
            `UPDATE tables SET status = 'waiting' WHERE id = $1 AND status = 'running'`,
            [game.table_id],
          );
        }

        this.logger.warn(
          `Cleaned up ${orphaned.length} orphaned game(s) from previous session`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Orphaned game cleanup failed: ${error.message}`);
    }
  }

  private async onHandStarted(event: HandStartedEvent): Promise<void> {
    try {
      const cacheKey = `${event.gameId}:${event.handNumber}`;

      if (this.gameStatusCache.get(event.gameId) !== "running") {
        await this.gameRepository.update(event.gameId, {
          status: "running",
          started_at: new Date(),
        });
        this.gameStatusCache.set(event.gameId, "running");
        this.logger.debug(`Game ${event.gameId} status updated to running`);
      }

      const hand = this.handRepository.create({
        game_id: event.gameId,
        hand_number: event.handNumber,
        dealer_bot_id: event.dealerBotId || null,
        small_blind: event.smallBlind || 10,
        big_blind: event.bigBlind || 20,
        stage: "preflop",
        pot: 0,
        community_cards: [],
        started_at: new Date(),
      });

      const savedHand = await this.handRepository.save(hand);
      this.handIdCache.set(cacheKey, savedHand.id);
      this.actionSeqCache.set(cacheKey, 0);

      if (event.players) {
        for (const player of event.players) {
          const handPlayer = this.handPlayerRepository.create({
            hand_id: savedHand.id,
            bot_id: player.id,
            position: player.position,
            start_chips: player.chips,
          });
          await this.handPlayerRepository.save(handPlayer);
        }
      }

      this.logger.debug(
        `Hand ${event.handNumber} created for game ${event.gameId} (ID: ${savedHand.id})`,
      );
    } catch (error) {
      if ((error as any)?.code === "23505") {
        this.logger.debug(`Hand ${event.handNumber} already exists, skipping`);
        return;
      }
      this.logger.error(
        `Failed to persist hand start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async onPlayerAction(event: PlayerActionEvent): Promise<void> {
    try {
      if (!event.handNumber) return;

      const cacheKey = `${event.gameId}:${event.handNumber}`;
      let handId = this.handIdCache.get(cacheKey);

      if (!handId) {
        const hand = await this.handRepository.findOne({
          where: { game_id: event.gameId, hand_number: event.handNumber },
        });
        if (!hand) {
          this.logger.warn(
            `Hand ${event.handNumber} not found for game ${event.gameId}, skipping action`,
          );
          return;
        }
        handId = hand.id;
        this.handIdCache.set(cacheKey, handId);
      }

      const seq = (this.actionSeqCache.get(cacheKey) || 0) + 1;
      this.actionSeqCache.set(cacheKey, seq);

      const actionType = this.mapActionType(event.action);
      const stage = this.mapStage(event.stage || "preflop");

      const action = this.actionRepository.create({
        hand_id: handId,
        bot_id: event.botId,
        action_seq: seq,
        action_type: actionType,
        stage: stage,
        amount: event.amount || 0,
        pot_after: event.pot || null,
        chips_after: event.chipsAfter || null,
        response_time_ms: event.responseTimeMs || null,
      });

      await this.actionRepository.save(action);

      this.recordPlayerActionEvent(event).catch((e) =>
        this.logger.error(`Action stats failed: ${e.message}`),
      );

      this.logger.debug(
        `Action ${seq} (${actionType}) recorded for hand ${event.handNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist action: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async onHandComplete(event: HandCompleteEvent): Promise<void> {
    try {
      const cacheKey = `${event.gameId}:${event.handNumber}`;
      let handId = this.handIdCache.get(cacheKey);

      if (!handId) {
        const hand = await this.handRepository.findOne({
          where: { game_id: event.gameId, hand_number: event.handNumber },
        });
        if (!hand) {
          this.logger.warn(
            `Hand ${event.handNumber} not found for completion, skipping`,
          );
          return;
        }
        handId = hand.id;
      }

      await this.handRepository.update(handId, {
        stage: "showdown",
        pot: event.pot || 0,
        community_cards: event.communityCards || [],
        finished_at: new Date(),
      });

      for (const winner of event.winners) {
        await this.handPlayerRepository.update(
          { hand_id: handId, bot_id: winner.playerId },
          {
            amount_won: winner.amount,
            won: true,
            saw_showdown: event.atShowdown,
            best_hand: winner.hand || null,
          },
        );

        await this.gamePlayerRepository.increment(
          { game_id: event.gameId, bot_id: winner.playerId },
          "hands_won",
          1,
        );
      }

      if (event.players) {
        for (const player of event.players) {
          await this.handPlayerRepository.update(
            { hand_id: handId, bot_id: player.id },
            {
              end_chips: player.chips,
              folded: player.folded,
              all_in: player.allIn,
              saw_showdown: event.atShowdown && !player.folded,
              amount_bet: player.totalBet ?? 0,
            },
          );

          await this.gamePlayerRepository.increment(
            { game_id: event.gameId, bot_id: player.id },
            "hands_played",
            1,
          );
        }
      }

      await this.gameRepository.increment(
        { id: event.gameId },
        "total_hands",
        1,
      );

      this.handIdCache.delete(cacheKey);
      this.actionSeqCache.delete(cacheKey);

      this.updateBotStats(event).catch((e) =>
        this.logger.error(`Bot stats update failed: ${e.message}`),
      );
      this.recordChipMovements(event).catch((e) =>
        this.logger.error(`Chip movement recording failed: ${e.message}`),
      );

      this.logger.debug(
        `Hand ${event.handNumber} completed for game ${event.gameId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist hand completion: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async onGameFinished(event: GameFinishedEvent): Promise<void> {
    try {
      await this.gameRepository.update(event.gameId, {
        status: "finished",
        total_hands: event.handNumber || 0,
        finished_at: new Date(),
      });

      if (event.players) {
        const sortedPlayers = [...event.players].sort(
          (a, b) => (b.chips || 0) - (a.chips || 0),
        );

        for (let i = 0; i < sortedPlayers.length; i++) {
          const player = sortedPlayers[i];
          await this.gamePlayerRepository.update(
            { game_id: event.gameId, bot_id: player.id },
            {
              end_chips: player.chips,
              finish_position: i + 1,
            },
          );
        }
      }

      this.gameStatusCache.delete(event.gameId);

      this.logger.log(
        `Game ${event.gameId} finished: ${event.reason}` +
          (event.winnerName ? ` - Winner: ${event.winnerName}` : ""),
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist game finish: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private mapActionType(action: string): ActionType {
    const normalized = action.toLowerCase().replace(/[_-]/g, "");
    const mapping: Record<string, ActionType> = {
      fold: "fold",
      check: "check",
      call: "call",
      bet: "bet",
      raise: "raise",
      allin: "all_in",
      smallblind: "small_blind",
      bigblind: "big_blind",
      ante: "ante",
    };
    return mapping[normalized] || "check";
  }

  private mapStage(stage: string): ActionStage {
    const normalized = stage.toLowerCase().replace(/[_-]/g, "");
    const mapping: Record<string, ActionStage> = {
      preflop: "preflop",
      flop: "flop",
      turn: "turn",
      river: "river",
    };
    return mapping[normalized] || "preflop";
  }

  private async onPenaltyFold(event: {
    gameId: string;
    playerId: string;
    strikes: number;
  }): Promise<void> {
    try {
      const botEvent = this.botEventRepository.create({
        bot_id: event.playerId,
        game_id: event.gameId,
        event_type: event.strikes >= 3 ? "disconnect" : "strike",
        details: `Penalty fold applied (strike ${event.strikes})`,
        context: { strikes: event.strikes },
      });
      await this.botEventRepository.save(botEvent);
    } catch (error: any) {
      this.logger.error(`Failed to log bot event: ${error.message}`);
    }
  }

  private async updateBotStats(event: HandCompleteEvent): Promise<void> {
    for (const player of event.players || []) {
      try {
        await this.ensureBotStatsExists(player.id);

        const isWinner = event.winners.some((w) => w.playerId === player.id);
        const winAmount = event.winners
          .filter((w) => w.playerId === player.id)
          .reduce((sum, w) => sum + w.amount, 0);
        const betAmount = player.totalBet ?? 0;
        const netChange = winAmount - betAmount;

        await this.botStatsRepository.increment(
          { bot_id: player.id },
          "total_hands",
          1,
        );

        if (netChange !== 0) {
          await this.dataSource.query(
            `UPDATE bot_stats SET total_net = total_net + $1, updated_at = NOW() WHERE bot_id = $2`,
            [netChange, player.id],
          );
        }

        if (event.atShowdown && !player.folded) {
          await this.botStatsRepository.increment(
            { bot_id: player.id },
            "wtsd_hands",
            1,
          );
          if (isWinner) {
            await this.botStatsRepository.increment(
              { bot_id: player.id },
              "wmsd_hands",
              1,
            );
          }
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to update bot stats for ${player.id}: ${error.message}`,
        );
      }
    }
  }

  private async recordChipMovements(event: HandCompleteEvent): Promise<void> {
    try {
      const cacheKey = `${event.gameId}:${event.handNumber}`;
      const handId = this.handIdCache.get(cacheKey) || null;

      for (const player of event.players || []) {
        const betAmount = player.totalBet ?? 0;
        if (betAmount > 0) {
          const betMovement = this.chipMovementRepository.create({
            bot_id: player.id,
            game_id: event.gameId,
            hand_id: handId,
            movement_type: "bet" as const,
            amount: -betAmount,
            balance_before: player.chips + betAmount,
            balance_after: player.chips,
            description: `Hand #${event.handNumber} bet`,
          });
          await this.chipMovementRepository.save(betMovement);
        }
      }

      for (const winner of event.winners) {
        const player = event.players?.find((p) => p.id === winner.playerId);
        if (!player) continue;

        const winMovement = this.chipMovementRepository.create({
          bot_id: winner.playerId,
          game_id: event.gameId,
          hand_id: handId,
          movement_type: "win" as const,
          amount: winner.amount,
          balance_before: player.chips - winner.amount,
          balance_after: player.chips,
          description: `Hand #${event.handNumber} win`,
        });
        await this.chipMovementRepository.save(winMovement);
      }
    } catch (error: any) {
      this.logger.error(`Failed to record chip movements: ${error.message}`);
    }
  }

  private async recordPlayerActionEvent(
    event: PlayerActionEvent,
  ): Promise<void> {
    try {
      const action = event.action?.toLowerCase();
      if (action === "raise" || action === "bet") {
        await this.incrementBotStatField(event.botId, "aggressive_actions");
      } else if (action === "call" || action === "check") {
        await this.incrementBotStatField(event.botId, "passive_actions");
      }

      if (
        event.stage?.toLowerCase() === "preflop" ||
        event.stage?.toLowerCase() === "pre-flop"
      ) {
        if (action === "call" || action === "raise" || action === "bet") {
          await this.incrementBotStatField(event.botId, "vpip_hands");
        }
        if (action === "raise" || action === "bet") {
          await this.incrementBotStatField(event.botId, "pfr_hands");
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to record player action stats: ${error.message}`,
      );
    }
  }

  private async ensureBotStatsExists(botId: string): Promise<void> {
    const exists = await this.botStatsRepository.findOne({
      where: { bot_id: botId },
    });
    if (!exists) {
      try {
        const stats = this.botStatsRepository.create({
          bot_id: botId,
          total_hands: 0,
          total_tournaments: 0,
          tournament_wins: 0,
          total_net: 0,
          vpip_hands: 0,
          pfr_hands: 0,
          wtsd_hands: 0,
          wmsd_hands: 0,
          aggressive_actions: 0,
          passive_actions: 0,
        });
        await this.botStatsRepository.save(stats);
      } catch {
        // Ignore unique constraint violation (another call created it)
      }
    }
  }

  private async incrementBotStatField(
    botId: string,
    field: string,
  ): Promise<void> {
    await this.ensureBotStatsExists(botId);
    await this.botStatsRepository.increment({ bot_id: botId }, field, 1);
  }
}
