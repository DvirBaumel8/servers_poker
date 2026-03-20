import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import type { Tournament } from "../../types";

interface TournamentCardProps {
  tournament: Tournament;
  className?: string;
  onRegister?: () => void;
  onUnregister?: (botId: string) => void;
  onStart?: () => void;
  onCancel?: () => void;
  myBotIds?: string[];
}

const STATUS_COLORS: Record<string, string> = {
  registering: "bg-green-500",
  running: "bg-blue-500",
  final_table: "bg-purple-500",
  finished: "bg-gray-500",
  cancelled: "bg-red-500",
};

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Closed";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function TournamentCard({
  tournament,
  className,
  onRegister,
  onUnregister,
  onStart,
  onCancel,
  myBotIds = [],
}: TournamentCardProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const registeredBotIds = tournament.entries?.map((e) => e.botId) || [];
  const myRegisteredBotId = myBotIds.find((id) =>
    registeredBotIds.includes(id),
  );

  const prizePool = tournament.buyIn * tournament.entriesCount;

  const isLateRegOpen =
    tournament.status === "running" &&
    tournament.currentLevel !== undefined &&
    tournament.currentLevel <= tournament.lateRegEndsLevel;

  const canRegister =
    onRegister &&
    (tournament.status === "registering" || isLateRegOpen) &&
    tournament.registeredPlayers < tournament.maxPlayers &&
    !myRegisteredBotId;

  useEffect(() => {
    if (!tournament.startedAt || tournament.status !== "running") {
      setTimeRemaining(null);
      return;
    }

    const levelDurationMs = 3 * 60 * 1000;
    const lateRegEndsAtLevel = tournament.lateRegEndsLevel;

    const calculateRemaining = () => {
      const startedAt = new Date(tournament.startedAt!).getTime();
      const lateRegEndsAt = startedAt + lateRegEndsAtLevel * levelDurationMs;
      const remaining = lateRegEndsAt - Date.now();
      setTimeRemaining(remaining > 0 ? remaining : 0);
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);

    return () => clearInterval(interval);
  }, [tournament.startedAt, tournament.status, tournament.lateRegEndsLevel]);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={clsx(
        "bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700",
        "p-6 hover:border-poker-gold transition-colors",
        className,
      )}
    >
      <Link to={`/tournaments/${tournament.id}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">{tournament.name}</h3>
            <span className="text-sm text-gray-400 capitalize">
              {tournament.type}
            </span>
          </div>
          <span
            className={clsx(
              "px-3 py-1 rounded-full text-xs font-medium text-white",
              STATUS_COLORS[tournament.status],
            )}
          >
            {tournament.status.replace("_", " ").toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Buy-in</span>
            <p className="text-poker-gold font-bold">
              {tournament.buyIn.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Prize Pool</span>
            <p className="text-green-400 font-bold">
              {prizePool.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Players</span>
            <p className="text-white font-medium">
              {tournament.entriesCount || tournament.registeredPlayers} /{" "}
              {tournament.maxPlayers}
            </p>
          </div>
          <div>
            <span className="text-gray-400">
              {tournament.status === "running" ? "Level" : "Late Reg"}
            </span>
            <p className="text-white font-medium">
              {tournament.status === "running" && tournament.currentLevel
                ? `${tournament.currentLevel} / ${tournament.lateRegEndsLevel}`
                : `Until Lvl ${tournament.lateRegEndsLevel}`}
            </p>
          </div>
        </div>

        {isLateRegOpen && timeRemaining !== null && timeRemaining > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Late Registration</span>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 font-mono font-bold animate-pulse">
                  {formatTimeRemaining(timeRemaining)}
                </span>
                <span className="text-xs text-gray-500">remaining</span>
              </div>
            </div>
          </div>
        )}

        {tournament.scheduledStartAt && tournament.status === "registering" && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <span className="text-gray-400 text-sm">Starts</span>
            <p className="text-white">
              {new Date(tournament.scheduledStartAt).toLocaleString()}
            </p>
          </div>
        )}
      </Link>

      {(canRegister || myRegisteredBotId || onStart || onCancel) && (
        <div className="mt-4 pt-4 border-t border-gray-700 flex gap-2">
          {canRegister && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onRegister();
              }}
              className="flex-1 px-4 py-2 bg-poker-gold text-gray-900 text-sm font-medium rounded-lg hover:bg-yellow-400 transition-colors"
            >
              {isLateRegOpen ? "Late Register" : "Register"}
            </button>
          )}
          {myRegisteredBotId &&
            onUnregister &&
            tournament.status === "registering" && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onUnregister(myRegisteredBotId);
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-colors"
              >
                Unregister
              </button>
            )}
          {onStart && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onStart();
              }}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 transition-colors"
            >
              Start
            </button>
          )}
          {onCancel && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onCancel();
              }}
              className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
