import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { Table, TableStatus } from "../entities/table.entity";
import { TableSeat } from "../entities/table-seat.entity";
import { Bot } from "../entities/bot.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class TableRepository extends BaseRepository<Table> {
  constructor(
    @InjectRepository(Table)
    protected readonly repository: Repository<Table>,
    @InjectRepository(TableSeat)
    private readonly seatRepository: Repository<TableSeat>,
  ) {
    super();
  }

  async findByStatus(
    status: TableStatus,
    manager?: EntityManager,
  ): Promise<Table[]> {
    const repo = manager ? manager.getRepository(Table) : this.repository;
    return repo.find({ where: { status } });
  }

  async updateStatus(
    id: string,
    status: TableStatus,
    manager?: EntityManager,
  ): Promise<Table | null> {
    return this.update(id, { status }, manager);
  }

  async atomicJoinTable(
    tableId: string,
    botId: string,
    maxPlayers: number,
    manager: EntityManager,
  ): Promise<{ ok: boolean; error?: string }> {
    const seatRepo = manager.getRepository(TableSeat);
    const botRepo = manager.getRepository(Bot);

    const seatedCount = await seatRepo.count({
      where: { table_id: tableId, disconnected: false },
    });

    if (seatedCount >= maxPlayers) {
      return { ok: false, error: `Table is full (max ${maxPlayers} players)` };
    }

    const existing = await seatRepo.findOne({
      where: { table_id: tableId, bot_id: botId },
    });

    if (existing && !existing.disconnected) {
      return { ok: false, error: "This bot is already seated at this table" };
    }

    // Check if another bot owned by the same user is already seated
    const joiningBot = await botRepo.findOne({ where: { id: botId } });
    if (!joiningBot) {
      return { ok: false, error: "Bot not found" };
    }

    const seatedBots = await seatRepo.find({
      where: { table_id: tableId, disconnected: false },
      relations: ["bot"],
    });

    const sameOwnerBot = seatedBots.find(
      (seat) => seat.bot && seat.bot.user_id === joiningBot.user_id,
    );

    if (sameOwnerBot) {
      return {
        ok: false,
        error: `You already have a bot (${sameOwnerBot.bot.name}) seated at this table. Only one bot per player allowed.`,
      };
    }

    if (existing) {
      existing.disconnected = false;
      existing.disconnected_at = null;
      await seatRepo.save(existing);
    } else {
      const seat = seatRepo.create({
        table_id: tableId,
        bot_id: botId,
        joined_at: new Date(),
        disconnected: false,
      });
      await seatRepo.save(seat);
    }

    return { ok: true };
  }

  async getSeatsWithBots(
    tableId: string,
    manager?: EntityManager,
  ): Promise<TableSeat[]> {
    const repo = manager
      ? manager.getRepository(TableSeat)
      : this.seatRepository;
    return repo.find({
      where: { table_id: tableId, disconnected: false },
      relations: ["bot"],
    });
  }

  async markSeatDisconnected(
    tableId: string,
    botId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(TableSeat)
      : this.seatRepository;
    await repo.update(
      { table_id: tableId, bot_id: botId },
      { disconnected: true, disconnected_at: new Date() },
    );
  }

  async getSeatCount(
    tableId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager
      ? manager.getRepository(TableSeat)
      : this.seatRepository;
    return repo.count({ where: { table_id: tableId, disconnected: false } });
  }
}
