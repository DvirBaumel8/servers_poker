import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Table } from "../components/game/Table";
import { useActionFeed } from "../components/game/ActionFeed";
import { HandResultToast } from "../components/game/HandResultToast";
import { useWebSocket } from "../hooks/useWebSocket";
import { useAuthStore } from "../stores/authStore";
import { gamesApi } from "../api/games";
import { tournamentsApi } from "../api/tournaments";
import clsx from "clsx";
import type { HandResult, Tournament } from "../types";
import { Button } from "../components/ui/primitives";

const DEFAULT_TURN_TIMEOUT_MS = 10000;

export function GameView() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const { addAction, clearActions } = useActionFeed();
  const [activeHandResult, setActiveHandResult] = useState<HandResult | null>(
    null,
  );
  const [playerActions, setPlayerActions] = useState<
    Record<string, { type: string; amount?: number; timestamp: number }>
  >({});
  const [turnStartTime, setTurnStartTime] = useState<number | undefined>();
  const [preflightStatus, setPreflightStatus] = useState<
    "checking" | "ready" | "missing" | "failed"
  >("checking");
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const lastActivePlayerId = useRef<string | null>(null);
  const [tournamentInfo, setTournamentInfo] = useState<Tournament | null>(null);
  
  // Track player names in a ref to avoid stale closure issues
  const playerNamesRef = useRef<Record<string, string>>({});

  const handlePlayerAction = useCallback(
    (action: { botId: string; action: string; amount: number }) => {
      const playerName = playerNamesRef.current[action.botId] || "Player";
      addAction(playerName, action.action, action.amount);

      // Track last action for each player
      setPlayerActions((prev) => ({
        ...prev,
        [action.botId]: {
          type: action.action,
          amount: action.amount,
          timestamp: Date.now(),
        },
      }));
    },
    [addAction],
  );

  const handleHandStarted = useCallback(() => {
    clearActions();
    setActiveHandResult(null); // Clear previous hand result
    setPlayerActions({}); // Clear actions for new hand
    setTurnStartTime(Date.now()); // Reset turn timer
  }, [clearActions]);

  const { connected, error, gameState, gameFinished, lastHandResult } =
    useWebSocket(tableId, {
      autoConnect: preflightStatus === "ready",
      token: token || undefined,
      onPlayerAction: handlePlayerAction,
      onHandStarted: handleHandStarted,
    });

  useEffect(() => {
    let cancelled = false;

    if (!tableId) {
      setPreflightStatus("checking");
      setPreflightError(null);
      return;
    }

    setPreflightStatus("checking");
    setPreflightError(null);

    gamesApi
      .getGameState(tableId, token || undefined)
      .then(() => {
        if (!cancelled) {
          setPreflightStatus("ready");
        }
      })
      .catch((err) => {
        if (cancelled) return;

        const message =
          err instanceof Error ? err.message : "Unable to load table";
        if (/table not found/i.test(message) || /http 404/i.test(message)) {
          setPreflightStatus("missing");
          return;
        }

        setPreflightStatus("failed");
        setPreflightError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [tableId, token]);

  // Show hand result when it comes in
  useEffect(() => {
    if (lastHandResult) {
      setActiveHandResult(lastHandResult);
    }
  }, [lastHandResult]);

  // Fetch tournament info if this is a tournament table
  useEffect(() => {
    if (gameState?.tournamentId && !tournamentInfo) {
      tournamentsApi
        .getById(gameState.tournamentId)
        .then(setTournamentInfo)
        .catch(() => setTournamentInfo(null));
    }
  }, [gameState?.tournamentId, tournamentInfo]);

  const handleHandResultComplete = useCallback(() => {
    setActiveHandResult(null);
  }, []);

  // Track when the active player changes to reset the turn timer
  useEffect(() => {
    if (
      gameState?.currentPlayerId &&
      gameState.currentPlayerId !== lastActivePlayerId.current
    ) {
      lastActivePlayerId.current = gameState.currentPlayerId;
      setTurnStartTime(Date.now());
    }
  }, [gameState?.currentPlayerId]);

  const playerNames = useMemo(() => {
    if (!gameState) return {};
    const names = gameState.players.reduce(
      (acc, p) => {
        acc[p.id] = p.name;
        return acc;
      },
      {} as Record<string, string>,
    );
    // Keep the ref in sync for callbacks
    playerNamesRef.current = names;
    return names;
  }, [gameState]);

  if (preflightStatus === "missing") {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center px-6">
        <div className="surface-card max-w-lg text-center">
          <div className="eyebrow-label">Game unavailable</div>
          <h2 className="mt-3 text-3xl font-display font-semibold text-white">
            Table not found
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            This game may have finished, the link may be invalid, or the table
            may no longer exist.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="secondary" onClick={() => navigate("/tables")}>
              Back to tables
            </Button>
            <Button onClick={() => navigate("/")}>Go home</Button>
          </div>
        </div>
      </div>
    );
  }

  if (preflightStatus === "failed" || error) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center px-6">
        <div className="surface-card max-w-lg text-center">
          <div className="eyebrow-label">Game connection error</div>
          <h2 className="mt-3 text-3xl font-display font-semibold text-white">
            Unable to open the table stream
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {preflightError || error}
          </p>
          <div className="mt-6">
            <Button variant="secondary" onClick={() => navigate("/tables")}>
              Back to tables
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (preflightStatus !== "ready" || !connected || !gameState) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-4 rounded-3xl border border-white/8 bg-black/20 px-5 py-4 backdrop-blur-xl">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-accent/20 border-t-accent" />
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-slate-500">
              Game shell
            </div>
            <h2 className="text-lg font-semibold text-white">
              Loading live table...
            </h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-shell-gradient">
      {/* Hand result toast - for notifications */}
      <HandResultToast
        result={activeHandResult}
        onDismiss={handleHandResultComplete}
        playerNames={playerNames}
      />

      <div className="page-shell flex flex-col gap-4 py-4">
        {/* Compact header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(tournamentInfo ? `/tournaments/${tournamentInfo.id}` : "/tables")}>
              {tournamentInfo ? "Back to tournament" : "Back to tables"}
            </Button>
            <div>
              <div className="eyebrow-label">
                {tournamentInfo ? "Tournament table" : "Live table view"}
              </div>
              <h1 className="text-2xl font-display font-semibold text-white">
                {tournamentInfo ? tournamentInfo.name : "Live Table"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {tournamentInfo && (
              <>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
                  <span className="text-slate-400">Level </span>
                  <span className="font-semibold text-white">{tournamentInfo.currentLevel || 1}</span>
                </div>
              </>
            )}
            <StatusBadge status={gameState.status} />
          </div>
        </div>

        {/* Full-width table - no sidebar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[2rem] border border-white/6 bg-black/10 p-4 shadow-panel"
        >
          <Table
            gameState={gameState}
            playerActions={playerActions}
            turnStartTime={turnStartTime}
            turnTimeoutMs={DEFAULT_TURN_TIMEOUT_MS}
            handResult={activeHandResult}
            onHandResultComplete={handleHandResultComplete}
            playerNames={playerNames}
          />
        </motion.div>

        {/* Winner announcement overlay */}
        {gameFinished && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div className="bg-gradient-to-br from-amber-500/90 to-yellow-600/90 backdrop-blur-xl rounded-3xl px-12 py-8 shadow-2xl border-2 border-yellow-300/50">
              <div className="text-center">
                <div className="text-2xl mb-2">🏆</div>
                <div className="text-amber-100 text-sm uppercase tracking-widest mb-1">Winner</div>
                <div className="text-white text-3xl font-bold">{gameFinished.winnerName || "Unknown"}</div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { bg: string; text: string; dot: string; label: string }
  > = {
    waiting: {
      bg: "bg-warning-muted border border-warning/20",
      text: "text-warning",
      dot: "bg-warning",
      label: "Waiting",
    },
    playing: {
      bg: "bg-success-muted border border-success/20",
      text: "text-success",
      dot: "bg-success",
      label: "Live",
    },
    running: {
      bg: "bg-success-muted border border-success/20",
      text: "text-success",
      dot: "bg-success",
      label: "Live",
    },
    finished: {
      bg: "bg-white/[0.05] border border-white/10",
      text: "text-slate-300",
      dot: "bg-slate-400",
      label: "Finished",
    },
    paused: {
      bg: "bg-info-muted border border-info/20",
      text: "text-info",
      dot: "bg-info",
      label: "Paused",
    },
  };

  const { bg, text, dot, label } = config[status] || config.waiting;

  return (
    <span
      className={clsx(
        "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium",
        bg,
        text,
      )}
    >
      <span className={clsx("w-2 h-2 rounded-full animate-pulse", dot)} />
      {label}
    </span>
  );
}

