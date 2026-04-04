import { Entity, Column, Index, OneToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "./base.entity";
import { bigIntTransformer } from "../common/transformers/bigint.transformer";
import { Simulation } from "./simulation.entity";

export interface PositionHeatmapEntry {
  hands: number;
  wins: number;
  losses: number;
}

export type HeatmapData = Record<string, PositionHeatmapEntry>;

@Entity("simulation_results")
export class SimulationResult extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: "varchar", length: 36 })
  simulation_id: string;

  @OneToOne(() => Simulation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "simulation_id" })
  simulation: Simulation;

  /** Net chip profit/loss for the target bot over all simulated hands. */
  @Column({ type: "bigint", default: 0, transformer: bigIntTransformer })
  total_profit: bigint;

  /**
   * Big Blinds won per 100 hands.
   * Formula: (total_profit / big_blind) * 100 / hand_count
   */
  @Column({ type: "float", default: 0 })
  bb_per_100: number;

  /** Fraction of hands won by the target bot (0–1). */
  @Column({ type: "float", default: 0 })
  win_rate: number;

  /** Voluntarily Put In Pot: fraction of hands where target bot called/raised pre-flop (0–1). */
  @Column({ type: "float", default: 0 })
  vpip: number;

  /** Pre-Flop Raise: fraction of hands where target bot raised pre-flop (0–1). */
  @Column({ type: "float", default: 0 })
  pfr: number;

  /**
   * Aggression Factor: (total bets + total raises) / total calls.
   * Higher = more aggressive. Infinity when calls = 0 (stored as 9999).
   */
  @Column({ type: "float", default: 0 })
  aggression_factor: number;

  /**
   * Win/loss frequency per position (SB, BB, UTG, CO, BTN, etc.).
   * JSON: { "BTN": { hands: 120, wins: 60, losses: 60 }, "SB": {...}, ... }
   */
  @Column({ type: "jsonb", default: {} })
  heatmap_data: HeatmapData;

  /**
   * Average equity realized at showdown vs actual pot share won.
   * 1.0 = bot realizes 100% of equity. < 1.0 = underperforming.
   */
  @Column({ type: "float", default: 0 })
  equity_realization: number;
}
