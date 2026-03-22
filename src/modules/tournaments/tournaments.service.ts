import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
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

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    private readonly tournamentRepository: TournamentRepository,
    private readonly botRepository: BotRepository,
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: RedisCacheService,
  ) {}

  async create(dto: CreateTournamentDto): Promise<TournamentResponseDto> {
    const tournament = await this.tournamentRepository.create({
      name: dto.name,
      type: dto.type,
      buy_in: dto.buy_in,
      starting_chips: dto.starting_chips,
      min_players: dto.min_players,
      max_players: dto.max_players,
      players_per_table: dto.players_per_table ?? 9,
      turn_timeout_ms: dto.turn_timeout_ms ?? 10000,
      late_reg_ends_level: dto.late_reg_ends_level ?? 4,
      rebuys_allowed: dto.rebuys_allowed ?? true,
      scheduled_start_at: dto.scheduled_start_at
        ? new Date(dto.scheduled_start_at)
        : null,
    });

    if (dto.blind_levels) {
      for (const level of dto.blind_levels) {
        await this.tournamentRepository.startBlindLevel({
          tournament_id: tournament.id,
          level: level.level,
          small_blind: level.small_blind,
          big_blind: level.big_blind,
          ante: level.ante ?? 0,
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

  async findAll(status?: TournamentStatus): Promise<TournamentResponseDto[]> {
    const tournaments = status
      ? await this.tournamentRepository.findByStatus(status)
      : await this.tournamentRepository.findAll();

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
    currentLevel?: number,
  ): Promise<void> {
    const tournament =
      await this.tournamentRepository.findByIdOrThrow(tournamentId);

    // Check registration eligibility
    const isRegistering = tournament.status === "registering";
    const isRunning = tournament.status === "running";
    const lateRegAllowed =
      isRunning &&
      currentLevel !== undefined &&
      currentLevel <= tournament.late_reg_ends_level;

    if (!isRegistering && !lateRegAllowed) {
      if (isRunning && currentLevel !== undefined) {
        throw new BadRequestException(
          `Late registration closed after level ${tournament.late_reg_ends_level} (current: ${currentLevel})`,
        );
      }
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

    return tournaments.map((t) =>
      this.toResponseDto(t, entryCounts.get(t.id) || 0),
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
      turn_timeout_ms: tournament.turn_timeout_ms,
      late_reg_ends_level: tournament.late_reg_ends_level,
      rebuys_allowed: tournament.rebuys_allowed,
      scheduled_start_at: tournament.scheduled_start_at,
      started_at: tournament.started_at,
      finished_at: tournament.finished_at,
      entries_count: entriesCount,
      created_at: tournament.created_at,
    };
  }
}
