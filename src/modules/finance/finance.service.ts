import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { WalletRepository } from "../../repositories/wallet.repository";
import { TransactionRepository } from "../../repositories/transaction.repository";
import { Wallet } from "../../entities/wallet.entity";
import {
  Transaction,
  TransactionType,
} from "../../entities/transaction.entity";
import {
  WalletResponseDto,
  TransactionResponseDto,
  PaginatedTransactionsDto,
} from "./dto/finance.dto";

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createWallet(userId: string): Promise<WalletResponseDto> {
    const existing = await this.walletRepository.findByUserId(userId);
    if (existing) {
      throw new ConflictException("Wallet already exists for this user");
    }
    const wallet = await this.walletRepository.create({
      user_id: userId,
      balance: 0n,
    });
    this.logger.log(`Wallet created for user ${userId}`);
    return this.toWalletResponse(wallet);
  }

  async getWallet(userId: string): Promise<WalletResponseDto> {
    let wallet = await this.walletRepository.findByUserId(userId);
    if (!wallet) {
      wallet = await this.walletRepository.create({
        user_id: userId,
        balance: 0n,
      });
      this.logger.log(`Wallet auto-created for user ${userId}`);
    }
    return this.toWalletResponse(wallet);
  }

  /**
   * Deposit funds — atomic: credit wallet + insert transaction record in one Postgres transaction.
   */
  async deposit(
    userId: string,
    amount: number,
  ): Promise<TransactionResponseDto> {
    const amountBig = BigInt(amount);
    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.walletRepository.findByUserIdOrThrow(
        userId,
        manager,
      );
      await this.walletRepository.creditBalance(wallet.id, amountBig, manager);
      const tx = await this.transactionRepository.create(
        {
          wallet_id: wallet.id,
          type: "deposit" as TransactionType,
          amount: amountBig,
          reference_id: undefined,
          description: `Deposit of ${amount}`,
        },
        manager,
      );
      this.logger.log(`Deposit ${amount} for user ${userId}`);
      return this.toTransactionResponse(tx);
    });
  }

  /**
   * Withdraw funds — atomic: debit wallet + insert transaction. Throws if insufficient balance.
   */
  async withdraw(
    userId: string,
    amount: number,
  ): Promise<TransactionResponseDto> {
    const amountBig = BigInt(amount);
    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.walletRepository.findByUserIdOrThrow(
        userId,
        manager,
      );
      const updated = await this.walletRepository.debitBalance(
        wallet.id,
        amountBig,
        manager,
      );
      if (!updated) {
        throw new BadRequestException("Insufficient balance");
      }
      const tx = await this.transactionRepository.create(
        {
          wallet_id: wallet.id,
          type: "withdrawal" as TransactionType,
          amount: amountBig,
          reference_id: undefined,
          description: `Withdrawal of ${amount}`,
        },
        manager,
      );
      this.logger.log(`Withdrawal ${amount} for user ${userId}`);
      return this.toTransactionResponse(tx);
    });
  }

  /**
   * Internal: deduct buy-in for matchmaking. Called within an external transaction.
   */
  async deductBuyIn(
    userId: string,
    amount: bigint,
    referenceId: string,
    manager?: EntityManager,
  ): Promise<Transaction> {
    const run = async (mgr: EntityManager) => {
      const wallet = await this.walletRepository.findByUserIdOrThrow(
        userId,
        mgr,
      );
      const updated = await this.walletRepository.debitBalance(
        wallet.id,
        amount,
        mgr,
      );
      if (!updated) {
        throw new BadRequestException(
          `Insufficient balance for buy-in (user ${userId})`,
        );
      }
      return this.transactionRepository.create(
        {
          wallet_id: wallet.id,
          type: "buy_in" as TransactionType,
          amount,
          reference_id: referenceId,
          description: `Tournament buy-in`,
        },
        mgr,
      );
    };
    return manager
      ? run(manager)
      : this.dataSource.transaction((mgr) => run(mgr));
  }

  /**
   * Internal: credit payout to a user's wallet. Called within an external transaction.
   */
  async creditPayout(
    userId: string,
    amount: bigint,
    referenceId: string,
    description: string,
    manager?: EntityManager,
  ): Promise<Transaction> {
    const run = async (mgr: EntityManager) => {
      const wallet = await this.walletRepository.findByUserIdOrThrow(
        userId,
        mgr,
      );
      await this.walletRepository.creditBalance(wallet.id, amount, mgr);
      return this.transactionRepository.create(
        {
          wallet_id: wallet.id,
          type: "payout" as TransactionType,
          amount,
          reference_id: referenceId,
          description,
        },
        mgr,
      );
    };
    return manager
      ? run(manager)
      : this.dataSource.transaction((mgr) => run(mgr));
  }

  async getTransactions(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<PaginatedTransactionsDto> {
    const wallet = await this.walletRepository.findByUserIdOrThrow(userId);
    const [txs, total] = await this.transactionRepository.findByWalletId(
      wallet.id,
      limit,
      offset,
    );
    return {
      data: txs.map((tx) => this.toTransactionResponse(tx)),
      total,
      limit,
      offset,
    };
  }

  private toWalletResponse(wallet: Wallet): WalletResponseDto {
    return {
      id: wallet.id,
      user_id: wallet.user_id,
      balance: wallet.balance.toString(),
      created_at: wallet.created_at,
    };
  }

  private toTransactionResponse(tx: Transaction): TransactionResponseDto {
    return {
      id: tx.id,
      wallet_id: tx.wallet_id,
      type: tx.type,
      amount: tx.amount.toString(),
      reference_id: tx.reference_id ?? null,
      description: tx.description ?? null,
      created_at: tx.created_at,
    };
  }
}
