/**
 * Game Worker Manager Service
 * ===========================
 * Manages the lifecycle of game worker threads.
 * Each game runs in its own isolated worker thread for fault isolation
 * and better CPU utilization.
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Worker } from "worker_threads";
import * as path from "path";
import {
  GameConfig,
  PlayerConfig,
  WorkerEvent,
  WorkerCommand,
  WorkerGameState,
  WorkerInitData,
  isWorkerEvent,
} from "../../workers/messages";

export interface WorkerInfo {
  worker: Worker;
  tableId: string;
  gameDbId: string;
  tournamentId?: string;
  startedAt: Date;
  ready: boolean;
  lastState: WorkerGameState | null;
}

@Injectable()
export class GameWorkerManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameWorkerManagerService.name);
  private readonly workers = new Map<string, WorkerInfo>();
  private readonly workerScriptPath: string;
  private readonly maxConcurrentGames: number;
  private readonly workerTimeout: number;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.enabled =
      this.configService.get<string>("ENABLE_WORKER_THREADS", "false") ===
      "true";
    this.maxConcurrentGames = this.configService.get<number>(
      "MAX_CONCURRENT_GAMES",
      100,
    );
    this.workerTimeout = this.configService.get<number>(
      "WORKER_TIMEOUT",
      30000,
    );

    // Resolve worker script path (compiled JS in dist/)
    this.workerScriptPath = path.resolve(
      __dirname,
      "..",
      "workers",
      "game.worker.js",
    );
  }

  onModuleInit(): void {
    if (this.enabled) {
      this.logger.log(
        `Game Worker Manager initialized (max ${this.maxConcurrentGames} concurrent games)`,
      );
    } else {
      this.logger.log(
        "Game Worker Manager initialized (DISABLED - using in-process games)",
      );
    }
  }

  onModuleDestroy(): void {
    this.logger.log("Shutting down all game workers...");
    for (const [tableId, info] of this.workers) {
      this.logger.log(`Stopping worker for table ${tableId}`);
      this.sendCommand(tableId, { type: "STOP" });
      info.worker.terminate();
    }
    this.workers.clear();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  createGame(config: GameConfig, initialPlayers?: PlayerConfig[]): void {
    if (!this.enabled) {
      throw new Error(
        "Worker threads are disabled. Use LiveGameManagerService instead.",
      );
    }

    if (this.workers.has(config.tableId)) {
      this.logger.warn(`Worker already exists for table ${config.tableId}`);
      return;
    }

    if (this.workers.size >= this.maxConcurrentGames) {
      throw new Error(
        `Maximum concurrent games (${this.maxConcurrentGames}) reached`,
      );
    }

    const workerData: WorkerInitData = {
      gameConfig: config,
      players: initialPlayers,
    };

    const worker = new Worker(this.workerScriptPath, {
      workerData,
    });

    const workerInfo: WorkerInfo = {
      worker,
      tableId: config.tableId,
      gameDbId: config.gameDbId,
      tournamentId: config.tournamentId,
      startedAt: new Date(),
      ready: false,
      lastState: null,
    };

    this.workers.set(config.tableId, workerInfo);

    // Set up event handlers
    worker.on("message", (msg: unknown) => {
      this.handleWorkerMessage(config.tableId, msg);
    });

    worker.on("error", (err) => {
      this.handleWorkerError(config.tableId, err);
    });

    worker.on("exit", (code) => {
      this.handleWorkerExit(config.tableId, code);
    });

    this.logger.log(`Created worker for table ${config.tableId}`);
  }

  addPlayer(tableId: string, player: PlayerConfig): void {
    this.sendCommand(tableId, { type: "ADD_PLAYER", player });
  }

  removePlayer(tableId: string, playerId: string): void {
    this.sendCommand(tableId, { type: "REMOVE_PLAYER", playerId });
  }

  stopGame(tableId: string): void {
    const info = this.workers.get(tableId);
    if (!info) {
      this.logger.warn(`No worker found for table ${tableId}`);
      return;
    }

    this.sendCommand(tableId, { type: "STOP" });

    // Give it a moment to shut down gracefully, then terminate
    setTimeout(() => {
      if (this.workers.has(tableId)) {
        info.worker.terminate();
        this.workers.delete(tableId);
        this.logger.log(`Terminated worker for table ${tableId}`);
      }
    }, 2000);
  }

  updateBlinds(
    tableId: string,
    smallBlind: number,
    bigBlind: number,
    ante?: number,
  ): void {
    this.sendCommand(tableId, {
      type: "UPDATE_BLINDS",
      smallBlind,
      bigBlind,
      ante,
    });
  }

  getGameState(tableId: string): WorkerGameState | null {
    const info = this.workers.get(tableId);
    if (!info) return null;

    // Request fresh state
    this.sendCommand(tableId, { type: "GET_STATE" });

    // Return cached state (will be updated when worker responds)
    return info.lastState;
  }

  hasGame(tableId: string): boolean {
    return this.workers.has(tableId);
  }

  getActiveGameCount(): number {
    return this.workers.size;
  }

  getAllGames(): Array<{
    tableId: string;
    gameDbId: string;
    tournamentId?: string;
    startedAt: Date;
    ready: boolean;
  }> {
    return Array.from(this.workers.values()).map((info) => ({
      tableId: info.tableId,
      gameDbId: info.gameDbId,
      tournamentId: info.tournamentId,
      startedAt: info.startedAt,
      ready: info.ready,
    }));
  }

  private sendCommand(tableId: string, command: WorkerCommand): void {
    const info = this.workers.get(tableId);
    if (!info) {
      this.logger.warn(
        `Cannot send command to non-existent worker: ${tableId}`,
      );
      return;
    }

    try {
      info.worker.postMessage(command);
    } catch (err: any) {
      this.logger.error(
        `Failed to send command to worker ${tableId}: ${err.message}`,
      );
    }
  }

  private handleWorkerMessage(tableId: string, msg: unknown): void {
    if (!isWorkerEvent(msg)) {
      this.logger.warn(`Invalid message from worker ${tableId}`);
      return;
    }

    const event = msg as WorkerEvent;
    const info = this.workers.get(tableId);

    switch (event.type) {
      case "READY":
        if (info) {
          info.ready = true;
        }
        this.logger.log(`Worker for table ${tableId} is ready`);
        break;

      case "STATE_UPDATE":
        if (info) {
          info.lastState = event.state;
        }
        this.eventEmitter.emit("game.stateUpdated", {
          tableId: event.tableId,
          state: event.state,
        });
        break;

      case "PLAYER_JOINED":
        this.eventEmitter.emit("game.playerJoined", {
          tableId: event.tableId,
          playerId: event.playerId,
          playerName: event.playerName,
        });
        break;

      case "PLAYER_LEFT":
        this.eventEmitter.emit("game.playerRemoved", {
          tableId: event.tableId,
          playerId: event.playerId,
        });
        break;

      case "HAND_STARTED":
        this.eventEmitter.emit("game.handStarted", {
          tableId: event.tableId,
          handNumber: event.handNumber,
          dealerName: event.dealerName,
        });
        break;

      case "HAND_COMPLETE":
        this.eventEmitter.emit("game.handComplete", {
          tableId: event.tableId,
          handNumber: event.handNumber,
          winners: event.winners,
          atShowdown: event.atShowdown,
        });
        break;

      case "GAME_FINISHED":
        this.eventEmitter.emit("game.finished", {
          tableId: event.tableId,
          winnerId: event.winnerId,
          winnerName: event.winnerName,
        });
        // Clean up worker
        if (info) {
          info.worker.terminate();
          this.workers.delete(tableId);
          this.logger.log(
            `Game finished, cleaned up worker for table ${tableId}`,
          );
        }
        break;

      case "ERROR":
        this.logger.error(`Worker error for table ${tableId}: ${event.error}`);
        if (event.fatal) {
          this.handleWorkerCrash(tableId, new Error(event.error));
        }
        break;

      case "LOG":
        this.logWorkerMessage(tableId, event.level, event.message);
        break;
    }
  }

  private handleWorkerError(tableId: string, err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    this.logger.error(`Worker ${tableId} error: ${error.message}`, error.stack);
    this.handleWorkerCrash(tableId, error);
  }

  private handleWorkerExit(tableId: string, code: number): void {
    const info = this.workers.get(tableId);
    if (!info) return;

    if (code !== 0) {
      this.logger.error(`Worker ${tableId} exited with code ${code}`);
      this.handleWorkerCrash(tableId, new Error(`Exit code ${code}`));
    } else {
      this.logger.log(`Worker ${tableId} exited normally`);
      this.workers.delete(tableId);
    }
  }

  private handleWorkerCrash(tableId: string, err: Error): void {
    const info = this.workers.get(tableId);
    if (!info) return;

    this.logger.error(`Worker crashed for table ${tableId}: ${err.message}`);

    // Emit error event for clients
    this.eventEmitter.emit("game.error", {
      tableId,
      error: err.message,
      recoverable: true,
    });

    // Clean up
    this.workers.delete(tableId);

    // Emit recovery event so GameRecoveryService can attempt recovery
    this.eventEmitter.emit("game.workerCrash", {
      tableId,
      gameDbId: info.gameDbId,
      tournamentId: info.tournamentId,
      lastState: info.lastState,
      error: err.message,
    });
  }

  private logWorkerMessage(
    tableId: string,
    level: "debug" | "info" | "warn" | "error",
    message: string,
  ): void {
    const prefix = `[Worker:${tableId}]`;
    switch (level) {
      case "debug":
        this.logger.debug(`${prefix} ${message}`);
        break;
      case "info":
        this.logger.log(`${prefix} ${message}`);
        break;
      case "warn":
        this.logger.warn(`${prefix} ${message}`);
        break;
      case "error":
        this.logger.error(`${prefix} ${message}`);
        break;
    }
  }
}
