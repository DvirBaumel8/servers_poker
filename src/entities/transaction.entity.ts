import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Wallet } from "./wallet.entity";
import { bigIntTransformer } from "../common/transformers/bigint.transformer";

export type TransactionType =
  | "deposit"
  | "withdrawal"
  | "buy_in"
  | "payout"
  | "prize";

@Entity("transactions")
@Index(["wallet_id", "created_at"])
export class Transaction extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  wallet_id: string;

  @Index()
  @Column({ type: "varchar", length: 20 })
  type: TransactionType;

  @Column({ type: "bigint", transformer: bigIntTransformer })
  amount: bigint;

  @Column({ type: "varchar", length: 36, nullable: true })
  reference_id: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  description: string | null;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: "wallet_id" })
  wallet: Wallet;
}
