import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { Tournament } from "../../types";
import { Button, StatusPill, SurfaceCard } from "../ui/primitives";

interface TournamentCardProps {
  tournament: Tournament;
  className?: string;
  onRegister?: () => void;
  onUnregister?: (botId: string) => void;
  onStart?: () => void;
  onCancel?: () => void;
  myBotIds?: string[];
}

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
    <motion.div whileHover={{ scale: 1.02 }} className={className}>
      <SurfaceCard className="h-full space-y-5">
        <Link to={`/tournaments/${tournament.id}`} className="block space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-white">
                {tournament.name}
              </h3>
              <span className="mt-1 block text-sm capitalize text-slate-400">
                {tournament.type} tournament
              </span>
            </div>
            <StatusPill
              label={tournament.status.replace("_", " ")}
              tone={
                tournament.status === "registering"
                  ? "success"
                  : tournament.status === "running"
                    ? "info"
                    : tournament.status === "cancelled"
                      ? "danger"
                      : "neutral"
              }
              pulse={tournament.status === "running"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SurfaceCard muted>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Buy-in
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {tournament.buyIn.toLocaleString()}
              </div>
            </SurfaceCard>
            <SurfaceCard muted>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Prize pool
              </div>
              <div className="mt-2 text-xl font-semibold text-emerald-300">
                {prizePool.toLocaleString()}
              </div>
            </SurfaceCard>
            <SurfaceCard muted>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Field
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {tournament.entriesCount || tournament.registeredPlayers} /{" "}
                {tournament.maxPlayers}
              </div>
            </SurfaceCard>
            <SurfaceCard muted>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                {tournament.status === "running" ? "Level" : "Late reg"}
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {tournament.status === "running" && tournament.currentLevel
                  ? `${tournament.currentLevel} / ${tournament.lateRegEndsLevel}`
                  : `Until Lvl ${tournament.lateRegEndsLevel}`}
              </div>
            </SurfaceCard>
          </div>

          {isLateRegOpen && timeRemaining !== null && timeRemaining > 0 && (
            <div className="rounded-2xl border border-warning/20 bg-warning-muted px-4 py-3 text-sm text-yellow-100">
              Late registration closes in{" "}
              <span className="font-mono font-semibold text-warning">
                {formatTimeRemaining(timeRemaining)}
              </span>
            </div>
          )}

          {tournament.scheduledStartAt &&
            tournament.status === "registering" && (
              <div className="text-sm text-slate-400">
                Starts {new Date(tournament.scheduledStartAt).toLocaleString()}
              </div>
            )}
        </Link>

        {(canRegister || myRegisteredBotId || onStart || onCancel) && (
          <div className="flex flex-wrap gap-2 border-t border-white/6 pt-4">
            {canRegister && (
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  onRegister();
                }}
              >
                {isLateRegOpen ? "Late Register" : "Register"}
              </Button>
            )}
            {myRegisteredBotId &&
              onUnregister &&
              tournament.status === "registering" && (
                <Button
                  variant="danger"
                  onClick={(e) => {
                    e.preventDefault();
                    onUnregister(myRegisteredBotId);
                  }}
                >
                  Unregister
                </Button>
              )}
            {onStart && (
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  onStart();
                }}
                variant="secondary"
              >
                Start
              </Button>
            )}
            {onCancel && (
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  onCancel();
                }}
                variant="ghost"
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </SurfaceCard>
    </motion.div>
  );
}
