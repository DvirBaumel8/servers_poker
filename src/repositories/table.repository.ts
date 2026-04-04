import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { Table, TableStatus } from "../entities/table.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class TableRepository extends BaseRepository<Table> {
  constructor(
    @InjectRepository(Table)
    protected readonly repository: Repository<Table>,
  ) {
    super();
  }

  protected get entityName(): string {
    return "Table";
  }

  async findByStatus(
    status: TableStatus,
    manager?: EntityManager,
  ): Promise<Table[]> {
    return this.getRepo(manager).find({ where: { status } });
  }

  async updateStatus(
    id: string,
    status: TableStatus,
    manager?: EntityManager,
  ): Promise<Table | null> {
    return this.update(id, { status }, manager);
  }
}
