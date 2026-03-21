import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager, In, IsNull } from "typeorm";
import { Tournament, TournamentStatus } from "../entities/tournament.entity";
import { TournamentEntry } from "../entities/tournament-entry.entity";
import {
  TournamentTable,
  TableStatus,
} from "../entities/tournament-table.entity";
import { TournamentSeat } from "../entities/tournament-seat.entity";
import { TournamentBlindLevel } from "../entities/tournament-blind-level.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class TournamentRepository extends BaseRepository<Tournament> {
  protected get entityName(): string {
    return "Tournament";
  }

  constructor(
    @InjectRepository(Tournament)
    protected readonly repository: Repository<Tournament>,
    @InjectRepository(TournamentEntry)
    private readonly entryRepository: Repository<TournamentEntry>,
    @InjectRepository(TournamentTable)
    private readonly tableRepository: Repository<TournamentTable>,
    @InjectRepository(TournamentSeat)
    private readonly seatRepository: Repository<TournamentSeat>,
    @InjectRepository(TournamentBlindLevel)
    private readonly blindLevelRepository: Repository<TournamentBlindLevel>,
  ) {
    super();
  }

  private getEntryRepo(manager?: EntityManager): Repository<TournamentEntry> {
    return manager
      ? manager.getRepository(TournamentEntry)
      : this.entryRepository;
  }

  private getTableRepo(manager?: EntityManager): Repository<TournamentTable> {
    return manager
      ? manager.getRepository(TournamentTable)
      : this.tableRepository;
  }

  private getSeatRepo(manager?: EntityManager): Repository<TournamentSeat> {
    return manager
      ? manager.getRepository(TournamentSeat)
      : this.seatRepository;
  }

  private getBlindLevelRepo(
    manager?: EntityManager,
  ): Repository<TournamentBlindLevel> {
    return manager
      ? manager.getRepository(TournamentBlindLevel)
      : this.blindLevelRepository;
  }

  async findByStatus(
    status: TournamentStatus | TournamentStatus[],
    manager?: EntityManager,
  ): Promise<Tournament[]> {
    const statuses = Array.isArray(status) ? status : [status];
    return this.getRepo(manager).find({ where: { status: In(statuses) } });
  }

  async updateStatus(
    id: string,
    status: TournamentStatus,
    manager?: EntityManager,
  ): Promise<Tournament | null> {
    const updates: Partial<Tournament> = { status };
    if (status === "running") {
      updates.started_at = new Date();
    } else if (status === "finished" || status === "cancelled") {
      updates.finished_at = new Date();
    }
    return this.update(id, updates, manager);
  }

  async createEntry(
    data: Partial<TournamentEntry>,
    manager?: EntityManager,
  ): Promise<TournamentEntry> {
    const repo = this.getEntryRepo(manager);
    const entry = repo.create(data);
    return repo.save(entry);
  }

  async getEntries(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentEntry[]> {
    return this.getEntryRepo(manager).find({
      where: { tournament_id: tournamentId },
      relations: ["bot"],
    });
  }

  async getActiveEntries(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentEntry[]> {
    return this.getEntryRepo(manager).find({
      where: { tournament_id: tournamentId, finish_position: IsNull() },
      relations: ["bot"],
    });
  }

  async bustEntry(
    tournamentId: string,
    botId: string,
    bustLevel: number,
    finishPosition: number,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getEntryRepo(manager).update(
      { tournament_id: tournamentId, bot_id: botId },
      { bust_level: bustLevel, finish_position: finishPosition },
    );
  }

  async setEntryPayout(
    tournamentId: string,
    botId: string,
    payout: number,
    finishPosition: number,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getEntryRepo(manager).update(
      { tournament_id: tournamentId, bot_id: botId },
      { payout, finish_position: finishPosition },
    );
  }

  async createTable(
    data: Partial<TournamentTable>,
    manager?: EntityManager,
  ): Promise<TournamentTable> {
    const repo = this.getTableRepo(manager);
    const table = repo.create(data);
    return repo.save(table);
  }

  async updateTableGame(
    tableId: string,
    gameId: string | null,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getTableRepo(manager).update(tableId, { game_id: gameId });
  }

  async updateTableStatus(
    tableId: string,
    status: TableStatus,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getTableRepo(manager).update(tableId, { status });
  }

  async getTables(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentTable[]> {
    return this.getTableRepo(manager).find({
      where: { tournament_id: tournamentId },
      order: { table_number: "ASC" },
    });
  }

  async seatBot(
    data: Partial<TournamentSeat>,
    manager?: EntityManager,
  ): Promise<TournamentSeat> {
    const repo = this.getSeatRepo(manager);
    const existing = await repo.findOne({
      where: {
        tournament_id: data.tournament_id,
        bot_id: data.bot_id,
      },
    });
    if (existing) {
      await repo.update(existing.id, data);
      return { ...existing, ...data } as TournamentSeat;
    }
    const seat = repo.create(data);
    return repo.save(seat);
  }

  async updateSeatChips(
    tournamentId: string,
    botId: string,
    chips: number,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getSeatRepo(manager).update(
      { tournament_id: tournamentId, bot_id: botId },
      { chips },
    );
  }

  async bustSeat(
    tournamentId: string,
    botId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getSeatRepo(manager).update(
      { tournament_id: tournamentId, bot_id: botId },
      { busted: true, chips: 0 },
    );
  }

  async startBlindLevel(
    data: Partial<TournamentBlindLevel>,
    manager?: EntityManager,
  ): Promise<TournamentBlindLevel> {
    const repo = this.getBlindLevelRepo(manager);
    const existing = await repo.findOne({
      where: {
        tournament_id: data.tournament_id,
        level: data.level,
      },
    });

    if (existing) {
      const startedAt = new Date();
      await repo.update(existing.id, {
        small_blind: data.small_blind,
        big_blind: data.big_blind,
        ante: data.ante,
        started_at: startedAt,
      });
      return {
        ...existing,
        ...data,
        started_at: startedAt,
      } as TournamentBlindLevel;
    }

    const level = repo.create({ ...data, started_at: new Date() });
    return repo.save(level);
  }

  async incrementLevelHands(
    tournamentId: string,
    level: number,
    amount: number = 1,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getBlindLevelRepo(manager).increment(
      { tournament_id: tournamentId, level },
      "hands_played",
      amount,
    );
  }

  async getCurrentLevel(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentBlindLevel | null> {
    return this.getBlindLevelRepo(manager).findOne({
      where: { tournament_id: tournamentId },
      order: { level: "DESC" },
    });
  }

  async getResults(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentEntry[]> {
    return this.getEntryRepo(manager).find({
      where: { tournament_id: tournamentId },
      relations: ["bot"],
      order: { finish_position: "ASC" },
    });
  }

  async deleteEntry(entryId: string, manager?: EntityManager): Promise<void> {
    await this.getEntryRepo(manager).delete(entryId);
  }

  async findEntryByBotId(
    tournamentId: string,
    botId: string,
    manager?: EntityManager,
  ): Promise<TournamentEntry | null> {
    return this.getEntryRepo(manager).findOne({
      where: { tournament_id: tournamentId, bot_id: botId },
    });
  }

  async getSeatsOrderedByChips(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentSeat[]> {
    return this.getSeatRepo(manager).find({
      where: { tournament_id: tournamentId },
      relations: ["bot"],
      order: { chips: "DESC" },
    });
  }

  async getSeats(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentSeat[]> {
    return this.getSeatRepo(manager).find({
      where: { tournament_id: tournamentId },
      relations: ["bot"],
    });
  }

  /**
   * Get entry counts for multiple tournaments in a single query.
   * Fixes N+1 query issue in findAll().
   */
  async getEntryCounts(
    tournamentIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    if (tournamentIds.length === 0) {
      return new Map();
    }

    const results = await this.getEntryRepo(manager)
      .createQueryBuilder("e")
      .select("e.tournament_id", "tournamentId")
      .addSelect("COUNT(*)", "count")
      .where("e.tournament_id IN (:...ids)", { ids: tournamentIds })
      .groupBy("e.tournament_id")
      .getRawMany();

    return new Map(
      results.map((r: { tournamentId: string; count: string }) => [
        r.tournamentId,
        parseInt(r.count, 10),
      ]),
    );
  }

  /**
   * Update the scheduled start time for a tournament.
   */
  async updateSchedule(
    id: string,
    scheduledStartAt: Date | null,
  ): Promise<void> {
    await this.repository.update(id, {
      scheduled_start_at: scheduledStartAt,
    });
  }

  /**
   * Find upcoming scheduled tournaments (within the next 7 days).
   */
  async findUpcomingScheduled(): Promise<Tournament[]> {
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return this.repository
      .createQueryBuilder("t")
      .where("t.type = :type", { type: "scheduled" })
      .andWhere("t.status = :status", { status: "registering" })
      .andWhere("t.scheduled_start_at IS NOT NULL")
      .andWhere("t.scheduled_start_at > :now", { now })
      .andWhere("t.scheduled_start_at <= :oneWeekFromNow", { oneWeekFromNow })
      .orderBy("t.scheduled_start_at", "ASC")
      .getMany();
  }
}
