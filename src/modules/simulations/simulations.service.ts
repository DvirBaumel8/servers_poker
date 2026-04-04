import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Worker } from "worker_threads";
import * as path from "path";
import { BotRepository } from "../../repositories/bot.repository";
import { SimulationRepository } from "../../repositories/simulation.repository";
import { CreateSimulationDto } from "./dto/create-simulation.dto";
import {
  resolveOpponentsFromDistribution,
  OpponentBotConfig,
  OpponentProfile,
} from "./opponent-profiles";
import type {
  HandSimulationInput,
  HandSimulationOutput,
  HandSimWorkerMessage,
} from "../../workers/simulation.types";
import type { HeatmapData } from "../../entities/simulation-result.entity";

/** Fixed blind structure for all simulations (can be made configurable later). */
const SIM_SMALL_BLIND = 10;
const SIM_BIG_BLIND = 20;

/** Maximum concurrent simulations per user (prevents resource exhaustion). */
const MAX_CONCURRENT_PER_USER = 1;

@Injectable()
export class SimulationsService {
  private readonly logger = new Logger(SimulationsService.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly simulationRepository: SimulationRepository,
  ) {}

  /**
   * Create and immediately enqueue a new simulation.
   * Enforces a concurrency limit of MAX_CONCURRENT_PER_USER per user.
   */
  async create(userId: string, dto: CreateSimulationDto) {
    // 1. Verify bot ownership
    const bot = await this.botRepository.findById(dto.botId);
    if (!bot) throw new NotFoundException("Bot not found");
    if (bot.user_id !== userId) {
      throw new ForbiddenException("You do not own this bot");
    }

    // 2. Enforce concurrency limit
    const activeCount =
      await this.simulationRepository.countActiveForUser(userId);
    if (activeCount >= MAX_CONCURRENT_PER_USER) {
      throw new ConflictException(
        `You already have a simulation running. Only ${MAX_CONCURRENT_PER_USER} concurrent simulation is allowed per user.`,
      );
    }

    // 3. Load opponent bots for the selected profile (sliced to tableSize - 1)
    const tableSize = dto.tableSize ?? 9;
    const opponents = await this.resolveOpponents(
      dto.opponentProfile,
      bot.id,
      tableSize,
    );

    // 4. Persist the simulation record
    const simulation = await this.simulationRepository.create({
      user_id: userId,
      bot_id: dto.botId,
      status: "PENDING",
      hand_count: dto.handCount,
      opponent_profile: dto.opponentProfile,
      table_size: tableSize,
      config_snapshot: {
        botName: bot.name,
        strategy: bot.strategy,
        opponents: opponents.map((o) => ({ id: o.id, name: o.name })),
        smallBlind: SIM_SMALL_BLIND,
        bigBlind: SIM_BIG_BLIND,
        tableSize,
      },
    });

    // 5. Dispatch worker (fire-and-forget; results are handled asynchronously)
    this.dispatchWorker({
      simulationId: simulation.id,
      targetBot: { id: bot.id, name: bot.name, strategy: bot.strategy as any },
      opponents,
      handCount: dto.handCount,
      smallBlind: SIM_SMALL_BLIND,
      bigBlind: SIM_BIG_BLIND,
    });

    return { simulationId: simulation.id, status: simulation.status };
  }

  async findAll(userId: string, limit = 20, offset = 0) {
    const [simulations, total] = await this.simulationRepository.findByUserId(
      userId,
      limit,
      offset,
    );
    return { simulations, total };
  }

  async findOne(id: string, userId: string) {
    const simulation = await this.simulationRepository.findById(id);
    if (!simulation) throw new NotFoundException("Simulation not found");
    if (simulation.user_id !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const progress =
      simulation.hand_count > 0
        ? Math.round((simulation.progress_hands / simulation.hand_count) * 100)
        : 0;

    return { ...simulation, progress };
  }

  async getResult(id: string, userId: string) {
    const simulation = await this.simulationRepository.findById(id);
    if (!simulation) throw new NotFoundException("Simulation not found");
    if (simulation.user_id !== userId) {
      throw new ForbiddenException("Access denied");
    }
    if (simulation.status !== "COMPLETED") {
      throw new ConflictException(
        `Simulation is ${simulation.status}. Results are only available after completion.`,
      );
    }

    const result = await this.simulationRepository.findResult(id);
    if (!result) throw new NotFoundException("Simulation result not found");

    return result;
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Resolve opponent bots for a profile using the lineup distribution.
   * Builds a mixed seat composition (e.g. 6 Sharks + 2 Nits for AGGRESSIVE_SHARKS)
   * and shuffles the result so seat order is varied each run.
   */
  private async resolveOpponents(
    profile: string,
    _excludeBotId: string,
    tableSize: number = 9,
  ): Promise<OpponentBotConfig[]> {
    const profileKey = (profile as OpponentProfile) ?? "CURRENT_META";
    return resolveOpponentsFromDistribution(profileKey, tableSize);
  }

  /**
   * Spawn a Worker Thread for the simulation.
   * Handles progress updates, results, and errors asynchronously.
   * Uses the compiled JS worker path (dist/) in production,
   * ts-node path in development.
   */
  private dispatchWorker(input: HandSimulationInput): void {
    const workerPath = path.join(
      __dirname,
      "../../workers/simulation-hand-worker",
    );

    let worker: Worker;
    try {
      worker = new Worker(require.resolve(workerPath), {
        workerData: null,
      });
    } catch {
      // Fallback: try .js extension (compiled dist)
      worker = new Worker(workerPath + ".js");
    }

    // Mark as RUNNING once worker is ready
    worker.once("message", (msg: HandSimWorkerMessage) => {
      if (msg.type === "ready") {
        this.simulationRepository
          .updateStatus(input.simulationId, "RUNNING")
          .catch((err) =>
            this.logger.error(`Failed to set RUNNING: ${err.message}`),
          );
        worker.postMessage(input);
      }
    });

    worker.on("message", (msg: HandSimWorkerMessage) => {
      if (msg.type === "progress") {
        this.simulationRepository
          .updateProgress(msg.simulationId, msg.handsCompleted)
          .catch(() => {});
      } else if (msg.type === "result") {
        this.handleWorkerResult(msg.output).catch((err) =>
          this.logger.error(
            `Failed to persist simulation result ${msg.simulationId}: ${err.message}`,
            err.stack,
          ),
        );
      } else if (msg.type === "error") {
        this.logger.error(
          `Simulation ${msg.simulationId} worker error: ${msg.error}`,
          msg.stack,
        );
        this.simulationRepository
          .updateStatus(msg.simulationId, "FAILED", {
            completed_at: new Date(),
          })
          .catch(() => {});
      }
    });

    worker.on("error", (err: Error) => {
      this.logger.error(
        `Simulation worker process error for ${input.simulationId}: ${err.message}`,
        err.stack,
      );
      this.simulationRepository
        .updateStatus(input.simulationId, "FAILED", {
          completed_at: new Date(),
        })
        .catch(() => {});
    });
  }

  /**
   * Compute aggregated analytics from raw worker output and persist them.
   */
  private async handleWorkerResult(
    output: HandSimulationOutput,
  ): Promise<void> {
    const {
      simulationId,
      handsPlayed,
      targetBotStartChips,
      targetBotEndChips,
      handsWon,
      vpipHands,
      pfrHands,
      aggressiveActions,
      passiveActions,
    } = output;

    const totalProfit = BigInt(targetBotEndChips) - BigInt(targetBotStartChips);

    // bbPer100 = (totalProfit / bigBlind) * 100 / handsPlayed
    const bbPer100 =
      handsPlayed > 0
        ? (Number(totalProfit) / SIM_BIG_BLIND) * (100 / handsPlayed)
        : 0;

    const winRate = handsPlayed > 0 ? handsWon / handsPlayed : 0;
    const vpip = handsPlayed > 0 ? vpipHands / handsPlayed : 0;
    const pfr = handsPlayed > 0 ? pfrHands / handsPlayed : 0;

    // Aggression Factor: (bets + raises) / calls  — capped at 9999 when calls = 0
    const aggressionFactor =
      passiveActions > 0 ? aggressiveActions / passiveActions : 9999;

    const heatmapData: HeatmapData = output.heatmap;

    // Equity realization not yet implemented (requires showdown equity tracking)
    const equityRealization = 0;

    await this.simulationRepository.saveResult({
      simulationId,
      totalProfit,
      bbPer100,
      winRate,
      vpip,
      pfr,
      aggressionFactor,
      heatmapData,
      equityRealization,
    });

    await this.simulationRepository.updateStatus(simulationId, "COMPLETED", {
      progress_hands: handsPlayed,
      completed_at: new Date(),
    });

    this.logger.log(
      `Simulation ${simulationId} completed: ${handsPlayed} hands, ` +
        `bb/100=${bbPer100.toFixed(1)}, winRate=${(winRate * 100).toFixed(1)}%`,
    );
  }
}
