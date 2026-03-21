import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager, IsNull, Not, LessThan } from "typeorm";
import {
  BotSubscription,
  SubscriptionStatus,
} from "../entities/bot-subscription.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class BotSubscriptionRepository extends BaseRepository<BotSubscription> {
  constructor(
    @InjectRepository(BotSubscription)
    protected readonly repository: Repository<BotSubscription>,
  ) {
    super();
  }

  protected get entityName(): string {
    return "Subscription";
  }

  async findByBotId(
    botId: string,
    manager?: EntityManager,
  ): Promise<BotSubscription[]> {
    return this.getRepo(manager).find({
      where: { bot_id: botId },
      relations: ["tournament"],
      order: { priority: "DESC", created_at: "DESC" },
    });
  }

  async findActiveByBotId(
    botId: string,
    manager?: EntityManager,
  ): Promise<BotSubscription[]> {
    return this.getRepo(manager).find({
      where: { bot_id: botId, status: "active" },
      relations: ["tournament"],
      order: { priority: "DESC" },
    });
  }

  async findByTournamentId(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<BotSubscription[]> {
    return this.getRepo(manager).find({
      where: { tournament_id: tournamentId, status: "active" },
      relations: ["bot"],
      order: { priority: "DESC" },
    });
  }

  async findAllActive(manager?: EntityManager): Promise<BotSubscription[]> {
    const now = new Date();
    return this.getRepo(manager).find({
      where: [
        { status: "active", expires_at: IsNull() },
        { status: "active", expires_at: Not(LessThan(now)) },
      ],
      relations: ["bot", "tournament"],
      order: { priority: "DESC" },
    });
  }

  async findMatchingSubscriptions(
    tournamentType: string,
    buyIn: number,
    manager?: EntityManager,
  ): Promise<BotSubscription[]> {
    const query = this.getRepo(manager)
      .createQueryBuilder("sub")
      .leftJoinAndSelect("sub.bot", "bot")
      .where("sub.status = :status", { status: "active" })
      .andWhere("sub.tournament_id IS NULL")
      .andWhere("bot.active = true")
      .andWhere(
        "(sub.tournament_type_filter IS NULL OR sub.tournament_type_filter = :type)",
        { type: tournamentType },
      )
      .andWhere("(sub.min_buy_in IS NULL OR sub.min_buy_in <= :buyIn)", {
        buyIn,
      })
      .andWhere("(sub.max_buy_in IS NULL OR sub.max_buy_in >= :buyIn)", {
        buyIn,
      })
      .andWhere("(sub.expires_at IS NULL OR sub.expires_at > :now)", {
        now: new Date(),
      })
      .orderBy("sub.priority", "DESC");

    return query.getMany();
  }

  async incrementSuccessful(
    id: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.getRepo(manager);
    await repo.increment({ id }, "successful_registrations", 1);
    await repo.update(id, { last_registration_attempt: new Date() });
  }

  async incrementFailed(id: string, manager?: EntityManager): Promise<void> {
    const repo = this.getRepo(manager);
    await repo.increment({ id }, "failed_registrations", 1);
    await repo.update(id, { last_registration_attempt: new Date() });
  }

  async updateStatus(
    id: string,
    status: SubscriptionStatus,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getRepo(manager).update(id, { status });
  }

  async findByBotAndTournament(
    botId: string,
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<BotSubscription | null> {
    return this.getRepo(manager).findOne({
      where: { bot_id: botId, tournament_id: tournamentId },
    });
  }

  async deleteExpired(manager?: EntityManager): Promise<number> {
    const result = await this.getRepo(manager).delete({
      expires_at: LessThan(new Date()),
    });
    return result.affected || 0;
  }
}
