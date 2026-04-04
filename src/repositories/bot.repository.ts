import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager, In } from "typeorm";
import { Bot } from "../entities/bot.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class BotRepository extends BaseRepository<Bot> {
  protected get entityName(): string {
    return "Bot";
  }

  constructor(
    @InjectRepository(Bot)
    protected readonly repository: Repository<Bot>,
  ) {
    super();
  }

  async findByName(name: string, manager?: EntityManager): Promise<Bot | null> {
    return this.getRepo(manager).findOne({ where: { name } });
  }

  async findByUserAndName(
    userId: string,
    name: string,
    manager?: EntityManager,
  ): Promise<Bot | null> {
    return this.getRepo(manager).findOne({ where: { user_id: userId, name } });
  }

  async findActiveByUserAndName(
    userId: string,
    name: string,
    manager?: EntityManager,
  ): Promise<Bot | null> {
    return this.getRepo(manager).findOne({
      where: { user_id: userId, name, active: true },
    });
  }

  async findByUserId(userId: string, manager?: EntityManager): Promise<Bot[]> {
    return this.getRepo(manager).find({ where: { user_id: userId } });
  }

  async findActiveByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<Bot[]> {
    return this.getRepo(manager).find({
      where: { user_id: userId, active: true },
    });
  }

  async deactivate(id: string, manager?: EntityManager): Promise<Bot | null> {
    return this.update(id, { active: false }, manager);
  }

  async activate(id: string, manager?: EntityManager): Promise<Bot | null> {
    return this.update(id, { active: true }, manager);
  }

  async findByIds(ids: string[], manager?: EntityManager): Promise<Bot[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.getRepo(manager).find({ where: { id: In(ids) } });
  }
}
