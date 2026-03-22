import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import DatePicker from "react-datepicker";
import { io, Socket } from "socket.io-client";
import "react-datepicker/dist/react-datepicker.css";
import {
  tournamentsApi,
  CreateTournamentRequest,
  SchedulerStatus,
} from "../api/tournaments";
import { useAuth } from "../hooks/useAuth";
import { usePageTracking } from "../hooks/usePageTracking";
import { SUCCESS_MESSAGE_MS } from "../utils/timing";
import type { Tournament } from "../types";
import {
  AlertBanner,
  AppModal,
  Button,
  EmptyState,
  LoadingBlock,
  PageHeader,
  PageShell,
  SurfaceCard,
  TextField,
  StatusPill,
  SegmentedTabs,
} from "../components/ui/primitives";

type TournamentFormData = {
  name: string;
  type: "rolling" | "scheduled";
  buy_in: number;
  starting_chips: number;
  min_players: number;
  max_players: number;
  players_per_table: number;
  turn_timeout_ms: number;
  late_reg_ends_level: number;
  rebuys_allowed: boolean;
  scheduled_start_at: Date | null;
};

const defaultFormData: TournamentFormData = {
  name: "",
  type: "rolling",
  buy_in: 100,
  starting_chips: 5000,
  min_players: 2,
  max_players: 100,
  players_per_table: 9,
  turn_timeout_ms: 10000,
  late_reg_ends_level: 4,
  rebuys_allowed: true,
  scheduled_start_at: null,
};

const CRON_PRESETS = [
  { label: "Every 30 sec", value: "*/30 * * * * *" },
  { label: "Every minute", value: "0 * * * * *" },
  { label: "Every 5 min", value: "0 */5 * * * *" },
  { label: "Every 15 min", value: "0 */15 * * * *" },
  { label: "Every hour", value: "0 0 * * * *" },
];

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMs < 0) return "past";
  if (diffMins < 60) return `in ${diffMins}m`;
  if (diffHours < 24) return `in ${diffHours}h`;
  return `in ${diffDays}d`;
}

function TournamentCard({
  tournament,
  onStart,
  onCancel,
  onUpdateSchedule,
}: {
  tournament: Tournament;
  onStart: () => void;
  onCancel: () => void;
  onUpdateSchedule: (date: string | null) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [newSchedule, setNewSchedule] = useState<Date | null>(
    tournament.scheduledStartAt ? new Date(tournament.scheduledStartAt) : null,
  );

  const statusColors: Record<string, string> = {
    registering: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    final_table: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    finished: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const handleSaveSchedule = () => {
    onUpdateSchedule(newSchedule ? newSchedule.toISOString() : null);
    setIsEditing(false);
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    onCancel();
  };

  return (
    <>
      <AppModal
        open={showCancelConfirm}
        title="Cancel Tournament"
        description={`Are you sure you want to cancel "${tournament.name}"? This action cannot be undone.`}
        onClose={() => setShowCancelConfirm(false)}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowCancelConfirm(false)}>
              Keep Tournament
            </Button>
            <Button variant="danger" onClick={handleConfirmCancel}>
              Yes, Cancel Tournament
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-muted-light">
          <p>
            <strong className="text-white">Tournament:</strong>{" "}
            {tournament.name}
          </p>
          <p>
            <strong className="text-white">Status:</strong> {tournament.status}
          </p>
          <p>
            <strong className="text-white">Registered Players:</strong>{" "}
            {tournament.entriesCount}
          </p>
          {tournament.entriesCount > 0 && (
            <p className="text-yellow-400">
              Warning: {tournament.entriesCount} player(s) are currently
              registered.
            </p>
          )}
        </div>
      </AppModal>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={`/tournaments/${tournament.id}`}
              className="text-base sm:text-lg font-semibold text-white hover:text-accent transition-colors block truncate"
            >
              {tournament.name}
            </Link>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium border ${statusColors[tournament.status]}`}
              >
                {tournament.status}
              </span>
              <span className="text-xs text-muted-dark">
                {tournament.type === "scheduled" ? "Scheduled" : "Rolling"}
              </span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {tournament.status === "registering" && (
              <>
                <Button variant="primary" size="sm" onClick={onStart}>
                  Start
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  Cancel
                </Button>
              </>
            )}
            {tournament.status === "running" && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowCancelConfirm(true)}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-sm">
          <div>
            <div className="text-muted-dark text-xs">Buy-in</div>
            <div className="text-white font-medium">{tournament.buyIn}</div>
          </div>
          <div>
            <div className="text-muted-dark text-xs">Starting Chips</div>
            <div className="text-white font-medium">
              {tournament.startingChips}
            </div>
          </div>
          <div>
            <div className="text-muted-dark text-xs">Registered</div>
            <div className="text-white font-medium">
              {tournament.entriesCount} / {tournament.maxPlayers}
            </div>
          </div>
          <div>
            <div className="text-muted-dark text-xs">Per Table</div>
            <div className="text-white font-medium">
              {tournament.playersPerTable}
            </div>
          </div>
        </div>

        {tournament.type === "scheduled" && (
          <div className="pt-3 border-t border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs text-muted-dark">Scheduled Start</div>
                {isEditing ? (
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <DatePicker
                      selected={newSchedule}
                      onChange={(date: Date | null) => setNewSchedule(date)}
                      showTimeSelect
                      timeFormat="HH:mm"
                      timeIntervals={15}
                      dateFormat="MMM d, yyyy h:mm aa"
                      minDate={new Date()}
                      className="input-field text-sm py-1 px-2 w-48"
                      placeholderText="Select date & time"
                      aria-label="Tournament scheduled start date and time"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveSchedule}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-white font-medium">
                      {formatDate(tournament.scheduledStartAt)}
                    </span>
                    <span className="text-xs text-accent">
                      {formatRelativeTime(tournament.scheduledStartAt)}
                    </span>
                    {tournament.status === "registering" && (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="text-xs text-muted hover:text-white"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
}

function CreateTournamentForm({
  onSubmit,
  onCancel,
  isSubmitting,
  formError,
}: {
  onSubmit: (data: CreateTournamentRequest) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  formError: string | null;
}) {
  const [form, setForm] = useState<TournamentFormData>(defaultFormData);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formError && errorRef.current) {
      errorRef.current.focus();
    }
  }, [formError]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : type === "number"
            ? Number(value)
            : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: CreateTournamentRequest = {
      name: form.name,
      type: form.type,
      buy_in: form.buy_in,
      starting_chips: form.starting_chips,
      min_players: form.min_players,
      max_players: form.max_players,
      players_per_table: form.players_per_table,
      turn_timeout_ms: form.turn_timeout_ms,
      late_reg_ends_level: form.late_reg_ends_level,
      rebuys_allowed: form.rebuys_allowed,
    };

    if (form.type === "scheduled" && form.scheduled_start_at) {
      data.scheduled_start_at = form.scheduled_start_at.toISOString();
    }

    onSubmit(data);
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      onSubmit={handleSubmit}
      className="glass-panel p-4 sm:p-6 space-y-6"
      aria-labelledby="create-form-title"
    >
      <h3 id="create-form-title" className="text-xl font-semibold text-white">
        Create New Tournament
      </h3>

      {formError && (
        <div
          ref={errorRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm"
        >
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <TextField
          label="Tournament Name"
          name="name"
          value={form.name}
          onChange={handleChange}
          required
          placeholder="e.g., Weekend Championship"
          aria-required="true"
        />

        <TextField
          label="Type"
          name="type"
          select
          value={form.type}
          onChange={handleChange}
        >
          <option value="rolling">Rolling (Start manually)</option>
          <option value="scheduled">Scheduled (Auto-start at time)</option>
        </TextField>

        {form.type === "scheduled" && (
          <div className="sm:col-span-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">
                Scheduled Start
              </span>
              <DatePicker
                selected={form.scheduled_start_at}
                onChange={(date: Date | null) =>
                  setForm((prev) => ({ ...prev, scheduled_start_at: date }))
                }
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={15}
                dateFormat="MMMM d, yyyy h:mm aa"
                minDate={new Date()}
                className="input-field w-full"
                placeholderText="Select date and time"
                aria-label="Tournament scheduled start date and time"
              />
              <span className="text-xs text-slate-500">
                Tournament will auto-start at this time if enough players
              </span>
            </label>
          </div>
        )}

        <TextField
          label="Buy-in"
          name="buy_in"
          type="number"
          min="0"
          max="1000000000"
          value={form.buy_in}
          onChange={handleChange}
          hint="Entry fee in chips"
        />

        <TextField
          label="Starting Chips"
          name="starting_chips"
          type="number"
          min="100"
          value={form.starting_chips}
          onChange={handleChange}
        />

        <TextField
          label="Min Players"
          name="min_players"
          type="number"
          min="2"
          value={form.min_players}
          onChange={handleChange}
          hint="Minimum to start"
        />

        <TextField
          label="Max Players"
          name="max_players"
          type="number"
          min="2"
          max="10000"
          value={form.max_players}
          onChange={handleChange}
        />
      </div>

      <div className="border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors"
          aria-expanded={showAdvanced}
          aria-controls="advanced-options"
        >
          <motion.span
            animate={{ rotate: showAdvanced ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            ▶
          </motion.span>
          Advanced Options
        </button>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              id="advanced-options"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pt-4">
                <TextField
                  label="Players per Table"
                  name="players_per_table"
                  type="number"
                  min="2"
                  max="10"
                  value={form.players_per_table}
                  onChange={handleChange}
                />

                <TextField
                  label="Turn Timeout (ms)"
                  name="turn_timeout_ms"
                  type="number"
                  min="1000"
                  max="60000"
                  value={form.turn_timeout_ms}
                  onChange={handleChange}
                  hint="Time per player action"
                />

                <TextField
                  label="Late Reg Ends Level"
                  name="late_reg_ends_level"
                  type="number"
                  min="1"
                  value={form.late_reg_ends_level}
                  onChange={handleChange}
                  hint="Last level for late registration"
                />

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="rebuys_allowed"
                    name="rebuys_allowed"
                    checked={form.rebuys_allowed}
                    onChange={handleChange}
                    className="w-4 h-4 rounded border-line-muted bg-subtle-light text-accent focus:ring-accent focus:ring-offset-0"
                  />
                  <label
                    htmlFor="rebuys_allowed"
                    className="text-sm text-slate-200"
                  >
                    Allow Rebuys
                  </label>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-white/10">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !form.name}>
          {isSubmitting ? "Creating..." : "Create Tournament"}
        </Button>
      </div>
    </motion.form>
  );
}

function SchedulerStatusCard({
  status,
  onUpdateCron,
}: {
  status: SchedulerStatus | null;
  onUpdateCron: (cron: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [newCron, setNewCron] = useState(status?.cronExpression || "");

  if (!status) return null;

  const handleSave = () => {
    onUpdateCron(newCron);
    setIsEditing(false);
  };

  const handlePresetClick = (preset: string) => {
    setNewCron(preset);
  };

  return (
    <SurfaceCard className="p-4 sm:p-5">
      <h3 className="text-lg font-semibold text-white mb-4">
        Tournament Scheduler
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted">Status</span>
          <StatusPill
            tone={status.enabled ? "success" : "neutral"}
            label={status.enabled ? "Running" : "Stopped"}
            pulse={status.enabled}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted">Schedule</span>
            {!isEditing && (
              <button
                onClick={() => {
                  setNewCron(status.cronExpression);
                  setIsEditing(true);
                }}
                className="text-xs text-muted hover:text-white"
              >
                Edit
              </button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handlePresetClick(preset.value)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      newCron === preset.value
                        ? "border-accent bg-accent/20 text-accent"
                        : "border-white/10 bg-white/5 text-muted hover:text-white hover:border-white/20"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCron}
                  onChange={(e) => setNewCron(e.target.value)}
                  className="input-field text-sm py-1 px-2 flex-1"
                  placeholder="*/30 * * * * *"
                  aria-label="Cron expression"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handleSave}>
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <code className="block text-white bg-surface-400 px-2 py-1 rounded text-sm">
              {status.cronExpression}
            </code>
          )}
        </div>
        {status.nextRun && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Next Check</span>
            <span className="text-white">{formatDate(status.nextRun)}</span>
          </div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="text-xs text-muted-dark">
          The scheduler automatically starts tournaments when their scheduled
          time arrives and minimum players are registered.
        </p>
      </div>
    </SurfaceCard>
  );
}

export function AdminTournaments() {
  usePageTracking();
  const { token, user } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [schedulerStatus, setSchedulerStatus] =
    useState<SchedulerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    const socket = io("/game", {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("subscribeTournaments");
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    const handleTournamentUpdate = (data: {
      tournament: Tournament;
      timestamp: string;
    }) => {
      setTournaments((prev) => {
        const idx = prev.findIndex((t) => t.id === data.tournament.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = data.tournament;
          return updated;
        }
        return [data.tournament, ...prev];
      });
    };

    socket.on("tournamentListUpdate", handleTournamentUpdate);

    return () => {
      socket.emit("unsubscribeTournaments");
      socket.off("tournamentListUpdate", handleTournamentUpdate);
      socket.disconnect();
    };
  }, [token]);

  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
    successTimeoutRef.current = setTimeout(() => {
      setSuccessMessage(null);
    }, SUCCESS_MESSAGE_MS);
  }, []);

  const loadData = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const [allTournaments, scheduler] = await Promise.all([
        tournamentsApi.getAll(),
        tournamentsApi.getSchedulerStatus(token).catch(() => null),
      ]);
      setTournaments(allTournaments);
      setSchedulerStatus(scheduler);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const handleCreateTournament = async (data: CreateTournamentRequest) => {
    if (!token) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await tournamentsApi.createTournament(data, token);
      showSuccess(`Tournament "${data.name}" created successfully!`);
      setShowCreateForm(false);
      loadData();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create tournament",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartTournament = async (id: string) => {
    if (!token) return;

    try {
      await tournamentsApi.start(id, token);
      showSuccess("Tournament started!");
      loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start tournament",
      );
    }
  };

  const handleCancelTournament = async (id: string) => {
    if (!token) return;

    try {
      await tournamentsApi.cancel(id, token);
      showSuccess("Tournament cancelled.");
      loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel tournament",
      );
    }
  };

  const handleUpdateSchedule = async (id: string, date: string | null) => {
    if (!token) return;

    try {
      await tournamentsApi.updateSchedule(id, date, token);
      showSuccess("Schedule updated.");
      loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update schedule",
      );
    }
  };

  const handleUpdateCron = async (cron: string) => {
    if (!token) return;

    try {
      const result = await tournamentsApi.updateSchedulerConfig(cron, token);
      setSchedulerStatus(result);
      showSuccess("Scheduler configuration updated.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update scheduler",
      );
    }
  };

  if (user?.role !== "admin") {
    return (
      <PageShell>
        <SurfaceCard className="p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-muted">
            You need admin privileges to view this page.
          </p>
        </SurfaceCard>
      </PageShell>
    );
  }

  if (isLoading) {
    return (
      <LoadingBlock
        label="Loading tournament management"
        className="page-shell"
      />
    );
  }

  const filteredTournaments = tournaments.filter((t) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "active")
      return ["registering", "running", "final_table"].includes(t.status);
    return t.status === statusFilter;
  });

  const activeTournaments = tournaments.filter((t) =>
    ["registering", "running", "final_table"].includes(t.status),
  );

  return (
    <PageShell className="space-y-6 sm:space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 sm:space-y-8"
      >
        <PageHeader
          eyebrow="Admin"
          title="Tournament Management"
          description={
            <span className="flex items-center gap-2">
              Create, schedule, and manage tournaments.
              {isConnected && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              )}
            </span>
          }
          actions={
            !showCreateForm && (
              <Button onClick={() => setShowCreateForm(true)}>
                + Create Tournament
              </Button>
            )
          }
        />

        <div role="status" aria-live="polite" className="sr-only">
          {successMessage}
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <AlertBanner
                tone="danger"
                dismissible
                onDismiss={() => setError(null)}
              >
                {error}
              </AlertBanner>
            </motion.div>
          )}

          {successMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <AlertBanner
                tone="success"
                dismissible
                onDismiss={() => setSuccessMessage(null)}
              >
                {successMessage}
              </AlertBanner>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showCreateForm && (
            <CreateTournamentForm
              onSubmit={handleCreateTournament}
              onCancel={() => {
                setShowCreateForm(false);
                setFormError(null);
              }}
              isSubmitting={isSubmitting}
              formError={formError}
            />
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="glass-panel p-3 sm:p-4 text-center">
            <div className="text-xs sm:text-sm text-muted">Total</div>
            <div className="text-xl sm:text-2xl font-bold text-white">
              {tournaments.length}
            </div>
          </div>
          <div className="glass-panel p-3 sm:p-4 text-center">
            <div className="text-xs sm:text-sm text-muted">Active</div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400">
              {activeTournaments.length}
            </div>
          </div>
          <div className="glass-panel p-3 sm:p-4 text-center">
            <div className="text-xs sm:text-sm text-muted">Registering</div>
            <div className="text-xl sm:text-2xl font-bold text-blue-400">
              {tournaments.filter((t) => t.status === "registering").length}
            </div>
          </div>
          <div className="glass-panel p-3 sm:p-4 text-center">
            <div className="text-xs sm:text-sm text-muted">Scheduled</div>
            <div className="text-xl sm:text-2xl font-bold text-accent">
              {
                tournaments.filter(
                  (t) => t.type === "scheduled" && t.status === "registering",
                ).length
              }
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white">
                Tournaments
              </h2>
              <SegmentedTabs
                value={statusFilter}
                onChange={setStatusFilter}
                items={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "registering", label: "Registering" },
                  { value: "finished", label: "Finished" },
                ]}
              />
            </div>

            {filteredTournaments.length === 0 ? (
              <EmptyState
                illustration="tournament"
                title="No tournaments found"
                description="No tournaments match the current filter. Try a different status or create a new tournament."
                action={
                  <Button onClick={() => setShowCreateForm(true)}>
                    Create Tournament
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {filteredTournaments.map((tournament) => (
                  <TournamentCard
                    key={tournament.id}
                    tournament={tournament}
                    onStart={() => handleStartTournament(tournament.id)}
                    onCancel={() => handleCancelTournament(tournament.id)}
                    onUpdateSchedule={(date) =>
                      handleUpdateSchedule(tournament.id, date)
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <SchedulerStatusCard
              status={schedulerStatus}
              onUpdateCron={handleUpdateCron}
            />

            <SurfaceCard className="p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-white mb-4">
                Quick Actions
              </h3>
              <div className="space-y-2">
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => setShowCreateForm(true)}
                >
                  Create Rolling Tournament
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => setShowCreateForm(true)}
                >
                  Schedule Future Tournament
                </Button>
                <Button
                  className="w-full"
                  variant="ghost"
                  asLink="/admin/analytics"
                >
                  View Analytics →
                </Button>
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-white mb-4">
                Upcoming Scheduled
              </h3>
              {tournaments.filter(
                (t) => t.type === "scheduled" && t.status === "registering",
              ).length === 0 ? (
                <p className="text-sm text-muted-dark">
                  No scheduled tournaments.
                </p>
              ) : (
                <div className="space-y-3">
                  {tournaments
                    .filter(
                      (t) =>
                        t.type === "scheduled" && t.status === "registering",
                    )
                    .sort((a, b) =>
                      (a.scheduledStartAt || "").localeCompare(
                        b.scheduledStartAt || "",
                      ),
                    )
                    .slice(0, 5)
                    .map((t) => (
                      <Link
                        key={t.id}
                        to={`/tournaments/${t.id}`}
                        className="block p-3 bg-surface-400 rounded-lg hover:bg-surface-300 transition-colors"
                      >
                        <div className="font-medium text-white text-sm truncate">
                          {t.name}
                        </div>
                        <div className="text-xs text-muted mt-1">
                          {formatDate(t.scheduledStartAt)}
                          <span className="text-accent ml-2">
                            {formatRelativeTime(t.scheduledStartAt)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-dark mt-1">
                          {t.entriesCount} registered
                        </div>
                      </Link>
                    ))}
                </div>
              )}
            </SurfaceCard>
          </div>
        </div>
      </motion.div>
    </PageShell>
  );
}
