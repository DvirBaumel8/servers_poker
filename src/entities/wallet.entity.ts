import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Transaction } from "./transaction.entity";
import { bigIntTransformer } from "../common/transformers/bigint.transformer";

@Entity("wallets")
export class Wallet extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: "varchar", length: 36 })
  user_id!: string;

  @Column({ type: "bigint", default: 0, transformer: bigIntTransformer })
  balance: bigint = 0n;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user!: User;

  @OneToMany(() => Transaction, (tx) => tx.wallet)
  transactions?: Transaction[];
}
