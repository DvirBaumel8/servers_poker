import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { randomInt } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { TournamentRepository } from "../../repositories/tournament.repository";
import { TournamentPodRepository } from "../../repositories/tournament-pod.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { UserRepository } from "../../repositories/user.repository";
import { TournamentDirectorService } from "../tournaments/tournament-director.service";
import { LockService } from "../../common/redis/lock.service";
import { Tournament } from "../../entities/tournament.entity";
import { TournamentEntry } from "../../entities/tournament-entry.entity";
import { User } from "../../entities/user.entity";
import { MATCHMAKING_CONFIG } from "./matchmaking.config";

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly userRepository: UserRepository,
    private readonly tournamentRepository: TournamentRepository,
    private readonly tournamentPodRepository: TournamentPodRepository,
    private readonly botRepository: BotRepository,
    private readonly tournamentDirector: TournamentDirectorService,
    private readonly eventEmitter: EventEmitter2,
    private readonly lockService: LockService,
  ) {}

  /**
   * 08:00 UTC — Create daily Master Tournament and auto-register all active premium users.
   * Each premium user's highest-priority active bot is registered automatically.
   */
  @Cron(MATCHMAKING_CONFIG.CRON_CREATE, {
    name: "daily-master-create",
    timeZone: "UTC",
  })
  async createDailyMasterTournament(): Promise<void> {
    await this.lockService.withLock(
      { key: "lock:matchmaking:create-daily", ttlMs: 60_000 },
      async () => this.doCreateDailyMasterTournament(),
    );
  }

  private async doCreateDailyMasterTournament(): Promise<void> {
    this.logger.log("08:00 — Creating daily Master Tournament");

    const premiumUsers = await this.dataSource
      .getRepository(User)
      .createQueryBuilder("u")
      .where("u.subscription_status = :status", { status: "active" })
      .andWhere("u.subscription_end > :now", { now: new Date() })
      .getMany();

    if (premiumUsers.length === 0) {
      this.logger.warn("No active premium users — skipping daily tournament");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const tournamentName = `Daily Master ${today}`;

    // Check if today's tournament already exists (idempotency)
    const existing = await this.findTodaysMasterTournament();
    if (existing) {
      this.logger.warn(
        `Daily tournament already exists: ${existing.id} — skipping`,
      );
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const tournamentRepo = manager.getRepository(Tournament);
      const entryRepo = manager.getRepository(TournamentEntry);

      // Create the master tournament
      const tournament = tournamentRepo.create({
        id: uuidv4(),
        name: tournamentName,
        type: "scheduled",
        status: "registering",
        buy_in: 0n,
        starting_chips: 5000n,
        min_players: MATCHMAKING_CONFIG.MIN_PLAYERS,
        max_players: 10000,
        players_per_table: MATCHMAKING_CONFIG.DEFAULT_POD_SIZE,
        turn_timeout_ms: 10000,
        rebuys_allowed: false,
        scheduled_start_at: this.todayAt(21, 0), // 21:00 UTC execution
      });
      await tournamentRepo.save(tournament);

      // Auto-register each premium user's bot
      const allBots = await this.botRepository.findAll(manager);
      const entries: TournamentEntry[] = [];
      for (const user of premiumUsers) {
        const userBot = allBots.find((b) => b.user_id === user.id && b.active);
        if (!userBot) {
          this.logger.warn(
            `User ${user.id} has no active bot — skipping auto-registration`,
          );
          continue;
        }

        const entry = entryRepo.create({
          id: uuidv4(),
          tournament_id: tournament.id,
          bot_id: userBot.id,
          entry_type: "initial" as const,
          payout: 0n,
        });
        entries.push(entry);
      }

      if (entries.length > 0) {
        await entryRepo.insert(entries);
      }

      this.logger.log(
        `Created "${tournamentName}" with ${entries.length} auto-registered players`,
      );
      this.eventEmitter.emit("matchmaking.masterCreated", {
        tournamentId: tournament.id,
        playerCount: entries.length,
      });
    });
  }

  /**
   * 20:55 UTC — Lock the Master Tournament. Calculate daily prize pool from premium revenue.
   * Fisher-Yates shuffle all registered players using crypto.randomBytes.
   * Split into pods of DEFAULT_POD_SIZE. Bulk insert TournamentPod records.
   */
  @Cron(MATCHMAKING_CONFIG.CRON_LOCK, {
    name: "daily-master-lock",
    timeZone: "UTC",
  })
  async lockAndCreatePods(): Promise<void> {
    await this.lockService.withLock(
      { key: "lock:matchmaking:lock-pods", ttlMs: 120_000 },
      async () => this.doLockAndCreatePods(),
    );
  }

  private async doLockAndCreatePods(): Promise<void> {
    this.logger.log("20:55 — Locking Master Tournament & creating pods");

    const tournament = await this.findTodaysMasterTournament();
    if (!tournament) {
      this.logger.warn("No Master Tournament found for today — skipping");
      return;
    }
    if (tournament.status !== "registering") {
      this.logger.warn(
        `Tournament ${tournament.id} status is ${tournament.status}, not registering — skipping`,
      );
      return;
    }

    // Fetch all entries
    const entries = await this.dataSource
      .getRepository(TournamentEntry)
      .find({ where: { tournament_id: tournament.id } });

    if (entries.length < MATCHMAKING_CONFIG.MIN_PLAYERS) {
      this.logger.warn(
        `Only ${entries.length} entries — cancelling tournament`,
      );
      await this.tournamentRepository.update(tournament.id, {
        status: "cancelled",
      });
      this.eventEmitter.emit("matchmaking.cancelled", {
        tournamentId: tournament.id,
        reason: "insufficient_players",
      });
      return;
    }

    // Lock tournament — blocks further registrations
    await this.tournamentRepository.update(tournament.id, {
      status: "running",
    });

    // Calculate daily prize pool
    const dailyPool = await this.calculateDailyPool();
    this.logger.log(`Daily pool: ${dailyPool}`);

    // Fisher-Yates shuffle
    const shuffled = this.shufflePlayers([...entries]);

    // Split into pods
    const podSizes = this.calculatePodSplit(
      shuffled.length,
      MATCHMAKING_CONFIG.DEFAULT_POD_SIZE,
    );
    const podCount = podSizes.length;

    // Distribute prize pool across pods proportionally
    const basePrize = podCount > 0 ? dailyPool / BigInt(podCount) : 0n;
    const remainder = dailyPool - basePrize * BigInt(podCount);

    await this.dataSource.transaction(async (manager) => {
      let offset = 0;
      const pods = podSizes.map((size, i) => {
        const podEntries = shuffled.slice(offset, offset + size);
        offset += size;
        return {
          id: uuidv4(),
          master_tournament_id: tournament.id,
          pod_number: i + 1,
          status: "pending" as const,
          prize_pool: basePrize + (i === 0 ? remainder : 0n),
          player_count: podEntries.length,
          winner_bot_id: undefined,
        };
      });

      await this.tournamentPodRepository.bulkCreate(pods, manager);

      this.logger.log(
        `Created ${pods.length} pods for tournament ${tournament.id}`,
      );
      this.eventEmitter.emit("matchmaking.podsCreated", {
        tournamentId: tournament.id,
        podIds: pods.map((p) => p.id),
        podCount: pods.length,
      });
    });
  }

  /**
   * 21:00 UTC — Execute pods. Pass clean PodID list to TournamentDirector for Worker Thread execution.
   */
  @Cron(MATCHMAKING_CONFIG.CRON_EXECUTE, {
    name: "daily-master-execute",
    timeZone: "UTC",
  })
  async executePods(): Promise<void> {
    await this.lockService.withLock(
      { key: "lock:matchmaking:execute-pods", ttlMs: 120_000 },
      async () => this.doExecutePods(),
    );
  }

  private async doExecutePods(): Promise<void> {
    this.logger.log("21:00 — Executing tournament pods");

    const tournament = await this.findTodaysMasterTournament();
    if (!tournament) {
      this.logger.warn("No Master Tournament found for today — skipping");
      return;
    }
    if (tournament.status !== "running") {
      this.logger.warn(
        `Tournament ${tournament.id} status is ${tournament.status}, not running — skipping`,
      );
      return;
    }

    const pods = await this.tournamentPodRepository.findPendingByTournamentId(
      tournament.id,
    );

    if (pods.length === 0) {
      this.logger.warn("No pending pods found — skipping execution");
      return;
    }

    // Update all pod statuses to running
    for (const pod of pods) {
      await this.tournamentPodRepository.update(pod.id, { status: "running" });
    }

    // Pass clean PodID list to TournamentDirector
    const podIds = pods.map((p) => p.id);
    this.logger.log(`Dispatching ${podIds.length} pods to TournamentDirector`);

    // Start the parent tournament via the existing director
    try {
      await this.tournamentDirector.startTournament(tournament.id);
    } catch (err) {
      this.logger.error(`Failed to start tournament ${tournament.id}: ${err}`);
    }

    this.eventEmitter.emit("matchmaking.executionStarted", {
      tournamentId: tournament.id,
      podIds,
    });
  }

  /**
   * Fisher-Yates shuffle using crypto.randomBytes — same proven pattern as src/domain/deck.ts.
   * Cryptographically secure randomization for fair player distribution across pods.
   */
  shufflePlayers<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Calculate pod sizes from player count and target table size.
   * Handles remainder: if last group < 2, merge into previous.
   */
  calculatePodSplit(playerCount: number, tableSize: number): number[] {
    if (playerCount <= tableSize) {
      return [playerCount];
    }

    const podCount = Math.ceil(playerCount / tableSize);
    const baseSize = Math.floor(playerCount / podCount);
    const extraPlayers = playerCount % podCount;

    const pods: number[] = [];
    for (let i = 0; i < podCount; i++) {
      pods.push(baseSize + (i < extraPlayers ? 1 : 0));
    }

    // If last pod has < 2 players, merge into previous
    if (pods.length > 1 && pods[pods.length - 1] < 2) {
      const last = pods.pop()!;
      pods[pods.length - 1] += last;
    }

    return pods;
  }

  /**
   * Calculate the daily prize pool from subscription revenue.
   * DailyPool = (SUM(monthly_fee) of active subscribers) * 60% / 30
   */
  async calculateDailyPool(): Promise<bigint> {
    const result = await this.dataSource
      .getRepository(User)
      .createQueryBuilder("u")
      .select("COALESCE(SUM(u.monthly_fee), 0)", "total")
      .where("u.subscription_status = :status", { status: "active" })
      .andWhere("u.subscription_end > :now", { now: new Date() })
      .getRawOne();

    const totalMonthly = BigInt(result?.total ?? "0");
    return (
      (totalMonthly * MATCHMAKING_CONFIG.REVENUE_POOL_PERCENTAGE) /
      100n /
      MATCHMAKING_CONFIG.DAYS_PER_MONTH
    );
  }

  /**
   * Find today's Master Tournament by naming convention: "Daily Master YYYY-MM-DD"
   */
  async findTodaysMasterTournament(): Promise<Tournament | null> {
    const today = new Date().toISOString().split("T")[0];
    const name = `Daily Master ${today}`;
    return this.dataSource
      .getRepository(Tournament)
      .findOne({ where: { name } });
  }

  private todayAt(hours: number, minutes: number): Date {
    const d = new Date();
    d.setUTCHours(hours, minutes, 0, 0);
    return d;
  }
}
