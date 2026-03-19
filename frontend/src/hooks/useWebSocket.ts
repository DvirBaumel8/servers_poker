import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { GameState, HandResult } from "../types";

interface UseWebSocketOptions {
  autoConnect?: boolean;
  token?: string;
}

interface WebSocketState {
  connected: boolean;
  error: string | null;
  gameState: GameState | null;
  lastHandResult: HandResult | null;
}

export function useWebSocket(
  tableId: string | undefined,
  options: UseWebSocketOptions = {}
) {
  const { autoConnect = true, token } = options;
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    error: null,
    gameState: null,
    lastHandResult: null,
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

    socket.on("gameState", (gameState: GameState) => {
      setState((s) => ({ ...s, gameState }));
    });

    socket.on("handResult", (result: HandResult) => {
      setState((s) => ({ ...s, lastHandResult: result }));
    });

    socket.on("playerAction", (action: any) => {
      console.log("Player action:", action);
    });

    socket.on("tournamentUpdate", (update: any) => {
      console.log("Tournament update:", update);
    });

    socketRef.current = socket;
  }, [tableId, token]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

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
    socket: socketRef.current,
  };
}
