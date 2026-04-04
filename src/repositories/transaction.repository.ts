import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { BaseRepository } from "./base.repository";
import { Transaction } from "../entities/transaction.entity";

@Injectable()
export class TransactionRepository extends BaseRepository<Transaction> {
  protected get entityName(): string {
    return "Transaction";
  }

  constructor(
    @InjectRepository(Transaction)
    protected readonly repository: Repository<Transaction>,
  ) {
    super();
  }

  async findByWalletId(
    walletId: string,
    limit = 20,
    offset = 0,
    manager?: EntityManager,
  ): Promise<[Transaction[], number]> {
    return this.getRepo(manager).findAndCount({
      where: { wallet_id: walletId },
      order: { created_at: "DESC" },
      take: limit,
      skip: offset,
    });
  }

  async findByReferenceId(
    referenceId: string,
    manager?: EntityManager,
  ): Promise<Transaction[]> {
    return this.getRepo(manager).find({
      where: { reference_id: referenceId },
      order: { created_at: "DESC" },
    });
  }
}
