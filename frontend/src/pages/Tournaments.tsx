import { useEffect, useState, useCallback, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { TournamentCard } from "../components/tournament/TournamentCard";
import { useTournamentStore } from "../stores/tournamentStore";
import { tournamentsApi } from "../api/tournaments";
import { botsApi } from "../api/bots";
import { useAuthStore } from "../stores/authStore";
import { logger } from "../utils/logger";
import { TOURNAMENT_LIST_POLL_MS } from "../utils/timing";
import type { Bot, Tournament } from "../types";
import {
  AlertBanner,
  AppModal,
  Button,
  ConfirmDialog,
  EmptyState,
  LoadingBlock,
  MetricCard,
  PageHeader,
  PageShell,
  SegmentedTabs,
  SurfaceCard,
  TextField,
} from "../components/ui/primitives";

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "registering", label: "Registering" },
  { value: "running", label: "Running" },
  { value: "finished", label: "Finished" },
];

interface CreateTournamentForm {
  name: string;
  buyIn: number;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  blindIncreaseMinutes: number;
}

export function Tournaments() {
  const { user, token } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const { tournaments, loading, error, fetchTournaments } =
    useTournamentStore();
  const [statusFilter, setStatusFilter] = useState("active");
  const [myBots, setMyBots] = useState<Bot[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create tournament modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateTournamentForm>({
    name: "",
    buyIn: 100,
    startingChips: 5000,
    smallBlind: 25,
    bigBlind: 50,
    maxPlayers: 100,
    blindIncreaseMinutes: 15,
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Register modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registeringTournament, setRegisteringTournament] =
    useState<Tournament | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<string>("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
    label: string;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const loadBots = useCallback(async () => {
    if (token) {
      try {
        const bots = await botsApi.getMy(token);
        setMyBots(bots.filter((b) => b.active));
      } catch (err) {
        logger.error("Failed to load bots", err, "Tournaments");
      }
    }
  }, [token]);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  useEffect(() => {
    fetchTournaments(statusFilter);

    const pollInterval = setInterval(() => {
      fetchTournaments(statusFilter);
    }, TOURNAMENT_LIST_POLL_MS);

    return () => clearInterval(pollInterval);
  }, [statusFilter, fetchTournaments]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setCreateLoading(true);
    setCreateError(null);

    try {
      await tournamentsApi.create(
        {
          name: createForm.name,
          buyIn: createForm.buyIn,
          startingChips: createForm.startingChips,
          smallBlind: createForm.smallBlind,
          bigBlind: createForm.bigBlind,
          maxPlayers: createForm.maxPlayers,
          blindIncreaseMinutes: createForm.blindIncreaseMinutes,
        },
        token,
      );
      setShowCreateModal(false);
      setCreateForm({
        name: "",
        buyIn: 100,
        startingChips: 5000,
        smallBlind: 25,
        bigBlind: 50,
        maxPlayers: 100,
        blindIncreaseMinutes: 15,
      });
      fetchTournaments(statusFilter || undefined);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create tournament",
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !registeringTournament || !selectedBotId) return;

    setRegisterLoading(true);
    setRegisterError(null);

    try {
      await tournamentsApi.register(
        registeringTournament.id,
        selectedBotId,
        token,
      );
      setShowRegisterModal(false);
      setRegisteringTournament(null);
      setSelectedBotId("");
      fetchTournaments(statusFilter || undefined);
    } catch (err) {
      setRegisterError(
        err instanceof Error ? err.message : "Failed to register",
      );
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleUnregister = async (tournamentId: string, botId: string) => {
    if (!token) return;

    try {
      await tournamentsApi.unregister(tournamentId, botId, token);
      fetchTournaments(statusFilter || undefined);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to unregister",
      );
    }
  };

  const handleStartTournament = async (tournamentId: string) => {
    if (!token) return;
    try {
      await tournamentsApi.start(tournamentId, token);
      fetchTournaments(statusFilter || undefined);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to start tournament",
      );
    }
  };

  const handleCancelTournament = async (tournamentId: string) => {
    if (!token) return;

    try {
      await tournamentsApi.cancel(tournamentId, token);
      fetchTournaments(statusFilter || undefined);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to cancel tournament",
      );
    }
  };

  const openRegisterModal = (tournament: Tournament) => {
    setRegisteringTournament(tournament);
    setSelectedBotId(myBots[0]?.id || "");
    setRegisterError(null);
    setShowRegisterModal(true);
  };

  const summary = {
    live: tournaments.filter((t) => t.status === "running").length,
    registering: tournaments.filter((t) => t.status === "registering").length,
    myBots: myBots.length,
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      await confirmAction.action();
      setConfirmAction(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading tournaments" className="page-shell" />;
  }

  return (
    <PageShell className="space-y-8">
      <PageHeader
        eyebrow="Tournament lobby"
        title="Multi-format tournament control"
        description="Browse upcoming fields, monitor live tournament volume, and register bots with a cleaner operator-grade workflow."
        actions={
          <>
            <SegmentedTabs
              value={statusFilter}
              onChange={setStatusFilter}
              items={STATUSES.map((status) => ({
                value: status.value,
                label: status.label,
              }))}
            />
            {isAdmin && (
              <Button
                onClick={() => {
                  setCreateError(null);
                  setShowCreateModal(true);
                }}
              >
                Create tournament
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Running fields"
          value={summary.live}
          hint="Currently in progress"
          accent
        />
        <MetricCard
          label="Open registration"
          value={summary.registering}
          hint="Fields still accepting entries"
        />
        <MetricCard
          label="My active bots"
          value={summary.myBots}
          hint="Eligible for immediate registration"
        />
      </div>

      {(error || actionError) && (
        <AlertBanner
          dismissible
          onDismiss={() => setActionError(null)}
          title="Tournament action failed"
        >
          {error || actionError}
        </AlertBanner>
      )}

      {tournaments.length === 0 ? (
        <EmptyState
          title="No tournaments match this filter"
          description={
            isAdmin
              ? "Create a new tournament or switch the lobby filter to explore other states."
              : "The selected tournament state is currently empty. Try another filter or check back soon."
          }
          action={
            isAdmin ? (
              <Button
                onClick={() => {
                  setCreateError(null);
                  setShowCreateModal(true);
                }}
              >
                Create tournament
              </Button>
            ) : undefined
          }
        />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"
        >
          {tournaments.map((tournament, index) => (
            <motion.div
              key={tournament.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <TournamentCard
                tournament={tournament}
                onRegister={
                  user &&
                  (tournament.status === "registering" ||
                    tournament.status === "running")
                    ? () => openRegisterModal(tournament)
                    : undefined
                }
                onUnregister={
                  user && tournament.status === "registering"
                    ? (botId: string) =>
                        setConfirmAction({
                          title: "Unregister bot",
                          description:
                            "This removes your bot from the tournament registration list.",
                          label: "Unregister",
                          action: () => handleUnregister(tournament.id, botId),
                        })
                    : undefined
                }
                onStart={
                  user &&
                  tournament.status === "registering" &&
                  tournament.registeredPlayers >= 2
                    ? () => handleStartTournament(tournament.id)
                    : undefined
                }
                onCancel={
                  user && tournament.status === "registering"
                    ? () =>
                        setConfirmAction({
                          title: "Cancel tournament",
                          description:
                            "This will stop registration and prevent the tournament from starting.",
                          label: "Cancel tournament",
                          action: () => handleCancelTournament(tournament.id),
                        })
                    : undefined
                }
                myBotIds={myBots.map((b) => b.id)}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      <AppModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create tournament"
        description="Configure the live field structure, blind progression, and seat capacity."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-tournament-form"
              disabled={createLoading}
            >
              {createLoading ? "Creating..." : "Create tournament"}
            </Button>
          </div>
        }
      >
        <form
          id="create-tournament-form"
          onSubmit={handleCreate}
          className="space-y-4"
        >
          {createError && (
            <AlertBanner title="Create tournament failed">
              {createError}
            </AlertBanner>
          )}
          <TextField
            label="Tournament name"
            value={createForm.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setCreateForm({ ...createForm, name: e.target.value })
            }
            placeholder="Sunday Major"
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Buy-in"
              type="number"
              min={0}
              value={createForm.buyIn}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setCreateForm({
                  ...createForm,
                  buyIn: parseInt(e.target.value) || 0,
                })
              }
              required
            />
            <TextField
              label="Starting chips"
              type="number"
              min={100}
              value={createForm.startingChips}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setCreateForm({
                  ...createForm,
                  startingChips: parseInt(e.target.value) || 0,
                })
              }
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Small blind"
              type="number"
              min={1}
              value={createForm.smallBlind}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setCreateForm({
                  ...createForm,
                  smallBlind: parseInt(e.target.value) || 0,
                })
              }
              required
            />
            <TextField
              label="Big blind"
              type="number"
              min={1}
              value={createForm.bigBlind}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setCreateForm({
                  ...createForm,
                  bigBlind: parseInt(e.target.value) || 0,
                })
              }
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Max players"
              type="number"
              min={2}
              max={1000}
              value={createForm.maxPlayers}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setCreateForm({
                  ...createForm,
                  maxPlayers: parseInt(e.target.value) || 0,
                })
              }
              required
            />
            <TextField
              label="Blind increase minutes"
              type="number"
              min={1}
              value={createForm.blindIncreaseMinutes}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setCreateForm({
                  ...createForm,
                  blindIncreaseMinutes: parseInt(e.target.value) || 0,
                })
              }
              required
            />
          </div>
        </form>
      </AppModal>

      <AppModal
        open={showRegisterModal && !!registeringTournament}
        onClose={() => setShowRegisterModal(false)}
        title="Register bot"
        description={
          registeringTournament
            ? `Choose which active bot should enter ${registeringTournament.name}.`
            : ""
        }
        footer={
          myBots.length > 0 ? (
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setShowRegisterModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="register-tournament-form"
                disabled={registerLoading || !selectedBotId}
              >
                {registerLoading ? "Registering..." : "Register bot"}
              </Button>
            </div>
          ) : undefined
        }
      >
        <form
          id="register-tournament-form"
          onSubmit={handleRegister}
          className="space-y-4"
        >
          {registerError && (
            <AlertBanner title="Registration failed">
              {registerError}
            </AlertBanner>
          )}
          {myBots.length === 0 ? (
            <EmptyState
              title="No active bots"
              description="Activate a bot before attempting tournament registration."
              action={
                <Button variant="secondary" asLink="/bots">
                  Open bots workspace
                </Button>
              }
            />
          ) : (
            <>
              <TextField
                label="Bot"
                select
                value={selectedBotId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setSelectedBotId(e.target.value)
                }
                required
              >
                {myBots.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}
                  </option>
                ))}
              </TextField>
              {registeringTournament && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <SurfaceCard muted>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Buy-in
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {registeringTournament.buyIn}
                    </div>
                  </SurfaceCard>
                  <SurfaceCard muted>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Starting stack
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {registeringTournament.startingChips}
                    </div>
                  </SurfaceCard>
                  <SurfaceCard muted>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Field size
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {registeringTournament.registeredPlayers}/
                      {registeringTournament.maxPlayers}
                    </div>
                  </SurfaceCard>
                </div>
              )}
            </>
          )}
        </form>
      </AppModal>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title || ""}
        description={confirmAction?.description || ""}
        confirmLabel={confirmAction?.label}
        onClose={() => setConfirmAction(null)}
        onConfirm={runConfirmAction}
        busy={confirmBusy}
      />
    </PageShell>
  );
}
