import { useState, useEffect, useCallback, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { gamesApi, type Table } from "../api/games";
import { botsApi } from "../api/bots";
import { useAuthStore } from "../stores/authStore";
import type { Bot } from "../types";
import {
  AlertBanner,
  AppModal,
  Button,
  EmptyState,
  LoadingBlock,
  MetricCard,
  PageHeader,
  PageShell,
  StatusPill,
  SurfaceCard,
  TextField,
} from "../components/ui/primitives";

interface CreateTableForm {
  name: string;
  small_blind: number;
  big_blind: number;
  max_players: number;
  starting_chips: number;
}

export function Tables() {
  const { user, token } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const [tables, setTables] = useState<Table[]>([]);
  const [myBots, setMyBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountWarning, setAccountWarning] = useState<string | null>(null);

  // Create table modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateTableForm>({
    name: "",
    small_blind: 10,
    big_blind: 20,
    max_players: 9,
    starting_chips: 1000,
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join table modal
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joiningTable, setJoiningTable] = useState<Table | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<string>("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setAccountWarning(null);
      const tablesData = await gamesApi.getTables();
      setTables(tablesData);

      if (token) {
        try {
          const botsData = await botsApi.getMy(token);
          setMyBots(botsData.filter((b) => b.active));
        } catch (err) {
          setMyBots([]);
          setAccountWarning(
            err instanceof Error
              ? err.message
              : "Unable to load your bot inventory",
          );
        }
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setCreateLoading(true);
    setCreateError(null);

    try {
      await gamesApi.createTable(createForm, token);
      setShowCreateModal(false);
      setCreateForm({
        name: "",
        small_blind: 10,
        big_blind: 20,
        max_players: 9,
        starting_chips: 1000,
      });
      loadData();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create table",
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !joiningTable || !selectedBotId) return;

    setJoinLoading(true);
    setJoinError(null);

    try {
      await gamesApi.joinTable(joiningTable.id, selectedBotId, token);
      setShowJoinModal(false);
      setJoiningTable(null);
      setSelectedBotId("");
      loadData();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Failed to join table");
    } finally {
      setJoinLoading(false);
    }
  };

  const openJoinModal = (table: Table) => {
    setJoiningTable(table);
    setSelectedBotId(myBots[0]?.id || "");
    setJoinError(null);
    setShowJoinModal(true);
  };

  const liveTableCount = tables.filter(
    (table) => table.status === "running",
  ).length;
  const openSeats = tables.reduce(
    (sum, table) => sum + Math.max(table.maxPlayers - table.currentPlayers, 0),
    0,
  );

  if (isLoading) {
    return <LoadingBlock label="Loading live tables" className="page-shell" />;
  }

  return (
    <PageShell className="space-y-8">
      <PageHeader
        eyebrow="Live cash game lobby"
        title="Production-grade table overview"
        description="Monitor running tables, preview open seats, and deploy one of your bots directly into a live game."
        actions={
          <>
            <Button variant="secondary" onClick={loadData}>
              Refresh
            </Button>
            {isAdmin && (
              <Button
                onClick={() => {
                  setCreateError(null);
                  setShowCreateModal(true);
                }}
              >
                Create table
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Live tables"
          value={liveTableCount}
          hint="Currently dealing hands"
          accent
        />
        <MetricCard
          label="Open seats"
          value={openSeats}
          hint="Immediate bot entry opportunities"
        />
        <MetricCard
          label="Available bots"
          value={user ? myBots.length : "—"}
          hint={
            user ? "Active bots eligible to join" : "Sign in to deploy a bot"
          }
        />
      </div>

      {error && (
        <AlertBanner
          dismissible
          onDismiss={() => setError(null)}
          onRetry={() => loadData()}
          title="Unable to load table data"
        >
          {error}
        </AlertBanner>
      )}

      {accountWarning && (
        <AlertBanner
          dismissible
          onDismiss={() => setAccountWarning(null)}
          title="Account-only data unavailable"
        >
          Live tables loaded, but your private bot list could not be refreshed.
          {` ${accountWarning}`}
        </AlertBanner>
      )}

      {tables.length === 0 ? (
        <EmptyState
          illustration="table"
          title="No live tables available"
          description={
            isAdmin
              ? "Create the first live table and start routing bots into gameplay."
              : "No tables are currently running. Check back shortly."
          }
          action={
            isAdmin ? (
              <Button
                onClick={() => {
                  setCreateError(null);
                  setShowCreateModal(true);
                }}
              >
                Create first table
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {tables.map((table, index) => (
            <motion.div
              key={table.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <SurfaceCard className="space-y-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-white">
                      {table.name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Table watch mode with direct spectator access and bot
                      deployment.
                    </p>
                  </div>
                  <StatusPill
                    label={table.status}
                    tone={
                      table.status === "running"
                        ? "success"
                        : table.status === "waiting"
                          ? "warning"
                          : "neutral"
                    }
                    pulse={table.status === "running"}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <SurfaceCard muted className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Blinds
                    </div>
                    <div className="text-2xl font-semibold text-white">
                      {table.smallBlind} / {table.bigBlind}
                    </div>
                  </SurfaceCard>
                  <SurfaceCard muted className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Seats filled
                    </div>
                    <div className="text-2xl font-semibold text-white">
                      {table.currentPlayers}/{table.maxPlayers}
                    </div>
                  </SurfaceCard>
                  <SurfaceCard muted className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Availability
                    </div>
                    <div className="text-2xl font-semibold text-white">
                      {Math.max(table.maxPlayers - table.currentPlayers, 0)}
                    </div>
                  </SurfaceCard>
                </div>

                <div className="rounded-3xl border border-white/6 bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500">
                    <span>Seat preview</span>
                    <span>
                      {table.currentPlayers > 0
                        ? "Live occupancy"
                        : "Awaiting players"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: table.maxPlayers }).map((_, i) => {
                      const filled = i < table.currentPlayers;
                      return (
                        <div
                          key={i}
                          className={
                            filled
                              ? "h-10 w-10 rounded-full border border-accent/20 bg-accent/15"
                              : "h-10 w-10 rounded-full border border-dashed border-white/10 bg-white/[0.02]"
                          }
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 border-t border-white/6 pt-4">
                  <Button
                    variant="secondary"
                    asLink={`/game/${table.id}`}
                    className="flex-1"
                  >
                    Watch table
                  </Button>
                  {user && table.currentPlayers < table.maxPlayers && (
                    <Button
                      onClick={() => openJoinModal(table)}
                      disabled={myBots.length === 0}
                      className="flex-1"
                    >
                      Join with bot
                    </Button>
                  )}
                </div>
              </SurfaceCard>
            </motion.div>
          ))}
        </div>
      )}

      <AppModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create cash table"
        description="Configure the live table structure and open it to spectators and bot seats."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-table-form"
              disabled={createLoading}
            >
              {createLoading ? "Creating..." : "Create table"}
            </Button>
          </div>
        }
      >
        <form
          id="create-table-form"
          onSubmit={handleCreateTable}
          className="space-y-4"
        >
          {createError && (
            <AlertBanner title="Create table failed">{createError}</AlertBanner>
          )}
          <TextField
            label="Table name"
            value={createForm.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setCreateForm({ ...createForm, name: e.target.value })
            }
            placeholder="High Stakes Arena"
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Small blind"
              type="number"
              min={1}
              value={createForm.small_blind}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setCreateForm({
                  ...createForm,
                  small_blind: parseInt(e.target.value) || 0,
                })
              }
              required
            />
            <TextField
              label="Big blind"
              type="number"
              min={1}
              value={createForm.big_blind}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setCreateForm({
                  ...createForm,
                  big_blind: parseInt(e.target.value) || 0,
                })
              }
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Max players"
              select
              value={createForm.max_players}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setCreateForm({
                  ...createForm,
                  max_players: parseInt(e.target.value),
                })
              }
            >
              {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>
                  {n} seats
                </option>
              ))}
            </TextField>
            <TextField
              label="Starting chips"
              type="number"
              min={100}
              step={100}
              value={createForm.starting_chips}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setCreateForm({
                  ...createForm,
                  starting_chips: parseInt(e.target.value) || 0,
                })
              }
              required
            />
          </div>
        </form>
      </AppModal>

      <AppModal
        open={showJoinModal && !!joiningTable}
        onClose={() => setShowJoinModal(false)}
        title="Deploy a bot into the table"
        description={
          joiningTable
            ? `Select which active bot should join ${joiningTable.name}.`
            : ""
        }
        footer={
          myBots.length > 0 ? (
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowJoinModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="join-table-form"
                disabled={joinLoading || !selectedBotId}
              >
                {joinLoading ? "Joining..." : "Join table"}
              </Button>
            </div>
          ) : undefined
        }
      >
        <form
          id="join-table-form"
          onSubmit={handleJoinTable}
          className="space-y-4"
        >
          {joinError && (
            <AlertBanner title="Join failed">{joinError}</AlertBanner>
          )}
          {myBots.length === 0 ? (
            <EmptyState
              illustration="bot"
              title="No active bots available"
              description="Create and activate a bot before trying to join a live table."
              action={
                <Button variant="secondary" asLink="/bots">
                  Go to bots
                </Button>
              }
            />
          ) : (
            <>
              <TextField
                label="Bot to deploy"
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

              {joiningTable && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SurfaceCard muted>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Blinds
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {joiningTable.smallBlind} / {joiningTable.bigBlind}
                    </div>
                  </SurfaceCard>
                  <SurfaceCard muted>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Current seats
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {joiningTable.currentPlayers} / {joiningTable.maxPlayers}
                    </div>
                  </SurfaceCard>
                </div>
              )}
            </>
          )}
        </form>
      </AppModal>
    </PageShell>
  );
}
