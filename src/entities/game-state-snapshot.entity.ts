import { Entity, Column, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";

export type SnapshotStatus = "active" | "recovered" | "orphaned" | "completed";

@Entity("game_state_snapshots")
@Index(["game_id"])
@Index(["table_id"])
@Index(["status"])
@Check(`"hand_number" >= 0`)
export class GameStateSnapshot extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  game_id: string;

  @Column({ type: "varchar", length: 36 })
  table_id: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  tournament_id: string | null;

  @Column({ type: "varchar", length: 20, default: "active" })
  status: SnapshotStatus;

  @Column({ type: "integer", default: 0 })
  hand_number: number;

  @Column({ type: "varchar", length: 20, default: "waiting" })
  game_stage: string;

  @Column({ type: "integer", default: 0 })
  dealer_index: number;

  @Column({ type: "bigint", default: 0 })
  pot: number;

  @Column({ type: "bigint", default: 0 })
  current_bet: number;

  @Column({ type: "bigint" })
  small_blind: number;

  @Column({ type: "bigint" })
  big_blind: number;

  @Column({ type: "bigint", default: 0 })
  ante: number;

  @Column({ type: "bigint" })
  starting_chips: number;

  @Column({ type: "integer", default: 10000 })
  turn_timeout_ms: number;

  @Column({ type: "jsonb", default: [] })
  community_cards: Array<{ rank: string; suit: string }>;

  @Column({ type: "varchar", length: 36, nullable: true })
  active_player_id: string | null;

  @Column({ type: "jsonb" })
  players: Array<{
    id: string;
    name: string;
    endpoint: string;
    chips: number;
    holeCards: Array<{ rank: string; suit: string }>;
    folded: boolean;
    allIn: boolean;
    strikes: number;
    disconnected: boolean;
    currentBet: number;
  }>;

  @Column({ type: "jsonb", nullable: true })
  pot_state: {
    mainPot: number;
    sidePots: Array<{ amount: number; eligiblePlayers: string[] }>;
  } | null;

  @Column({ type: "jsonb", nullable: true })
  betting_round_state: {
    currentBet: number;
    playerBets: Record<string, number>;
    actedPlayers: string[];
    lastRaiseAmount: number;
  } | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  server_instance_id: string | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  last_action_at: Date | null;

  @Column({ type: "jsonb", default: [] })
  action_log: Array<{
    message: string;
    timestamp: number;
  }>;
}
