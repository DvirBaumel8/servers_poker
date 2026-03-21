import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { GameState, HandResult } from "../types";
import { logger } from "../utils/logger";

interface UseWebSocketOptions {
  autoConnect?: boolean;
  token?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  onPlayerAction?: (action: PlayerAction) => void;
  onPlayerLeft?: (data: PlayerLeftEvent) => void;
  onGameFinished?: (data: GameFinishedEvent) => void;
  onHandStarted?: (data: HandStartedEvent) => void;
  onTournamentUpdate?: (update: TournamentUpdateEvent) => void;
  onReconnecting?: (attempt: number) => void;
  onReconnected?: () => void;
}

export interface PlayerAction {
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
  connecting: boolean;
  error: string | null;
  gameState: GameState | null;
  lastHandResult: HandResult | null;
  gameFinished: GameFinishedEvent | null;
  reconnectAttempt: number;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 2000;

export function useWebSocket(
  tableId: string | undefined,
  options: UseWebSocketOptions = {},
) {
  const {
    autoConnect = true,
    token,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualDisconnectRef = useRef(false);

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    gameState: null,
    lastHandResult: null,
    gameFinished: null,
    reconnectAttempt: 0,
  });

  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    if (isManualDisconnectRef.current) return;
    if (retryCountRef.current >= maxRetries) {
      logger.warn("Max WebSocket reconnection attempts reached", "WebSocket", {
        attempts: retryCountRef.current,
      });
      setState((s) => ({
        ...s,
        connecting: false,
        error: `Connection failed after ${maxRetries} attempts. Please refresh the page.`,
      }));
      return;
    }

    const delay = retryDelayMs * Math.pow(1.5, retryCountRef.current);
    retryCountRef.current += 1;

    logger.info("Scheduling WebSocket reconnect", "WebSocket", {
      attempt: retryCountRef.current,
      delayMs: delay,
    });

    setState((s) => ({
      ...s,
      reconnectAttempt: retryCountRef.current,
    }));

    callbacksRef.current.onReconnecting?.(retryCountRef.current);

    retryTimeoutRef.current = setTimeout(() => {
      if (!isManualDisconnectRef.current && socketRef.current) {
        socketRef.current.connect();
      }
    }, delay);
  }, [maxRetries, retryDelayMs]);

  const connect = useCallback(() => {
    if (!tableId) return;
    if (socketRef.current?.connected) return;

    isManualDisconnectRef.current = false;
    clearRetryTimeout();

    setState((s) => ({ ...s, connecting: true, error: null }));

    const socket = io("/game", {
      auth: token ? { token } : undefined,
      transports: ["websocket", "polling"],
      reconnection: false,
    });

    socket.on("connect", () => {
      logger.info("WebSocket connected", "WebSocket", { tableId });
      const wasReconnect = retryCountRef.current > 0;
      retryCountRef.current = 0;
      setState((s) => ({
        ...s,
        connected: true,
        connecting: false,
        error: null,
        reconnectAttempt: 0,
      }));
      socket.emit("subscribe", { tableId });

      if (wasReconnect) {
        callbacksRef.current.onReconnected?.();
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info("WebSocket disconnected", "WebSocket", { reason, tableId });
      setState((s) => ({ ...s, connected: false }));

      if (!isManualDisconnectRef.current && reason !== "io client disconnect") {
        scheduleRetry();
      }
    });

    socket.on("connect_error", (error) => {
      logger.error(
        "WebSocket connection error",
        new Error(error.message),
        "WebSocket",
        { tableId },
      );
      setState((s) => ({
        ...s,
        connecting: false,
        error: error.message,
      }));
      scheduleRetry();
    });

    socket.on("error", (error: { code: string; message: string }) => {
      logger.error("WebSocket error", new Error(error.message), "WebSocket", {
        code: error.code,
      });
      setState((s) => ({ ...s, error: error.message }));
    });

    socket.on("gameState", (gameState: GameState) => {
      setState((s) => ({ ...s, gameState }));
    });

    socket.on("handStarted", (data: HandStartedEvent) => {
      setState((s) => ({ ...s, lastHandResult: null }));
      callbacksRef.current.onHandStarted?.(data);
    });

    socket.on("handResult", (result: HandResult) => {
      setState((s) => ({ ...s, lastHandResult: result }));
    });

    socket.on("gameFinished", (data: GameFinishedEvent) => {
      setState((s) => ({ ...s, gameFinished: data }));
      callbacksRef.current.onGameFinished?.(data);
    });

    socket.on("playerLeft", (data: PlayerLeftEvent) => {
      callbacksRef.current.onPlayerLeft?.(data);
    });

    socket.on("playerAction", (action: PlayerAction) => {
      callbacksRef.current.onPlayerAction?.(action);
    });

    socket.on("tournamentUpdate", (update: TournamentUpdateEvent) => {
      callbacksRef.current.onTournamentUpdate?.(update);
    });

    socketRef.current = socket;
  }, [tableId, token, scheduleRetry, clearRetryTimeout]);

  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    clearRetryTimeout();
    retryCountRef.current = 0;
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setState((s) => ({
      ...s,
      connected: false,
      connecting: false,
      reconnectAttempt: 0,
    }));
  }, [clearRetryTimeout]);

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

  const retry = useCallback(() => {
    retryCountRef.current = 0;
    setState((s) => ({ ...s, error: null, reconnectAttempt: 0 }));
    connect();
  }, [connect]);

  return {
    ...state,
    connect,
    disconnect,
    unsubscribe,
    retry,
    socket: socketRef.current,
  };
}
