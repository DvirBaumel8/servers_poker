export interface SimBotEntry {
  botId: string;
  name: string;
  strategy: Record<string, any> | null;
}

export interface SimBlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  handsPerLevel: number;
}

export interface SimTournamentConfig {
  tournamentId: string;
  blindLevels: SimBlindLevel[];
  startingChips: number;
  seatsPerTable: number;
  breakThreshold: number;
}

export interface SimulationInput {
  config: SimTournamentConfig;
  entries: SimBotEntry[];
}

export interface SimBustRecord {
  botId: string;
  bustLevel: number;
  finishPosition: number;
}

export interface SimGame {
  gameId: string;
  tableId: string;
}

export interface SimCardData {
  rank: string;
  suit: string;
}

export interface SimHand {
  handId: string;
  gameId: string;
  handNumber: number;
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  pot: number;
  communityCards: SimCardData[];
  startedAt: string;
  finishedAt: string;
}

export interface SimHandPlayer {
  handId: string;
  botId: string;
  position: number;
  holeCards: SimCardData[];
  startChips: number;
  endChips: number;
  amountBet: number;
  won: boolean;
  amountWon: number;
  folded: boolean;
  allIn: boolean;
  sawShowdown: boolean;
}

export interface SimAction {
  handId: string;
  botId: string;
  street: string;
  action: string;
  amount: number;
  sequence: number;
  potAfter: number;
  chipsAfter: number | null;
}

export interface SimulationOutput {
  tournamentId: string;
  winnerId: string | null;
  winnerName: string | null;
  bustOrder: SimBustRecord[];
  games: SimGame[];
  hands: SimHand[];
  handPlayers: SimHandPlayer[];
  actions: SimAction[];
  durationMs: number;
  totalHands: number;
}

// ─── Hand Simulation (headless sandbox) ──────────────────────────────────────

export interface HandSimBot {
  id: string;
  name: string;
  strategy: Record<string, any>;
}

export interface HandSimulationInput {
  simulationId: string;
  targetBot: HandSimBot;
  opponents: HandSimBot[];
  handCount: number;
  smallBlind: number;
  bigBlind: number;
  /** Starting chips per player. Defaults to bigBlind * (handCount + 500) if not provided. */
  startingChips?: number;
}

export interface HandSimulationOutput {
  simulationId: string;
  handsPlayed: number;
  targetBotStartChips: number;
  targetBotEndChips: number;
  handsWon: number;
  vpipHands: number;
  pfrHands: number;
  aggressiveActions: number;
  passiveActions: number;
  /** Win/loss/hands per position key. */
  heatmap: Record<string, { wins: number; losses: number; hands: number }>;
  durationMs: number;
}

export type HandSimWorkerMessage =
  | { type: "ready" }
  | { type: "progress"; simulationId: string; handsCompleted: number }
  | { type: "result"; simulationId: string; output: HandSimulationOutput }
  | { type: "error"; simulationId: string; error: string; stack?: string };

// ─── Pool ↔ Worker message protocol ──────────────────────────────────────────

export type PoolToWorkerMessage = {
  type: "run";
  taskId: string;
  input: SimulationInput;
};

export type WorkerToPoolMessage =
  | { type: "ready" }
  | { type: "heartbeat"; taskId: string; timestamp: number }
  | { type: "result"; taskId: string; output: SimulationOutput }
  | { type: "error"; taskId: string; error: string; stack?: string };

// ─── Pool metrics ─────────────────────────────────────────────────────────────

export interface PoolMetrics {
  poolSize: number;
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  /** Rolling average of queue wait time, last 100 completions (ms). */
  recentAvgWaitMs: number;
  /** Rolling average of task execution time, last 100 completions (ms). */
  recentAvgTaskMs: number;
}
