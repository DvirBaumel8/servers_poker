import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { Bot } from "../entities/bot.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class BotRepository extends BaseRepository<Bot> {
  constructor(
    @InjectRepository(Bot)
    protected readonly repository: Repository<Bot>,
  ) {
    super();
  }

  async findByName(name: string, manager?: EntityManager): Promise<Bot | null> {
    const repo = manager ? manager.getRepository(Bot) : this.repository;
    return repo.findOne({ where: { name } });
  }

  async findByUserId(userId: string, manager?: EntityManager): Promise<Bot[]> {
    const repo = manager ? manager.getRepository(Bot) : this.repository;
    return repo.find({ where: { user_id: userId } });
  }

  async findActiveByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<Bot[]> {
    const repo = manager ? manager.getRepository(Bot) : this.repository;
    return repo.find({ where: { user_id: userId, active: true } });
  }

  async updateEndpoint(
    id: string,
    endpoint: string,
    manager?: EntityManager,
  ): Promise<Bot | null> {
    return this.update(id, { endpoint }, manager);
  }

  async deactivate(id: string, manager?: EntityManager): Promise<Bot | null> {
    return this.update(id, { active: false }, manager);
  }

  async activate(id: string, manager?: EntityManager): Promise<Bot | null> {
    return this.update(id, { active: true }, manager);
  }
}
