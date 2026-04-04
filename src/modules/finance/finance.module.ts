import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Wallet } from "../../entities/wallet.entity";
import { Transaction } from "../../entities/transaction.entity";
import { User } from "../../entities/user.entity";
import { WalletRepository } from "../../repositories/wallet.repository";
import { TransactionRepository } from "../../repositories/transaction.repository";
import { FinanceService } from "./finance.service";
import { FinanceController } from "./finance.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Transaction, User])],
  controllers: [FinanceController],
  providers: [FinanceService, WalletRepository, TransactionRepository],
  exports: [FinanceService, WalletRepository],
})
export class FinanceModule {}
