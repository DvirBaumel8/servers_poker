import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { Game } from "../../entities/game.entity";
import { Hand } from "../../entities/hand.entity";
import { HandPlayer } from "../../entities/hand-player.entity";
import { Action, ActionType, ActionStage } from "../../entities/action.entity";
import { GamePlayer } from "../../entities/game-player.entity";
import { BotEvent } from "../../entities/bot-event.entity";
import { isPostgresError, PG_ERROR_CODES } from "../../common/utils";

interface PlayerActionEvent {
  tableId: string;
  gameId: string;
  botId: string;
  action: string;
  amount: bigint;
  pot: bigint;
  handNumber?: number;
  stage?: string;
  chipsAfter?: bigint;
  responseTimeMs?: number;
  actionSeq?: number;
}

interface HandStartedEvent {
  tableId: string;
  gameId: string;
  tournamentId?: string;
  handNumber: number;
  players?: Array<{
    id: string;
    chips: bigint;
    position: number;
  }>;
  dealerBotId?: string;
  smallBlind?: bigint;
  bigBlind?: bigint;
  ante?: bigint;
}

interface HandCompleteEvent {
  tableId: string;
  gameId: string;
  handNumber: number;
  winners: Array<{
    playerId: string;
    amount: bigint;
    hand?: {
      name: string;
      rank: number;
      cards: Array<{ rank: string; suit: string }>;
    };
  }>;
  atShowdown: boolean;
  communityCards?: Array<{ rank: string; suit: string }>;
  pot?: bigint;
  players?: Array<{
    id: string;
    chips: bigint;
    folded: boolean;
    allIn: boolean;
    totalBet?: bigint;
    holeCards?: Array<{ rank: string; suit: string }>;
    cardStatus?: "shown" | "mucked" | "hidden";
  }>;
  showdownSequence?: Array<{
    playerId: string;
    cardStatus: "shown" | "mucked";
    hand?: any;
    order: number;
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
    chips: bigint;
    position?: number;
  }>;
}

@Injectable()
export class GameDataPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(GameDataPersistenceService.name);

  private handIdCache: Map<string, string> = new Map();
  private actionSeqCache: Map<string, number> = new Map();
  private gameStatusCache: Map<string, "running" | "finished"> = new Map();
  /** Per-hand action buffer: flushed as a single bulk INSERT on handComplete. */
  private actionBuffer: Map<string, any[]> = new Map();

  private async withRetry<T>(
    label: string,
    fn: () => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === maxAttempts) {
          this.logger.error(
            `${label} failed after ${maxAttempts} attempts: ${message}`,
            error instanceof Error ? error.stack : undefined,
          );
          throw error;
        }
        this.logger.warn(
          `${label} attempt ${attempt}/${maxAttempts} failed: ${message} — retrying`,
        );
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
    throw new Error("Unreachable");
  }

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
    @InjectRepository(BotEvent)
    private readonly botEventRepository: Repository<BotEvent>,
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Orphaned game cleanup failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
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

      const savedHand = await this.dataSource.transaction(async (manager) => {
        const hand = manager.getRepository(Hand).create({
          game_id: event.gameId,
          tournament_id: event.tournamentId ?? null,
          hand_number: event.handNumber,
          dealer_bot_id: event.dealerBotId || null,
          small_blind: event.smallBlind ?? 10n,
          big_blind: event.bigBlind ?? 20n,
          stage: "preflop",
          pot: 0n,
          community_cards: [],
          started_at: new Date(),
        });

        const result = await manager.getRepository(Hand).save(hand);

        if (event.players) {
          const handPlayers = event.players.map((player) =>
            manager.getRepository(HandPlayer).create({
              hand_id: result.id,
              bot_id: player.id,
              position: player.position,
              start_chips: player.chips,
            }),
          );
          await manager.getRepository(HandPlayer).save(handPlayers);
        }

        return result;
      });

      this.handIdCache.set(cacheKey, savedHand.id);
      this.actionSeqCache.set(cacheKey, 0);
      this.actionBuffer.delete(cacheKey); // safety: discard any stale buffer

      this.logger.debug(
        `Hand ${event.handNumber} created for game ${event.gameId} (ID: ${savedHand.id})`,
      );
    } catch (error) {
      if (isPostgresError(error, PG_ERROR_CODES.UNIQUE_VIOLATION)) {
        this.logger.debug(`Hand ${event.handNumber} already exists, skipping`);
        return;
      }
      this.logger.error(
        `Failed to persist hand start: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async onPlayerAction(event: PlayerActionEvent): Promise<void> {
    try {
      if (!event.handNumber) return;

      const recorded = await this.recordHandActionRow(event);
      if (!recorded) return;

      this.eventEmitter.emit("action.stats.ready", {
        botId: event.botId,
        action: event.action,
        stage: event.stage || "preflop",
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist action: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Inserts an actions row for the current hand (sequence from cache).
   * Returns false if the hand is missing or handNumber is absent.
   */
  private async recordHandActionRow(
    event: PlayerActionEvent,
  ): Promise<boolean> {
    if (!event.handNumber) return false;

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
        return false;
      }
      handId = hand.id;
      this.handIdCache.set(cacheKey, handId);
    }

    // Prefer the authoritative actionSeq from the GameInstance over the local cache counter.
    // The local cache drifts when actions arrive concurrently or after recovery; the game's
    // own counter is the single source of truth for ordering.
    const seq = event.actionSeq ?? (this.actionSeqCache.get(cacheKey) || 0) + 1;
    this.actionSeqCache.set(cacheKey, seq);

    const actionType = this.mapActionType(event.action);
    const stage = this.mapStage(event.stage || "preflop");

    const row = this.actionRepository.create({
      hand_id: handId,
      bot_id: event.botId,
      action_seq: seq,
      action_type: actionType,
      stage: stage,
      amount: event.amount ?? 0n,
      pot_after: event.pot ?? null,
      chips_after: event.chipsAfter ?? null,
      response_time_ms: event.responseTimeMs ?? null,
    });

    // Buffer the action in memory — flushed as bulk INSERT on handComplete
    const buffer = this.actionBuffer.get(cacheKey) || [];
    buffer.push(row);
    this.actionBuffer.set(cacheKey, buffer);

    this.logger.debug(
      `Action ${seq} (${actionType}) buffered for hand ${event.handNumber}`,
    );
    return true;
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

      const capturedHandId = handId;

      // Idempotency guard: skip if hand was already finalized (e.g. after crash recovery)
      const existingHand = await this.handRepository.findOne({
        where: { id: capturedHandId },
        select: ["id", "finished_at"],
      });
      if (existingHand?.finished_at) {
        this.logger.debug(
          `Hand ${event.handNumber} already finalized, skipping duplicate completion`,
        );
        this.handIdCache.delete(cacheKey);
        this.actionSeqCache.delete(cacheKey);
        this.actionBuffer.delete(cacheKey);
        return;
      }

      await this.dataSource.transaction(async (manager) => {
        // Flush buffered actions as a single bulk INSERT
        const bufferedActions = this.actionBuffer.get(cacheKey) || [];
        if (bufferedActions.length > 0) {
          await manager.getRepository(Action).insert(bufferedActions);
        }

        await manager.getRepository(Hand).update(capturedHandId, {
          stage: "showdown",
          pot: event.pot ?? 0n,
          community_cards: event.communityCards || [],
          finished_at: new Date(),
        });

        const winnerIds = new Set(event.winners.map((w) => w.playerId));

        for (const winner of event.winners) {
          await manager.getRepository(HandPlayer).update(
            { hand_id: capturedHandId, bot_id: winner.playerId },
            {
              amount_won: winner.amount,
              won: true,
              saw_showdown: event.atShowdown,
              best_hand: winner.hand || null,
            },
          );

          await manager
            .getRepository(GamePlayer)
            .increment(
              { game_id: event.gameId, bot_id: winner.playerId },
              "hands_won",
              1,
            );
        }

        if (event.players) {
          for (const player of event.players) {
            const cardStatus =
              player.cardStatus ??
              (player.folded
                ? "hidden"
                : event.atShowdown
                  ? "shown"
                  : "hidden");
            const isWinner = winnerIds.has(player.id);
            await manager.getRepository(HandPlayer).update(
              { hand_id: capturedHandId, bot_id: player.id },
              {
                end_chips: player.chips,
                folded: player.folded,
                all_in: player.allIn,
                saw_showdown: event.atShowdown && !player.folded,
                amount_bet: player.totalBet ?? 0n,
                hole_cards: player.holeCards || [],
                card_status: cardStatus,
                // Explicitly clear winner fields for non-winners so that stale data from
                // a previous (buggy or partial) run of this hand cannot survive.
                ...(isWinner ? {} : { won: false, amount_won: 0n }),
              },
            );

            await manager
              .getRepository(GamePlayer)
              .increment(
                { game_id: event.gameId, bot_id: player.id },
                "hands_played",
                1,
              );
          }
        }

        await manager
          .getRepository(Game)
          .increment({ id: event.gameId }, "total_hands", 1);
      });

      this.eventEmitter.emit("hand.stats.ready", {
        gameId: event.gameId,
        handNumber: event.handNumber,
        atShowdown: event.atShowdown,
        winners: event.winners.map((w) => ({
          playerId: w.playerId,
          amount: w.amount,
        })),
        players: (event.players || []).map((p) => ({
          id: p.id,
          folded: p.folded,
          totalBet: p.totalBet ?? 0n,
        })),
      });

      this.handIdCache.delete(cacheKey);
      this.actionSeqCache.delete(cacheKey);
      this.actionBuffer.delete(cacheKey);

      this.logger.debug(
        `Hand ${event.handNumber} completed for game ${event.gameId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist hand completion: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
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
        const sortedPlayers = [...event.players].sort((a, b) =>
          a.chips > b.chips ? -1 : a.chips < b.chips ? 1 : 0,
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
        error instanceof Error ? error.stack : undefined,
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
    handNumber?: number;
    stage?: string;
    pot?: bigint;
    chipsAfter?: bigint;
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to log bot event: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return;
    }

    if (event.handNumber == null) return;

    try {
      await this.recordHandActionRow({
        tableId: "",
        gameId: event.gameId,
        handNumber: event.handNumber,
        botId: event.playerId,
        action: "fold",
        amount: 0n,
        pot: event.pot ?? 0n,
        stage: event.stage,
        chipsAfter: event.chipsAfter,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to persist penalty fold action: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
