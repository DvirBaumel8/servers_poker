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

  async findByStatus(
    status: TournamentStatus | TournamentStatus[],
    manager?: EntityManager,
  ): Promise<Tournament[]> {
    const repo = manager ? manager.getRepository(Tournament) : this.repository;
    const statuses = Array.isArray(status) ? status : [status];
    return repo.find({ where: { status: In(statuses) } });
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
    const repo = manager
      ? manager.getRepository(TournamentEntry)
      : this.entryRepository;
    const entry = repo.create(data);
    return repo.save(entry);
  }

  async getEntries(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentEntry[]> {
    const repo = manager
      ? manager.getRepository(TournamentEntry)
      : this.entryRepository;
    return repo.find({
      where: { tournament_id: tournamentId },
      relations: ["bot"],
    });
  }

  async getActiveEntries(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentEntry[]> {
    const repo = manager
      ? manager.getRepository(TournamentEntry)
      : this.entryRepository;
    return repo.find({
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
    const repo = manager
      ? manager.getRepository(TournamentEntry)
      : this.entryRepository;
    await repo.update(
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
    const repo = manager
      ? manager.getRepository(TournamentEntry)
      : this.entryRepository;
    await repo.update(
      { tournament_id: tournamentId, bot_id: botId },
      { payout, finish_position: finishPosition },
    );
  }

  async createTable(
    data: Partial<TournamentTable>,
    manager?: EntityManager,
  ): Promise<TournamentTable> {
    const repo = manager
      ? manager.getRepository(TournamentTable)
      : this.tableRepository;
    const table = repo.create(data);
    return repo.save(table);
  }

  async updateTableGame(
    tableId: string,
    gameId: string | null,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(TournamentTable)
      : this.tableRepository;
    await repo.update(tableId, { game_id: gameId });
  }

  async updateTableStatus(
    tableId: string,
    status: TableStatus,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(TournamentTable)
      : this.tableRepository;
    await repo.update(tableId, { status });
  }

  async getTables(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentTable[]> {
    const repo = manager
      ? manager.getRepository(TournamentTable)
      : this.tableRepository;
    return repo.find({
      where: { tournament_id: tournamentId },
      order: { table_number: "ASC" },
    });
  }

  async seatBot(
    data: Partial<TournamentSeat>,
    manager?: EntityManager,
  ): Promise<TournamentSeat> {
    const repo = manager
      ? manager.getRepository(TournamentSeat)
      : this.seatRepository;
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
    const repo = manager
      ? manager.getRepository(TournamentSeat)
      : this.seatRepository;
    await repo.update(
      { tournament_id: tournamentId, bot_id: botId },
      { chips },
    );
  }

  async bustSeat(
    tournamentId: string,
    botId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(TournamentSeat)
      : this.seatRepository;
    await repo.update(
      { tournament_id: tournamentId, bot_id: botId },
      { busted: true, chips: 0 },
    );
  }

  async startBlindLevel(
    data: Partial<TournamentBlindLevel>,
    manager?: EntityManager,
  ): Promise<TournamentBlindLevel> {
    const repo = manager
      ? manager.getRepository(TournamentBlindLevel)
      : this.blindLevelRepository;
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
    const repo = manager
      ? manager.getRepository(TournamentBlindLevel)
      : this.blindLevelRepository;
    await repo.increment(
      { tournament_id: tournamentId, level },
      "hands_played",
      amount,
    );
  }

  async getCurrentLevel(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentBlindLevel | null> {
    const repo = manager
      ? manager.getRepository(TournamentBlindLevel)
      : this.blindLevelRepository;
    return repo.findOne({
      where: { tournament_id: tournamentId },
      order: { level: "DESC" },
    });
  }

  async getResults(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentEntry[]> {
    const repo = manager
      ? manager.getRepository(TournamentEntry)
      : this.entryRepository;
    return repo.find({
      where: { tournament_id: tournamentId },
      relations: ["bot"],
      order: { finish_position: "ASC" },
    });
  }

  async deleteEntry(entryId: string, manager?: EntityManager): Promise<void> {
    const repo = manager
      ? manager.getRepository(TournamentEntry)
      : this.entryRepository;
    await repo.delete(entryId);
  }

  async findEntryByBotId(
    tournamentId: string,
    botId: string,
    manager?: EntityManager,
  ): Promise<TournamentEntry | null> {
    const repo = manager
      ? manager.getRepository(TournamentEntry)
      : this.entryRepository;
    return repo.findOne({
      where: { tournament_id: tournamentId, bot_id: botId },
    });
  }

  async getSeatsOrderedByChips(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentSeat[]> {
    const repo = manager
      ? manager.getRepository(TournamentSeat)
      : this.seatRepository;
    return repo.find({
      where: { tournament_id: tournamentId },
      relations: ["bot"],
      order: { chips: "DESC" },
    });
  }

  async getSeats(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentSeat[]> {
    const repo = manager
      ? manager.getRepository(TournamentSeat)
      : this.seatRepository;
    return repo.find({
      where: { tournament_id: tournamentId },
      relations: ["bot"],
    });
  }
}
