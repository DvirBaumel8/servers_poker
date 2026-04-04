import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { BaseRepository } from "./base.repository";
import { Wallet } from "../entities/wallet.entity";

@Injectable()
export class WalletRepository extends BaseRepository<Wallet> {
  protected get entityName(): string {
    return "Wallet";
  }

  constructor(
    @InjectRepository(Wallet)
    protected readonly repository: Repository<Wallet>,
  ) {
    super();
  }

  async findByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<Wallet | null> {
    return this.getRepo(manager).findOne({ where: { user_id: userId } });
  }

  async findByUserIdOrThrow(
    userId: string,
    manager?: EntityManager,
  ): Promise<Wallet> {
    const wallet = await this.findByUserId(userId, manager);
    if (!wallet) {
      throw new NotFoundException(`Wallet for user ${userId} not found`);
    }
    return wallet;
  }

  /**
   * Atomic credit — single UPDATE statement, no race conditions.
   * UPDATE wallets SET balance = balance + amount WHERE id = walletId RETURNING *
   */
  async creditBalance(
    walletId: string,
    amount: bigint,
    manager?: EntityManager,
  ): Promise<Wallet> {
    const repo = this.getRepo(manager);
    await repo
      .createQueryBuilder()
      .update(Wallet)
      .set({ balance: () => `balance + ${amount.toString()}` })
      .where("id = :id", { id: walletId })
      .execute();
    return this.findByIdOrThrow(walletId, manager);
  }

  /**
   * Atomic debit — returns null if insufficient funds.
   * UPDATE wallets SET balance = balance - amount WHERE id = walletId AND balance >= amount
   */
  async debitBalance(
    walletId: string,
    amount: bigint,
    manager?: EntityManager,
  ): Promise<Wallet | null> {
    const repo = this.getRepo(manager);
    const result = await repo
      .createQueryBuilder()
      .update(Wallet)
      .set({ balance: () => `balance - ${amount.toString()}` })
      .where("id = :id AND balance >= :amount", {
        id: walletId,
        amount: amount.toString(),
      })
      .execute();

    if ((result.affected ?? 0) === 0) {
      return null;
    }
    return this.findByIdOrThrow(walletId, manager);
  }
}
