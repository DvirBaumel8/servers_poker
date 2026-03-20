import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { v4 as uuidv4 } from "uuid";
import { GameStateRepository } from "../repositories/game-state.repository";
import { GameStateSnapshot } from "../entities/game-state-snapshot.entity";

export interface GameState {
  gameId: string;
  tableId: string;
  tournamentId?: string;
  handNumber: number;
  stage: string;
  dealerIndex: number;
  pot: number;
  currentBet: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  startingChips: number;
  turnTimeoutMs: number;
  communityCards: Array<{ rank: string; suit: string }>;
  activePlayerId: string | null;
  players: Array<{
    id: string;
    name: string;
    endpoint: string;
    chips: number;
    holeCards: Array<{ rank: string; suit: string }>;
    folded: boolean;
    allIn: boolean;
    strikes: number;
    disconnected: boolean;
    currentBet: number;
  }>;
  potState?: {
    mainPot: number;
    sidePots: Array<{ amount: number; eligiblePlayers: string[] }>;
  };
  bettingRoundState?: {
    currentBet: number;
    playerBets: Record<string, number>;
    actedPlayers: string[];
    lastRaiseAmount: number;
  };
  actionLog: Array<{ message: string; timestamp: number }>;
}

@Injectable()
export class GameStatePersistenceService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GameStatePersistenceService.name);
  private readonly serverInstanceId: string;
  private readonly persistenceEnabled: boolean;
  private readonly persistenceIntervalMs: number;
  private readonly cleanupIntervalMs: number;

  private cleanupInterval?: ReturnType<typeof setInterval>;
  private pendingSnapshots = new Map<string, GameState>();
  private persistenceInterval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly gameStateRepository: GameStateRepository,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.serverInstanceId = uuidv4();
    this.persistenceEnabled =
      this.configService.get<string>("GAME_STATE_PERSISTENCE", "true") ===
      "true";
    this.persistenceIntervalMs = this.configService.get<number>(
      "GAME_STATE_PERSIST_INTERVAL_MS",
      5000,
    );
    this.cleanupIntervalMs = this.configService.get<number>(
      "GAME_STATE_CLEANUP_INTERVAL_MS",
      3600000,
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.persistenceEnabled) {
      this.logger.warn("Game state persistence is DISABLED");
      return;
    }

    this.logger.log(
      `Initializing game state persistence (instance: ${this.serverInstanceId})`,
    );

    this.persistenceInterval = setInterval(() => {
      this.flushPendingSnapshots().catch((e) =>
        this.logger.error(`Failed to flush snapshots: ${e.message}`),
      );
    }, this.persistenceIntervalMs);

    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSnapshots().catch((e) =>
        this.logger.error(`Failed to cleanup snapshots: ${e.message}`),
      );
    }, this.cleanupIntervalMs);

    this.eventEmitter.on(
      "game.stateUpdated",
      (event: { state: any; tableId?: string; gameId?: string }) => {
        const raw = event.state;
        const adapted: GameState = {
          gameId: raw.gameId || event.gameId || "",
          tableId: raw.tableId || event.tableId || "",
          tournamentId: raw.tournamentId,
          handNumber: raw.handNumber || 0,
          stage: raw.stage || "waiting",
          dealerIndex: raw.dealerIndex ?? 0,
          pot: raw.pot || 0,
          currentBet: raw.currentBet || 0,
          smallBlind: raw.smallBlind || 10,
          bigBlind: raw.bigBlind || 20,
          ante: raw.ante || 0,
          startingChips: raw.startingChips || 1000,
          turnTimeoutMs: raw.turnTimeoutMs || 10000,
          communityCards: raw.communityCards || [],
          activePlayerId: raw.activePlayerId || null,
          players: (raw.players || []).map((p: any) => ({
            id: p.id,
            name: p.name || "",
            endpoint: p.endpoint || "",
            chips: p.chips || 0,
            holeCards: p.holeCards || [],
            folded: p.folded || false,
            allIn: p.allIn || false,
            strikes: p.strikes || 0,
            disconnected: p.disconnected || false,
            currentBet: p.currentBet ?? p.bet ?? 0,
          })),
          actionLog: raw.actionLog || raw.log || [],
        };
        this.queueSnapshot(adapted);
      },
    );

    this.eventEmitter.on(
      "game.finished",
      (event: { tableId: string; gameId: string }) => {
        this.markGameCompleted(event.gameId).catch((e) =>
          this.logger.error(`Failed to mark game completed: ${e.message}`),
        );
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    await this.flushPendingSnapshots();
    this.logger.log("Game state persistence service stopped");
  }

  getServerInstanceId(): string {
    return this.serverInstanceId;
  }

  queueSnapshot(state: GameState): void {
    if (!this.persistenceEnabled) return;
    this.pendingSnapshots.set(state.gameId, state);
  }

  async saveSnapshot(state: GameState): Promise<void> {
    if (!this.persistenceEnabled) return;

    try {
      await this.gameStateRepository.saveSnapshot({
        game_id: state.gameId,
        table_id: state.tableId,
        tournament_id: state.tournamentId || null,
        status: "active",
        hand_number: state.handNumber,
        game_stage: state.stage,
        dealer_index: state.dealerIndex,
        pot: state.pot,
        current_bet: state.currentBet,
        small_blind: state.smallBlind,
        big_blind: state.bigBlind,
        ante: state.ante,
        starting_chips: state.startingChips,
        turn_timeout_ms: state.turnTimeoutMs,
        community_cards: state.communityCards,
        active_player_id: state.activePlayerId,
        players: state.players,
        pot_state: state.potState || null,
        betting_round_state: state.bettingRoundState || null,
        server_instance_id: this.serverInstanceId,
        last_action_at: new Date(),
        action_log: state.actionLog?.slice(-100) ?? [],
      });
    } catch (error) {
      this.logger.error(
        `Failed to save snapshot for game ${state.gameId}: ${error}`,
      );
    }
  }

  async getRecoverableGames(): Promise<GameStateSnapshot[]> {
    if (!this.persistenceEnabled) return [];

    try {
      const snapshots = await this.gameStateRepository.getAllActiveSnapshots();

      const recoverableMinutes = this.configService.get<number>(
        "GAME_STATE_RECOVERY_WINDOW_MINUTES",
        30,
      );
      const cutoff = new Date(Date.now() - recoverableMinutes * 60 * 1000);

      return snapshots.filter((s) => {
        const lastUpdate = s.last_action_at || s.updated_at;
        return lastUpdate > cutoff;
      });
    } catch (error) {
      this.logger.error(`Failed to get recoverable games: ${error}`);
      return [];
    }
  }

  async recoverGame(snapshotId: string): Promise<GameStateSnapshot | null> {
    if (!this.persistenceEnabled) return null;

    try {
      const snapshot =
        await this.gameStateRepository.getActiveSnapshot(snapshotId);
      if (!snapshot) {
        this.logger.warn(`Snapshot ${snapshotId} not found for recovery`);
        return null;
      }

      await this.gameStateRepository.markAsRecovered(
        snapshot.id,
        this.serverInstanceId,
      );

      this.logger.log(
        `Recovered game ${snapshot.game_id} from snapshot ${snapshot.id}`,
      );

      return snapshot;
    } catch (error) {
      this.logger.error(`Failed to recover game from snapshot: ${error}`);
      return null;
    }
  }

  async markGameCompleted(gameId: string): Promise<void> {
    if (!this.persistenceEnabled) return;

    try {
      this.pendingSnapshots.delete(gameId);
      await this.gameStateRepository.markAsCompleted(gameId);
      this.logger.debug(`Marked game ${gameId} as completed`);
    } catch (error) {
      this.logger.error(`Failed to mark game ${gameId} as completed: ${error}`);
    }
  }

  private async flushPendingSnapshots(): Promise<void> {
    if (this.pendingSnapshots.size === 0) return;

    const snapshots = Array.from(this.pendingSnapshots.values());
    this.pendingSnapshots.clear();

    for (const state of snapshots) {
      await this.saveSnapshot(state);
    }

    this.logger.debug(`Flushed ${snapshots.length} game state snapshots`);
  }

  private async cleanupOldSnapshots(): Promise<void> {
    try {
      const deleted = await this.gameStateRepository.deleteOldSnapshots(7);
      if (deleted > 0) {
        this.logger.log(`Cleaned up ${deleted} old game state snapshots`);
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup old snapshots: ${error}`);
    }
  }

  async getActiveGameCount(): Promise<number> {
    const snapshots = await this.gameStateRepository.getAllActiveSnapshots();
    return snapshots.length;
  }

  async getGameSnapshot(gameId: string): Promise<GameStateSnapshot | null> {
    return this.gameStateRepository.getActiveSnapshot(gameId);
  }

  async getTableSnapshot(tableId: string): Promise<GameStateSnapshot | null> {
    return this.gameStateRepository.getActiveSnapshotByTable(tableId);
  }
}
