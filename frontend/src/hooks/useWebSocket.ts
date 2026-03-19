import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { GameState, HandResult } from "../types";

interface UseWebSocketOptions {
  autoConnect?: boolean;
  token?: string;
  onPlayerAction?: (action: PlayerAction) => void;
  onPlayerLeft?: (data: PlayerLeftEvent) => void;
  onGameFinished?: (data: GameFinishedEvent) => void;
  onHandStarted?: (data: HandStartedEvent) => void;
  onTournamentUpdate?: (update: TournamentUpdateEvent) => void;
}

interface PlayerAction {
  botId: string;
  action: string;
  amount: number;
  pot: number;
}

interface PlayerLeftEvent {
  playerId: string;
  playerName: string;
  reason: "disconnect" | "timeout" | "voluntary";
  remainingPlayers: number;
}

interface GameFinishedEvent {
  reason: string;
  winnerId?: string;
  winnerName?: string;
  finalChips?: Record<string, number>;
}

interface HandStartedEvent {
  tableId: string;
  handNumber: number;
}

interface TournamentUpdateEvent {
  type: "player_bust" | "table_break" | "level_change" | "final_table";
  data: Record<string, unknown>;
}

interface WebSocketState {
  connected: boolean;
  error: string | null;
  gameState: GameState | null;
  lastHandResult: HandResult | null;
  gameFinished: GameFinishedEvent | null;
}

export function useWebSocket(
  tableId: string | undefined,
  options: UseWebSocketOptions = {}
) {
  const {
    autoConnect = true,
    token,
    onPlayerAction,
    onPlayerLeft,
    onGameFinished,
    onHandStarted,
    onTournamentUpdate,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    error: null,
    gameState: null,
    lastHandResult: null,
    gameFinished: null,
  });

  const connect = useCallback(() => {
    if (!tableId || socketRef.current?.connected) return;

    const socket = io("/game", {
      auth: token ? { token } : undefined,
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      setState((s) => ({ ...s, connected: true, error: null }));
      socket.emit("subscribe", { tableId });
    });

    socket.on("disconnect", () => {
      setState((s) => ({ ...s, connected: false }));
    });

    socket.on("connect_error", (error) => {
      setState((s) => ({ ...s, error: error.message }));
    });

    socket.on("error", (error: { code: string; message: string }) => {
      console.error("WebSocket error:", error);
      setState((s) => ({ ...s, error: error.message }));
    });

    socket.on("gameState", (gameState: GameState) => {
      setState((s) => ({ ...s, gameState }));
    });

    socket.on("handStarted", (data: HandStartedEvent) => {
      onHandStarted?.(data);
    });

    socket.on("handResult", (result: HandResult) => {
      setState((s) => ({ ...s, lastHandResult: result }));
    });

    socket.on("gameFinished", (data: GameFinishedEvent) => {
      setState((s) => ({ ...s, gameFinished: data }));
      onGameFinished?.(data);
    });

    socket.on("playerLeft", (data: PlayerLeftEvent) => {
      onPlayerLeft?.(data);
    });

    socket.on("playerAction", (action: PlayerAction) => {
      onPlayerAction?.(action);
    });

    socket.on("tournamentUpdate", (update: TournamentUpdateEvent) => {
      onTournamentUpdate?.(update);
    });

    socketRef.current = socket;
  }, [
    tableId,
    token,
    onPlayerAction,
    onPlayerLeft,
    onGameFinished,
    onHandStarted,
    onTournamentUpdate,
  ]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const unsubscribe = useCallback(() => {
    if (socketRef.current && tableId) {
      socketRef.current.emit("unsubscribe", { tableId });
    }
  }, [tableId]);

  useEffect(() => {
    if (autoConnect && tableId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, tableId, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    unsubscribe,
    socket: socketRef.current,
  };
}
