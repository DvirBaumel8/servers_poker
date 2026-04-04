import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import * as os from "os";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { TournamentRepository } from "../../repositories/tournament.repository";
import { BatchTournamentPersistenceService } from "../../services/game/batch-tournament-persistence.service";
import {
  SimulationInput,
  SimulationOutput,
  SimBlindLevel,
  PoolMetrics,
} from "../../workers/simulation.types";
import { BLIND_LEVELS, HANDS_PER_LEVEL } from "../../config/tournaments.config";
import { WorkerPool } from "../../workers/worker-pool";

export type SimulationStatus = "pending" | "running" | "completed" | "failed";

interface SimulationJob {
  jobId: string;
  tournamentId: string;
  status: SimulationStatus;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  result?: SimulationOutput;
}

@Injectable()
export class SimulationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationService.name);
  private readonly jobs = new Map<string, SimulationJob>();
  private pool!: WorkerPool;

  constructor(
    private readonly tournamentRepository: TournamentRepository,
    private readonly batchPersistence: BatchTournamentPersistenceService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    const poolSize =
      parseInt(process.env.WORKER_POOL_SIZE ?? "", 10) || os.cpus().length;

    const workerPath = __filename.endsWith(".ts")
      ? path.join(__dirname, "../../workers/pool-tournament-worker.ts")
      : path.join(__dirname, "../../workers/pool-tournament-worker.js");

    const execArgv = __filename.endsWith(".ts")
      ? ["--require", "ts-node/register"]
      : [];

    this.pool = new WorkerPool(poolSize, workerPath, execArgv);
    this.logger.log(`WorkerPool initialised with ${poolSize} workers`);
  }

  onModuleDestroy(): void {
    this.pool.shutdown();
  }

  async startSimulation(tournamentId: string): Promise<{ jobId: string }> {
    const tournament = await this.tournamentRepository.findById(tournamentId);
    if (!tournament) {
      throw new NotFoundException(`Tournament ${tournamentId} not found`);
    }

    const entries = await this.tournamentRepository.getEntries(tournamentId);
    if (entries.length < 2) {
      throw new NotFoundException(
        `Tournament ${tournamentId} has fewer than 2 registered bots`,
      );
    }

    const jobId = uuidv4();
    const now = new Date();
    const job: SimulationJob = {
      jobId,
      tournamentId,
      status: "pending",
      startedAt: now,
    };
    this.jobs.set(jobId, job);

    // Build SimulationInput
    const blindLevels: SimBlindLevel[] = BLIND_LEVELS.map((l) => ({
      level: l.level,
      smallBlind: l.small_blind,
      bigBlind: l.big_blind,
      ante: l.ante,
      handsPerLevel: HANDS_PER_LEVEL,
    }));

    const input: SimulationInput = {
      config: {
        tournamentId,
        blindLevels,
        startingChips: Number(tournament.starting_chips ?? 5000),
        seatsPerTable: 9,
        breakThreshold: 4,
      },
      entries: entries.map((e) => ({
        botId: e.bot_id,
        name: e.bot?.name ?? e.bot_id,
        strategy: (e.bot as any)?.strategy ?? null,
      })),
    };

    job.status = "running";

    // Dispatch to the pool — fire-and-forget; the promise settles when the
    // worker completes the tournament (or the pool rejects on crash/timeout).
    this.pool
      .dispatch(jobId, input)
      .then(async (output: SimulationOutput) => {
        try {
          await this.batchPersistence.persistSimulationResult(
            output,
            this.dataSource,
          );
          job.result = output;
          job.status = "completed";
          job.completedAt = new Date();
          this.logger.log(
            `Simulation ${jobId} completed: ${output.totalHands} hands in ${output.durationMs}ms`,
          );
        } catch (err: any) {
          job.status = "failed";
          job.error = err.message;
          job.completedAt = new Date();
          this.logger.error(
            `Simulation ${jobId} persistence failed: ${err.message}`,
            err.stack,
          );
        }
      })
      .catch((err: Error) => {
        job.status = "failed";
        job.error = err.message;
        job.completedAt = new Date();
        this.logger.error(`Simulation ${jobId} failed: ${err.message}`);
      });

    return { jobId };
  }

  getStatus(jobId: string): SimulationJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  getResult(tournamentId: string): SimulationOutput | null {
    for (const job of this.jobs.values()) {
      if (
        job.tournamentId === tournamentId &&
        job.status === "completed" &&
        job.result
      ) {
        return job.result;
      }
    }
    return null;
  }

  getPoolMetrics(): PoolMetrics {
    return this.pool.getMetrics();
  }
}
