import {
  Injectable,
  BadRequestException,
  ForbiddenException,
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
import {
  CreateTournamentDto,
  TournamentResponseDto,
  TournamentResultDto,
  TournamentLeaderboardEntryDto,
} from "./dto/tournament.dto";

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
      turn_timeout_ms: dto.turn_timeout_ms ?? 10000,
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
    const prizePool = entries.length * Number(tournament.buy_in);
    const payouts = this.calculatePayouts(prizePool, sortedEntries.length);

    // Update finish positions and payouts
    for (let i = 0; i < sortedEntries.length; i++) {
      const position = i + 1;
      const payout = payouts[i] || 0;
      await this.tournamentRepository.setEntryPayout(
        tournamentId,
        sortedEntries[i].bot_id,
        BigInt(payout),
        position,
      );
    }

    // Mark tournament as finished
    await this.tournamentRepository.updateStatus(tournamentId, "finished");
    this.logger.log(
      `Tournament ${tournamentId} finalized with ${sortedEntries.length} entries`,
    );
  }

  /**
   * Calculate payouts for tournament entries.
   * Uses a standard payout structure: top 10% or minimum 3 players receive payouts.
   */
  private calculatePayouts(prizePool: number, entryCount: number): number[] {
    const payouts: number[] = new Array(entryCount).fill(0);

    // Determine number of paid places (top 10% or minimum 3, maximum 50%)
    const paidPlaces = Math.max(
      3,
      Math.min(entryCount * 0.5, entryCount * 0.1),
    );
    const numPaid = Math.floor(paidPlaces);

    if (numPaid === 0 || prizePool === 0) {
      return payouts;
    }

    // Payout structure (percentage of prize pool for each position)
    // Weighted towards top finishers
    const payoutPercentages = [
      0.3, // 1st: 30%
      0.2, // 2nd: 20%
      0.15, // 3rd: 15%
      0.1, // 4th: 10%
      0.08, // 5th: 8%
      0.07, // 6th: 7%
      0.05, // 7th: 5%
      0.03, // 8th: 3%
      0.02, // 9th: 2%
    ];

    let remainingPrizePool = prizePool;

    // Pay out top positions using predefined percentages
    for (let i = 0; i < Math.min(numPaid, payoutPercentages.length); i++) {
      const payout = Math.floor(prizePool * payoutPercentages[i]);
      payouts[i] = payout;
      remainingPrizePool -= payout;
    }

    // Distribute remaining prize pool equally among remaining paid places
    if (numPaid > payoutPercentages.length && remainingPrizePool > 0) {
      const remainingPlaces = numPaid - payoutPercentages.length;
      const payPerPlace = Math.floor(remainingPrizePool / remainingPlaces);
      for (let i = payoutPercentages.length; i < numPaid; i++) {
        payouts[i] = payPerPlace;
      }
    }

    return payouts;
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
      turn_timeout_ms: tournament.turn_timeout_ms,
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
      turn_timeout_ms: tournament.turn_timeout_ms,
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
}
