/**
 * Worker Thread Message Protocol
 * ==============================
 * Type definitions for communication between main thread and game workers.
 */

// ============================================================================
// Player Configuration
// ============================================================================

export interface PlayerConfig {
  id: string;
  name: string;
  endpoint: string;
  chips?: number;
}

// ============================================================================
// Game Configuration
// ============================================================================

export interface GameConfig {
  tableId: string;
  gameDbId: string;
  tournamentId?: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  startingChips: number;
  turnTimeoutMs: number;
}

// ============================================================================
// Game State (sent from worker to main)
// ============================================================================

export interface WorkerGameState {
  tableId: string;
  gameId: string;
  status: "waiting" | "running" | "finished" | "error";
  handNumber: number;
  stage: string;
  pot: number;
  currentBet: number;
  communityCards: string[];
  activePlayerId: string | null;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  players: WorkerPlayerState[];
  log: Array<{ message: string; timestamp: number }>;
}

export interface WorkerPlayerState {
  id: string;
  name: string;
  chips: number;
  folded: boolean;
  allIn: boolean;
  disconnected: boolean;
  strikes: number;
  position: string | null;
  bet: number;
  holeCards?: string[];
}

// ============================================================================
// Winner Information
// ============================================================================

export interface WinnerInfo {
  playerId: string;
  playerName: string;
  amount: number;
  hand?: {
    name: string;
    cards: string[];
  };
}

// ============================================================================
// Main Thread -> Worker Commands
// ============================================================================

export type WorkerCommand =
  | { type: "ADD_PLAYER"; player: PlayerConfig }
  | { type: "REMOVE_PLAYER"; playerId: string }
  | { type: "STOP" }
  | { type: "GET_STATE" }
  | {
      type: "UPDATE_BLINDS";
      smallBlind: number;
      bigBlind: number;
      ante?: number;
    };

// ============================================================================
// Worker -> Main Thread Events
// ============================================================================

export type WorkerEvent =
  | { type: "READY"; tableId: string }
  | { type: "STATE_UPDATE"; tableId: string; state: WorkerGameState }
  | {
      type: "PLAYER_JOINED";
      tableId: string;
      playerId: string;
      playerName: string;
    }
  | { type: "PLAYER_LEFT"; tableId: string; playerId: string }
  | {
      type: "HAND_STARTED";
      tableId: string;
      handNumber: number;
      dealerName: string;
    }
  | {
      type: "HAND_COMPLETE";
      tableId: string;
      handNumber: number;
      winners: WinnerInfo[];
      atShowdown: boolean;
    }
  | {
      type: "GAME_FINISHED";
      tableId: string;
      winnerId: string | null;
      winnerName: string | null;
    }
  | { type: "ERROR"; tableId: string; error: string; fatal: boolean }
  | {
      type: "LOG";
      tableId: string;
      level: "debug" | "info" | "warn" | "error";
      message: string;
    };

// ============================================================================
// Worker Initialization Data (passed via workerData)
// ============================================================================

export interface WorkerInitData {
  gameConfig: GameConfig;
  players?: PlayerConfig[];
  enableHmacSigning?: boolean;
  hmacSecret?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isWorkerCommand(msg: unknown): msg is WorkerCommand {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === "ADD_PLAYER" ||
    m.type === "REMOVE_PLAYER" ||
    m.type === "STOP" ||
    m.type === "GET_STATE" ||
    m.type === "UPDATE_BLINDS"
  );
}

export function isWorkerEvent(msg: unknown): msg is WorkerEvent {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === "READY" ||
    m.type === "STATE_UPDATE" ||
    m.type === "PLAYER_JOINED" ||
    m.type === "PLAYER_LEFT" ||
    m.type === "HAND_STARTED" ||
    m.type === "HAND_COMPLETE" ||
    m.type === "GAME_FINISHED" ||
    m.type === "ERROR" ||
    m.type === "LOG"
  );
}
