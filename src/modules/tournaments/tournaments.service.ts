import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { TournamentRepository } from "../../repositories/tournament.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { AnalyticsRepository } from "../../repositories/analytics.repository";
import { RedisCacheService } from "../../common/redis/redis-cache.service";
import { Tournament, TournamentStatus } from "../../entities/tournament.entity";
import { Bot } from "../../entities/bot.entity";
import {
  CreateTournamentDto,
  TournamentResponseDto,
  TournamentResultDto,
  TournamentLeaderboardEntryDto,
} from "./dto/tournament.dto";
import { calculatePrizes } from "../../config/tournaments.config";
import {
  TournamentEvent,
  EVENT_TABLE_MOVE,
} from "../../entities/tournament-event.entity";

export interface HandManifestItem {
  id: string;
  hand_number: number;
  pot: number;
  winner_bot_id: string | null;
  winner_name: string | null;
  started_at: Date | null;
  result: "win" | "loss" | "none";
}

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    private readonly tournamentRepository: TournamentRepository,
    private readonly botRepository: BotRepository,
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: RedisCacheService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateTournamentDto): Promise<TournamentResponseDto> {
    const tournament = await this.tournamentRepository.create({
      name: dto.name,
      type: dto.type,
      buy_in: BigInt(dto.buy_in),
      starting_chips: BigInt(dto.starting_chips),
      min_players: dto.min_players,
      max_players: dto.max_players,
      players_per_table: dto.players_per_table ?? 9,
      hands_per_level: dto.hands_per_level ?? 50,
      rebuys_allowed: dto.rebuys_allowed ?? true,
      scheduled_start_at: dto.scheduled_start_at
        ? new Date(dto.scheduled_start_at)
        : undefined,
    });

    if (dto.blind_levels) {
      for (const level of dto.blind_levels) {
        await this.tournamentRepository.startBlindLevel({
          tournament_id: tournament.id,
          level: level.level,
          small_blind: BigInt(level.small_blind),
          big_blind: BigInt(level.big_blind),
          ante: BigInt(level.ante ?? 0),
        });
      }
    }

    this.eventEmitter.emit("tournament.created", {
      tournamentId: tournament.id,
      tournament: this.toResponseDto(tournament, 0),
    });

    return this.toResponseDto(tournament, 0);
  }

  async findById(id: string): Promise<TournamentResponseDto | null> {
    const tournament = await this.tournamentRepository.findById(id);
    if (!tournament) return null;

    const entries = await this.tournamentRepository.getEntries(id);
    return this.toResponseDto(tournament, entries.length);
  }

  async findByIdEntity(id: string): Promise<Tournament | null> {
    return this.tournamentRepository.findById(id);
  }

  async findAll(
    status?: TournamentStatus,
    limit?: number,
  ): Promise<TournamentResponseDto[]> {
    let tournaments = status
      ? await this.tournamentRepository.findByStatus(status)
      : await this.tournamentRepository.findAll();

    if (limit !== undefined) {
      tournaments = tournaments.slice(0, limit);
    }

    if (tournaments.length === 0) {
      return [];
    }

    const entryCounts = await this.tournamentRepository.getEntryCounts(
      tournaments.map((t) => t.id),
    );

    return tournaments.map((t) =>
      this.toResponseDto(t, entryCounts.get(t.id) || 0),
    );
  }

  async register(
    tournamentId: string,
    botId: string,
    userId: string,
  ): Promise<void> {
    const tournament =
      await this.tournamentRepository.findByIdOrThrow(tournamentId);

    if (tournament.status !== "registering") {
      throw new BadRequestException(
        "Tournament is not accepting registrations",
      );
    }

    const bot = await this.botRepository.findByIdOrThrow(botId);

    if (bot.user_id !== userId) {
      throw new ForbiddenException("You do not own this bot");
    }

    if (!bot.active) {
      throw new BadRequestException("Bot is not active");
    }

    const entries = await this.tournamentRepository.getEntries(tournamentId);
    if (entries.length >= tournament.max_players) {
      throw new BadRequestException("Tournament is full");
    }

    const existing = entries.find((e) => e.bot_id === botId);
    if (existing) {
      throw new BadRequestException("Bot is already registered");
    }

    // Check if another bot owned by the same user is already registered
    const entryBotIds = entries.map((e) => e.bot_id);
    if (entryBotIds.length > 0) {
      const entryBots = await this.botRepository.findByIds(entryBotIds);
      const sameOwnerBot = entryBots.find((b) => b.user_id === userId);
      if (sameOwnerBot) {
        throw new BadRequestException(
          `You already have a bot (${sameOwnerBot.name}) registered in this tournament. Only one bot per player allowed.`,
        );
      }
    }

    await this.tournamentRepository.createEntry({
      tournament_id: tournamentId,
      bot_id: botId,
      entry_type: "initial",
      payout: 0n,
    });

    this.eventEmitter.emit("tournament.botRegistered", {
      tournamentId,
      botId,
      botName: bot.name,
      userId,
    });

    this.logger.log(`Bot ${botId} registered for tournament ${tournamentId}`);
  }

  async unregister(tournamentId: string, botId: string): Promise<void> {
    const tournament =
      await this.tournamentRepository.findByIdOrThrow(tournamentId);

    if (tournament.status !== "registering") {
      throw new BadRequestException(
        "Cannot unregister from started tournament",
      );
    }

    const entry = await this.tournamentRepository.findEntryByBotId(
      tournamentId,
      botId,
    );
    if (!entry) {
      throw new BadRequestException("Bot is not registered");
    }

    await this.tournamentRepository.deleteEntry(entry.id);
    this.logger.log(
      `Bot ${botId} unregistered from tournament ${tournamentId}`,
    );
  }

  async leaveAsUser(tournamentId: string, userId: string): Promise<void> {
    const tournament =
      await this.tournamentRepository.findByIdOrThrow(tournamentId);

    if (tournament.status !== "registering") {
      throw new BadRequestException("Cannot leave started tournament");
    }

    // Find user's registered bot
    const entries = await this.tournamentRepository.getEntries(tournamentId);
    const userEntry = entries.find((e) => e.bot?.user_id === userId);

    if (!userEntry) {
      throw new BadRequestException(
        "You are not registered in this tournament",
      );
    }

    await this.tournamentRepository.deleteEntry(userEntry.id);
    this.logger.log(
      `User ${userId} left tournament ${tournamentId} (bot: ${userEntry.bot_id})`,
    );
  }

  async start(id: string): Promise<void> {
    const tournament = await this.tournamentRepository.findByIdOrThrow(id);

    if (tournament.status !== "registering") {
      throw new BadRequestException("Tournament cannot be started");
    }

    const entries = await this.tournamentRepository.getEntries(id);
    if (entries.length < tournament.min_players) {
      throw new BadRequestException(
        `Not enough players: ${entries.length}/${tournament.min_players}`,
      );
    }

    await this.tournamentRepository.updateStatus(id, "running");
    this.logger.log(`Tournament ${id} started with ${entries.length} players`);
  }

  async cancel(id: string): Promise<void> {
    const tournament = await this.tournamentRepository.findByIdOrThrow(id);

    if (tournament.status === "finished" || tournament.status === "cancelled") {
      throw new BadRequestException("Tournament is already finished");
    }

    await this.tournamentRepository.updateStatus(id, "cancelled");
    this.logger.log(`Tournament ${id} cancelled`);

    const entries = await this.tournamentRepository.getEntries(id);
    const updatedTournament: Tournament = Object.assign(
      Object.create(Object.getPrototypeOf(tournament)),
      tournament,
      { status: "cancelled" as const },
    );
    this.eventEmitter.emit("tournament.cancelled", {
      tournamentId: id,
      tournament: this.toResponseDto(updatedTournament, entries.length),
    });
  }

  async getResults(id: string): Promise<TournamentResultDto[]> {
    const entries = await this.tournamentRepository.getResults(id);
    return entries
      .filter((e) => e.finish_position !== null)
      .map((e) => ({
        bot_id: e.bot_id,
        bot_name: e.bot?.name || "Unknown",
        finish_position: e.finish_position!,
        payout: Number(e.payout),
      }));
  }

  /**
   * Get complete tournament results with user information.
   * Used for results page display.
   */
  async getCompleteResults(id: string): Promise<{
    tournamentId: string;
    tournamentName: string;
    finishedAt: Date | null;
    totalEntries: number;
    results: Array<{
      rank: number;
      botId: string;
      botName: string;
      userId: string;
      userName: string;
      finishPosition: number;
      payout: number;
      bustLevel?: number;
      isTied: boolean;
    }>;
  }> {
    const tournament = await this.tournamentRepository.findByIdOrThrow(id);
    const entries = await this.tournamentRepository.getResults(id);

    const finishedEntries = entries
      .filter((e) => e.finish_position !== null)
      .sort((a, b) => (a.finish_position || 0) - (b.finish_position || 0));

    // Detect ties: count how many entries share each finish_position
    const positionCounts = new Map<number, number>();
    for (const e of finishedEntries) {
      const pos = e.finish_position!;
      positionCounts.set(pos, (positionCounts.get(pos) || 0) + 1);
    }

    const results = finishedEntries.map((e) => ({
      rank: e.finish_position!,
      botId: e.bot_id,
      botName: e.bot?.name || "Unknown",
      userId: e.bot?.user?.id || "unknown",
      userName: e.bot?.user?.name || "Unknown Player",
      finishPosition: e.finish_position!,
      payout: Number(e.payout),
      bustLevel: e.bust_level || undefined,
      isTied: (positionCounts.get(e.finish_position!) || 1) > 1,
    }));

    return {
      tournamentId: id,
      tournamentName: tournament.name,
      finishedAt: tournament.finished_at ?? null,
      totalEntries: entries.length,
      results,
    };
  }

  async getLeaderboard(id: string): Promise<TournamentLeaderboardEntryDto[]> {
    const cacheKey = `tournament:${id}:leaderboard`;
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const entries = await this.tournamentRepository.getEntries(id);
        const seats =
          await this.tournamentRepository.getSeatsOrderedByChips(id);

        return seats.map((s, idx) => ({
          position: idx + 1,
          bot_id: s.bot_id,
          bot_name:
            entries.find((e) => e.bot_id === s.bot_id)?.bot?.name ||
            s.bot?.name ||
            "Unknown",
          chips: Number(s.chips),
          busted: s.busted,
        }));
      },
      { ttlSeconds: 10 }, // Short TTL for live tournaments
    );
  }

  /**
   * Update the scheduled start time for a tournament.
   */
  async updateSchedule(
    id: string,
    scheduledStartAt: Date | null,
  ): Promise<void> {
    await this.tournamentRepository.updateSchedule(id, scheduledStartAt);
    this.logger.log(
      `Tournament ${id} schedule updated to ${scheduledStartAt?.toISOString() ?? "null"}`,
    );
  }

  /**
   * Get upcoming scheduled tournaments (within the next 7 days).
   */
  async getUpcomingScheduled(): Promise<TournamentResponseDto[]> {
    const tournaments = await this.tournamentRepository.findUpcomingScheduled();

    if (tournaments.length === 0) {
      return [];
    }

    const entryCounts = await this.tournamentRepository.getEntryCounts(
      tournaments.map((t) => t.id),
    );

    // Fetch entries for all tournaments to include registration status
    const allEntries = await Promise.all(
      tournaments.map((t) => this.tournamentRepository.getEntries(t.id)),
    );

    return tournaments.map((t, idx) =>
      this.toResponseDtoWithEntries(
        t,
        entryCounts.get(t.id) || 0,
        allEntries[idx],
      ),
    );
  }

  /**
   * Find the user's current table in a tournament.
   * Returns table info or null if user is eliminated or not playing.
   */
  async findUserCurrentTable(
    tournamentId: string,
    userId: string,
  ): Promise<{
    tableId: string;
    tableNumber: number;
    seatPosition: number;
    remainingPlayers: number;
    currentBlindLevel: number;
    gameId: string | null;
  } | null> {
    // Find user's active seat in tournament
    const seat = await this.tournamentRepository.findUserCurrentSeat(
      tournamentId,
      userId,
    );

    if (!seat || !seat.tournament_table) {
      return null;
    }

    // Count remaining active players
    const remainingPlayers =
      await this.tournamentRepository.countActivePlayers(tournamentId);

    // Get current blind level
    const currentLevel =
      await this.tournamentRepository.getCurrentLevel(tournamentId);

    return {
      tableId: seat.tournament_table_id,
      tableNumber: seat.tournament_table.table_number,
      seatPosition: seat.seat_number,
      remainingPlayers,
      currentBlindLevel: currentLevel?.level || 1,
      gameId: seat.tournament_table.game_id ?? null,
    };
  }

  /**
   * Finalize tournament by calculating finish positions and payouts.
   * Called when tournament ends (last player eliminated).
   */
  async finalizeTournament(tournamentId: string): Promise<void> {
    const tournament =
      await this.tournamentRepository.findByIdOrThrow(tournamentId);

    // Get all entries for this tournament, sorted by elimination order
    const entries = await this.tournamentRepository.getResults(tournamentId);

    // Separate finalized from non-finalized entries
    const nonFinalizedEntries = entries.filter(
      (e) => e.finish_position === null,
    );

    if (nonFinalizedEntries.length === 0) {
      // Already finalized
      return;
    }

    // Sort by bust_level (descending) - higher bust_level means better finish
    // Then by ID (for deterministic ordering of ties)
    const sortedEntries = nonFinalizedEntries.sort((a, b) => {
      const bustDiff = (b.bust_level ?? 0) - (a.bust_level ?? 0);
      if (bustDiff !== 0) return bustDiff;
      return a.id.localeCompare(b.id);
    });

    // Calculate payouts
    const prizePool = BigInt(entries.length) * tournament.buy_in;
    const payouts = calculatePrizes(prizePool, sortedEntries.length);
    const payoutByPosition = new Map(
      payouts.map((p) => [p.position, p.amount]),
    );

    // Update finish positions and payouts
    for (let i = 0; i < sortedEntries.length; i++) {
      const position = i + 1;
      await this.tournamentRepository.setEntryPayout(
        tournamentId,
        sortedEntries[i].bot_id,
        payoutByPosition.get(position) ?? 0n,
        position,
      );
    }

    // Mark tournament as finished
    await this.tournamentRepository.updateStatus(tournamentId, "finished");
    this.logger.log(
      `Tournament ${tournamentId} finalized with ${sortedEntries.length} entries`,
    );
  }

  private toResponseDto(
    tournament: Tournament,
    entriesCount: number,
  ): TournamentResponseDto {
    return {
      id: tournament.id,
      name: tournament.name,
      type: tournament.type,
      status: tournament.status,
      buy_in: Number(tournament.buy_in),
      starting_chips: Number(tournament.starting_chips),
      min_players: tournament.min_players,
      max_players: tournament.max_players,
      players_per_table: tournament.players_per_table,
      rebuys_allowed: tournament.rebuys_allowed,
      scheduled_start_at: tournament.scheduled_start_at ?? null,
      started_at: tournament.started_at ?? null,
      finished_at: tournament.finished_at ?? null,
      entries_count: entriesCount,
      created_at: tournament.created_at,
    };
  }

  async getHandsManifest(
    tournamentId: string,
    userId: string,
  ): Promise<HandManifestItem[]> {
    const rows: Array<{
      id: string;
      hand_number: number;
      pot: string;
      winner_bot_id: string | null;
      winner_name: string | null;
      started_at: Date | null;
      result: "win" | "loss" | "none";
    }> = await this.dataSource.query(
      `
      SELECT
        h.id,
        h.hand_number,
        h.pot,
        (SELECT bot_id FROM hand_players WHERE hand_id = h.id AND won = TRUE LIMIT 1) AS winner_bot_id,
        (SELECT b2.name FROM hand_players hp2 JOIN bots b2 ON b2.id = hp2.bot_id
          WHERE hp2.hand_id = h.id AND hp2.won = TRUE LIMIT 1) AS winner_name,
        h.started_at,
        CASE
          WHEN EXISTS (SELECT 1 FROM hand_players WHERE hand_id = h.id AND won = TRUE
            AND bot_id IN (SELECT id FROM bots WHERE user_id = $2)) THEN 'win'
          WHEN EXISTS (SELECT 1 FROM hand_players WHERE hand_id = h.id
            AND bot_id IN (SELECT id FROM bots WHERE user_id = $2)) THEN 'loss'
          ELSE 'none'
        END AS result
      FROM hands h
      WHERE h.tournament_id = $1
      ORDER BY h.hand_number ASC
      `,
      [tournamentId, userId],
    );

    return rows.map((r) => ({
      id: r.id,
      hand_number: r.hand_number,
      pot: Number(r.pot),
      winner_bot_id: r.winner_bot_id,
      winner_name: r.winner_name,
      started_at: r.started_at,
      result: r.result,
    }));
  }

  async getParticipatedTournaments(userId: string): Promise<
    Array<{
      tournamentId: string;
      tournamentName: string;
      finishedAt: Date | null;
      status: string;
      botId: string;
      botName: string;
    }>
  > {
    const rows: Array<{
      tournament_id: string;
      tournament_name: string;
      finished_at: Date | null;
      status: string;
      bot_id: string;
      bot_name: string;
    }> = await this.dataSource.query(
      `
      SELECT t.id          AS tournament_id,
             t.name        AS tournament_name,
             t.finished_at,
             t.status,
             b.id          AS bot_id,
             b.name        AS bot_name
      FROM   tournaments t
      JOIN   tournament_entries te ON te.tournament_id = t.id
      JOIN   bots b ON b.id = te.bot_id
      WHERE  te.bot_id IN (
               SELECT id FROM bots WHERE user_id = $1 AND active = true
             )
        AND  t.status = 'finished'
        AND  t.log_data IS NOT NULL
        AND  jsonb_array_length(t.log_data->'hands') > 0
      ORDER  BY t.finished_at DESC NULLS LAST
      `,
      [userId],
    );
    return rows.map((r) => ({
      tournamentId: r.tournament_id,
      tournamentName: r.tournament_name,
      finishedAt: r.finished_at,
      status: r.status,
      botId: r.bot_id,
      botName: r.bot_name,
    }));
  }

  async getTournamentLog(
    tournamentId: string,
    userId: string,
  ): Promise<{
    log_data: any;
    nameMap: Record<
      string,
      {
        botName: string;
        userName: string;
        userId: string;
        finishPosition: number | null;
      }
    >;
  }> {
    const accessRows: Array<{ id: string }> = await this.dataSource.query(
      `
      SELECT t.id
      FROM tournaments t
      JOIN tournament_entries te ON te.tournament_id = t.id
      WHERE t.id = $1
        AND te.bot_id IN (
          SELECT id FROM bots WHERE user_id = $2 AND active = true
        )
      LIMIT 1
      `,
      [tournamentId, userId],
    );
    if (accessRows.length === 0) {
      const exists = await this.tournamentRepository.findById(tournamentId);
      if (!exists) {
        throw new NotFoundException(`Tournament ${tournamentId} not found`);
      }
      throw new ForbiddenException(
        "You do not have an active bot in this tournament",
      );
    }

    // Fetch log + build nameMap from tournament_entries in parallel
    const [tournament, participantRows] = await Promise.all([
      this.tournamentRepository.findById(tournamentId),
      this.dataSource.query(
        `
        SELECT te.bot_id, b.name AS bot_name, u.name AS user_name, u.id AS user_id, te.finish_position
        FROM tournament_entries te
        JOIN bots b ON b.id = te.bot_id
        JOIN users u ON u.id = b.user_id
        WHERE te.tournament_id = $1
        `,
        [tournamentId],
      ) as Promise<
        Array<{
          bot_id: string;
          bot_name: string;
          user_name: string;
          user_id: string;
          finish_position: number | null;
        }>
      >,
    ]);

    const nameMap: Record<
      string,
      {
        botName: string;
        userName: string;
        userId: string;
        finishPosition: number | null;
      }
    > = {};
    for (const r of participantRows) {
      nameMap[r.bot_id] = {
        botName: r.bot_name,
        userName: r.user_name,
        userId: r.user_id,
        finishPosition: r.finish_position ?? null,
      };
    }

    return { log_data: tournament!.log_data ?? {}, nameMap };
  }

  async getMyActivity(userId: string): Promise<
    Array<{
      id: string;
      botName: string;
      tournamentName: string;
      finishPosition: number | null;
      maxPlayers: number;
      payout: number;
      createdAt: Date;
    }>
  > {
    const rows: Array<{
      id: string;
      bot_name: string;
      tournament_name: string;
      finish_position: number | null;
      max_players: number;
      payout: string;
      created_at: Date;
    }> = await this.dataSource.query(
      `
      SELECT te.id, b.name AS bot_name, t.name AS tournament_name,
             te.finish_position, t.max_players, te.payout, te.created_at
      FROM tournament_entries te
      JOIN tournaments t ON te.tournament_id = t.id
      JOIN bots b ON te.bot_id = b.id
      WHERE b.user_id = $1
        AND t.status = 'finished'
      ORDER BY te.created_at DESC
      LIMIT 10
      `,
      [userId],
    );

    return rows.map((r) => ({
      id: r.id,
      botName: r.bot_name,
      tournamentName: r.tournament_name,
      finishPosition: r.finish_position,
      maxPlayers: r.max_players,
      payout: Number(r.payout ?? 0),
      createdAt: r.created_at,
    }));
  }

  /**
   * Returns DB-derived live summary for a running tournament when the
   * in-memory director state is unavailable (e.g. after a server restart).
   */
  async getLiveSummary(tournamentId: string): Promise<{
    playersRemaining: number;
    tableCount: number;
    tableIds: string[];
    currentBlindLevel: number | null;
    smallBlind: number | null;
    bigBlind: number | null;
    ante: number | null;
  }> {
    const [playerRows, tableRows, blindRows] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*) AS cnt FROM tournament_entries
         WHERE tournament_id = $1 AND finish_position IS NULL`,
        [tournamentId],
      ),
      this.dataSource.query(
        `SELECT id FROM tournament_tables
         WHERE tournament_id = $1 AND status = 'active'`,
        [tournamentId],
      ),
      this.dataSource.query(
        `SELECT level, small_blind, big_blind, ante
         FROM tournament_blind_levels
         WHERE tournament_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [tournamentId],
      ),
    ]);

    const blind = blindRows[0] ?? null;
    return {
      playersRemaining: parseInt(playerRows[0]?.cnt ?? "0", 10),
      tableCount: tableRows.length,
      tableIds: tableRows.map((r: any) => r.id as string),
      currentBlindLevel: blind ? Number(blind.level) : null,
      smallBlind: blind ? Number(blind.small_blind) : null,
      bigBlind: blind ? Number(blind.big_blind) : null,
      ante: blind ? Number(blind.ante) : null,
    };
  }

  // ─── Admin Operations ────────────────────────────────────────────────────────

  async getAdminEntries(tournamentId: string): Promise<
    Array<{
      entryId: string;
      botId: string;
      botName: string;
      ownerName: string;
      isSystem: boolean;
    }>
  > {
    const entries = await this.tournamentRepository.getEntries(tournamentId);
    return entries.map((e) => ({
      entryId: e.id,
      botId: e.bot_id,
      botName: e.bot?.name ?? "Unknown",
      ownerName: e.bot?.user?.name ?? "Unknown",
      isSystem: e.bot?.isSystem ?? false,
    }));
  }

  async removeEntry(tournamentId: string, entryId: string): Promise<void> {
    const tournament =
      await this.tournamentRepository.findByIdOrThrow(tournamentId);
    if (tournament.status !== "registering") {
      throw new BadRequestException(
        "Cannot remove entries from a started tournament",
      );
    }
    await this.tournamentRepository.deleteEntry(entryId);
  }

  /**
   * Inject system bots into a registering tournament until it's full.
   * Bypasses the per-user ownership check since these are internal system bots.
   */
  async injectSystemBots(
    tournamentId: string,
    profile: "random" | "sharks" | "fish" | "balanced" = "random",
    count?: number,
  ): Promise<{ injected: number; total: number }> {
    const tournament =
      await this.tournamentRepository.findByIdOrThrow(tournamentId);

    if (tournament.status !== "registering") {
      throw new BadRequestException(
        "Can only inject bots into registering tournaments",
      );
    }

    const entries = await this.tournamentRepository.getEntries(tournamentId);
    const slotsAvailable = Math.min(
      tournament.max_players - entries.length,
      count ?? tournament.max_players,
    );

    if (slotsAvailable <= 0) {
      throw new BadRequestException("Tournament is already full");
    }

    const registeredBotIds = new Set(entries.map((e) => e.bot_id));

    // Profile → name patterns (matches seeded system bot names)
    const SHARK_NAMES = ["The Shark", "The Maniac", "The Bully", "The Tricky"];
    const FISH_NAMES = ["The Calling Station", "The Nit", "The Rock"];

    const allBots = await this.dataSource
      .getRepository(Bot)
      .find({ where: { isSystem: true, active: true } });

    let pool: typeof allBots;
    if (profile === "sharks") {
      pool = allBots.filter((b) =>
        SHARK_NAMES.some((n) => b.name.includes(n.replace("The ", ""))),
      );
      if (pool.length === 0) pool = allBots; // fallback
    } else if (profile === "fish") {
      pool = allBots.filter((b) =>
        FISH_NAMES.some((n) => b.name.includes(n.replace("The ", ""))),
      );
      if (pool.length === 0) pool = allBots;
    } else if (profile === "balanced") {
      const sharks = allBots.filter((b) =>
        SHARK_NAMES.some((n) => b.name.includes(n.replace("The ", ""))),
      );
      const fish = allBots.filter((b) =>
        FISH_NAMES.some((n) => b.name.includes(n.replace("The ", ""))),
      );
      // Interleave: shark, fish, shark, fish…
      pool = [];
      const maxLen = Math.max(sharks.length, fish.length);
      for (let i = 0; i < maxLen; i++) {
        if (sharks[i]) pool.push(sharks[i]);
        if (fish[i]) pool.push(fish[i]);
      }
      if (pool.length === 0) pool = allBots;
    } else {
      // random — shuffle
      pool = [...allBots].sort(() => Math.random() - 0.5);
    }

    // First try unique bots; if pool is exhausted (all already registered),
    // cycle through the full pool to fill remaining slots.
    const uniqueBots = pool.filter((b) => !registeredBotIds.has(b.id));
    let botsToAdd: typeof pool;
    if (uniqueBots.length >= slotsAvailable || pool.length === 0) {
      botsToAdd = uniqueBots.slice(0, slotsAvailable);
    } else {
      // Cycle through pool to fill remaining slots
      botsToAdd = [...uniqueBots];
      const cyclePool = pool.length > 0 ? pool : allBots;
      while (botsToAdd.length < slotsAvailable) {
        botsToAdd.push(cyclePool[botsToAdd.length % cyclePool.length]);
      }
    }

    let injected = 0;
    for (const bot of botsToAdd) {
      await this.tournamentRepository.createEntry({
        tournament_id: tournamentId,
        bot_id: bot.id,
        entry_type: "initial",
        payout: 0n,
      });
      injected++;
    }

    this.logger.log(
      `Admin injected ${injected} system bots (${profile}) into tournament ${tournamentId}`,
    );
    return { injected, total: tournament.max_players };
  }

  /**
   * Returns all active user (non-system) bots not already registered in the tournament.
   * Used by admin to pick specific user bots for injection.
   */
  async getAvailableUserBots(
    tournamentId: string,
  ): Promise<
    Array<{ botId: string; botName: string; userId: string; userName: string }>
  > {
    const rows: Array<{
      bot_id: string;
      bot_name: string;
      user_id: string;
      user_name: string;
    }> = await this.dataSource.query(
      `
      SELECT b.id AS bot_id, b.name AS bot_name, u.id AS user_id, u.name AS user_name
      FROM bots b
      JOIN users u ON u.id = b.user_id
      WHERE b.active = true
        AND b.is_system = false
        AND b.id NOT IN (
          SELECT bot_id FROM tournament_entries WHERE tournament_id = $1
        )
      ORDER BY u.name, b.name
      `,
      [tournamentId],
    );
    return rows.map((r) => ({
      botId: r.bot_id,
      botName: r.bot_name,
      userId: r.user_id,
      userName: r.user_name,
    }));
  }

  /**
   * Admin-only: register any active bot into a registering tournament,
   * bypassing the per-user ownership check.
   */
  async adminRegisterBot(tournamentId: string, botId: string): Promise<void> {
    const tournament =
      await this.tournamentRepository.findByIdOrThrow(tournamentId);
    if (tournament.status !== "registering") {
      throw new BadRequestException(
        "Tournament is not accepting registrations",
      );
    }

    const bot = await this.botRepository.findByIdOrThrow(botId);
    if (!bot.active) {
      throw new BadRequestException("Bot is not active");
    }

    const entries = await this.tournamentRepository.getEntries(tournamentId);
    if (entries.length >= tournament.max_players) {
      throw new BadRequestException("Tournament is full");
    }
    if (entries.some((e) => e.bot_id === botId)) {
      throw new BadRequestException("Bot is already registered");
    }

    await this.tournamentRepository.createEntry({
      tournament_id: tournamentId,
      bot_id: botId,
      entry_type: "initial",
      payout: 0n,
    });

    this.logger.log(
      `Admin registered bot ${bot.name} (${botId}) into tournament ${tournamentId}`,
    );
  }

  /**
   * Returns all non-admin users with their active bot counts.
   */
  async getUsersWithBotCounts(): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
      subscription_status: string;
      bot_count: string;
      last_login_at: string | null;
    }>
  > {
    return this.dataSource.query(`
      SELECT u.id, u.name, u.email, u.subscription_status,
             u.last_login_at,
             COUNT(b.id) FILTER (WHERE b.active = true) AS bot_count
      FROM users u
      LEFT JOIN bots b ON b.user_id = u.id
      WHERE u.role = 'user'
      GROUP BY u.id, u.name, u.email, u.subscription_status, u.last_login_at
      ORDER BY bot_count DESC
      LIMIT 200
    `);
  }

  /**
   * Returns the last N finished tournaments with winner and prize info for the admin sidebar.
   */
  async getAdminHistory(limit = 20): Promise<
    Array<{
      id: string;
      name: string;
      buy_in: number;
      finished_at: Date | null;
      entries_count: number;
      winner_bot_name: string | null;
      prize_pool: number;
    }>
  > {
    return this.dataSource.query(
      `SELECT t.id, t.name, t.buy_in, t.finished_at,
              (SELECT COUNT(*) FROM tournament_entries WHERE tournament_id = t.id)::int AS entries_count,
              b.name AS winner_bot_name,
              t.buy_in * (SELECT COUNT(*) FROM tournament_entries WHERE tournament_id = t.id)::int AS prize_pool
       FROM tournaments t
       LEFT JOIN LATERAL (
         SELECT bot_id FROM tournament_entries
         WHERE tournament_id = t.id AND finish_position = 1
         LIMIT 1
       ) te ON true
       LEFT JOIN bots b ON b.id = te.bot_id
       WHERE t.status = 'finished'
       ORDER BY t.finished_at DESC NULLS LAST
       LIMIT $1`,
      [limit],
    );
  }

  /**
   * Cancel all registering tournaments (dev/ops reset).
   */
  async resetDevState(): Promise<{ cancelled: number }> {
    const result = await this.dataSource.query(
      `UPDATE tournaments SET status = 'cancelled' WHERE status = 'registering'`,
    );
    const cancelled = result[1] ?? 0;
    this.logger.warn(
      `Admin reset: cancelled ${cancelled} registering tournaments`,
    );
    return { cancelled };
  }

  async getSeedingMap(tournamentId: string): Promise<{
    tables: Array<{
      tableId: string;
      tableNumber: number;
      broken: boolean;
      seats: Array<{
        botId: string;
        botName: string;
        ownerName: string;
        userId: string;
        elo: number;
        busted: boolean;
      }>;
    }>;
    fairnessScore: number;
  }> {
    const rows: Array<{
      table_id: string;
      table_number: string;
      table_status: string;
      bot_id: string;
      bot_name: string;
      user_id: string;
      user_name: string;
      wins: string;
      busted: boolean;
    }> = await this.dataSource.query(
      `
      SELECT
        tt.id            AS table_id,
        tt.table_number,
        tt.status        AS table_status,
        b.id             AS bot_id,
        b.name           AS bot_name,
        u.id             AS user_id,
        u.name           AS user_name,
        COALESCE(bs.tournament_wins, 0) AS wins,
        ts.busted
      FROM tournament_seats ts
      JOIN tournament_tables tt ON tt.id = ts.tournament_table_id
      JOIN bots b  ON b.id  = ts.bot_id
      JOIN users u ON u.id  = b.user_id
      LEFT JOIN bot_stats bs ON bs.bot_id = b.id
      WHERE ts.tournament_id = $1
      ORDER BY tt.table_number, ts.seat_number
      `,
      [tournamentId],
    );

    const tableMap = new Map<
      string,
      {
        tableNumber: number;
        broken: boolean;
        seats: Array<{
          botId: string;
          botName: string;
          ownerName: string;
          userId: string;
          elo: number;
          busted: boolean;
        }>;
      }
    >();

    for (const r of rows) {
      if (!tableMap.has(r.table_id)) {
        tableMap.set(r.table_id, {
          tableNumber: Number(r.table_number),
          broken: r.table_status !== "active",
          seats: [],
        });
      }
      tableMap.get(r.table_id)!.seats.push({
        botId: r.bot_id,
        botName: r.bot_name,
        ownerName: r.user_name,
        userId: r.user_id,
        elo: Number(r.wins),
        busted: r.busted,
      });
    }

    const tables = [...tableMap.entries()].map(([tableId, data]) => ({
      tableId,
      tableNumber: data.tableNumber,
      broken: data.broken,
      seats: data.seats,
    }));

    // Fairness score uses only active tables (broken tables are historical)
    const activeTables = tables.filter((t) => !t.broken);
    const means = activeTables.map(
      (t) =>
        t.seats.reduce((s, seat) => s + seat.elo, 0) / (t.seats.length || 1),
    );
    const globalMean = means.reduce((s, m) => s + m, 0) / (means.length || 1);
    const fairnessScore =
      activeTables.length < 2
        ? 0
        : Math.sqrt(
            means.reduce((s, m) => s + (m - globalMean) ** 2, 0) / means.length,
          );

    return {
      tables,
      fairnessScore: Math.round(fairnessScore * 10) / 10,
    };
  }

  private toResponseDtoWithEntries(
    tournament: Tournament,
    entriesCount: number,
    entries: any[],
  ): TournamentResponseDto {
    return {
      id: tournament.id,
      name: tournament.name,
      type: tournament.type,
      status: tournament.status,
      buy_in: Number(tournament.buy_in),
      starting_chips: Number(tournament.starting_chips),
      min_players: tournament.min_players,
      max_players: tournament.max_players,
      players_per_table: tournament.players_per_table,
      rebuys_allowed: tournament.rebuys_allowed,
      scheduled_start_at: tournament.scheduled_start_at ?? null,
      started_at: tournament.started_at ?? null,
      finished_at: tournament.finished_at ?? null,
      entries_count: entriesCount,
      entries: entries.map((e) => ({
        id: e.id,
        user_id: e.bot?.user_id,
        bot_id: e.bot_id,
        user: e.bot?.user,
        bot: e.bot,
      })),
      created_at: tournament.created_at,
    };
  }

  /**
   * Return recent TABLE_MOVE events for a tournament, ordered newest-first.
   * Used by the Admin Dashboard balancing moves panel and the Replay Player.
   */
  async getBalancingMoves(
    tournamentId: string,
    limit = 20,
  ): Promise<TournamentEvent[]> {
    return this.dataSource.getRepository(TournamentEvent).find({
      where: { tournament_id: tournamentId, event_type: EVENT_TABLE_MOVE },
      order: { created_at: "DESC" },
      take: limit,
    });
  }
}
