import { useEffect, useState, useCallback, type ChangeEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { botsApi } from "../api/bots";
import { useAuthStore } from "../stores/authStore";
import { BOT_PROFILE_POLL_MS } from "../utils/timing";
import type { Bot, BotActivity, BotSubscription } from "../types";
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
  StatusPill,
  SurfaceCard,
  TextField,
} from "../components/ui/primitives";

interface BotProfileData {
  bot: Bot;
  stats: {
    totalHands: number;
    totalTournaments: number;
    tournamentWins: number;
    totalNet: number;
  };
  vpip: number;
  pfr: number;
  aggression: number;
}

export function BotProfile() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const [profile, setProfile] = useState<BotProfileData | null>(null);
  const [activity, setActivity] = useState<BotActivity | null>(null);
  const [subscriptions, setSubscriptions] = useState<BotSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [confirmDeleteSubId, setConfirmDeleteSubId] = useState<string | null>(
    null,
  );
  const [subscriptionForm, setSubscriptionForm] = useState({
    tournament_type_filter: "" as "" | "rolling" | "scheduled",
    min_buy_in: "",
    max_buy_in: "",
    priority: "50",
  });

  const isOwner = profile?.bot && user?.id === profile.bot.userId;

  const loadData = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      const [profileData, activityData] = await Promise.all([
        botsApi.getProfile(id),
        botsApi.getActivity(id),
      ]);
      setProfile(profileData);
      setActivity(activityData);

      if (token) {
        try {
          const subs = await botsApi.getSubscriptions(id, token);
          setSubscriptions(subs);
        } catch {
          // User may not own this bot
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bot data");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, BOT_PROFILE_POLL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !token) return;

    setSubscriptionLoading(true);
    try {
      await botsApi.createSubscription(
        id,
        {
          tournament_type_filter:
            subscriptionForm.tournament_type_filter || undefined,
          min_buy_in: subscriptionForm.min_buy_in
            ? parseInt(subscriptionForm.min_buy_in)
            : undefined,
          max_buy_in: subscriptionForm.max_buy_in
            ? parseInt(subscriptionForm.max_buy_in)
            : undefined,
          priority: parseInt(subscriptionForm.priority),
        },
        token,
      );
      setShowSubscriptionModal(false);
      setSubscriptionForm({
        tournament_type_filter: "",
        min_buy_in: "",
        max_buy_in: "",
        priority: "50",
      });
      loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create subscription",
      );
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleToggleSubscription = async (sub: BotSubscription) => {
    if (!id || !token) return;

    try {
      if (sub.status === "active") {
        await botsApi.pauseSubscription(id, sub.id, token);
      } else {
        await botsApi.resumeSubscription(id, sub.id, token);
      }
      loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update subscription",
      );
    }
  };

  const handleDeleteSubscription = async (subId: string) => {
    if (!id || !token) return;

    try {
      await botsApi.deleteSubscription(id, subId, token);
      loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete subscription",
      );
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading bot profile" className="page-shell" />;
  }

  if (error || !profile) {
    return (
      <PageShell>
        <EmptyState
          title="Bot not found"
          description={error || "Unable to load this bot profile."}
          action={
            <Button variant="secondary" asLink="/bots">
              Back to bots
            </Button>
          }
        />
      </PageShell>
    );
  }

  const { bot, stats, vpip, pfr, aggression } = profile;

  return (
    <PageShell className="space-y-8">
      <PageHeader
        backHref="/bots"
        backLabel="Back to bots"
        eyebrow="Bot profile"
        title={bot.name}
        description={
          bot.description ||
          "Bot detail workspace with live activity and auto-registration rules."
        }
        actions={
          <StatusPill
            label={
              activity?.isActive
                ? "active now"
                : bot.active
                  ? "ready"
                  : "paused"
            }
            tone={
              activity?.isActive ? "success" : bot.active ? "info" : "neutral"
            }
            pulse={!!activity?.isActive}
          />
        }
      />

      {error && (
        <AlertBanner
          dismissible
          onDismiss={() => setError(null)}
          title="Bot profile error"
        >
          {error}
        </AlertBanner>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1"
        >
          <SurfaceCard className="space-y-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-accent/12 text-lg font-bold text-accent">
                AI
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{bot.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`w-2 h-2 rounded-full ${activity?.isActive ? "bg-green-500 animate-pulse" : "bg-gray-500"}`}
                  />
                  <span className="text-sm text-muted">
                    {activity?.isActive ? "Active Now" : "Offline"}
                  </span>
                </div>
              </div>
            </div>

            {bot.description && (
              <p className="text-muted text-sm mb-6">{bot.description}</p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <MetricCard label="Hands" value={stats.totalHands} />
              <MetricCard label="Tournaments" value={stats.totalTournaments} />
              <MetricCard label="Wins" value={stats.tournamentWins} />
              <MetricCard
                label="Net chips"
                value={`${stats.totalNet >= 0 ? "+" : ""}${stats.totalNet.toLocaleString()}`}
                accent={stats.totalNet >= 0}
              />
            </div>

            <div className="mt-2 border-t border-white/6 pt-6">
              <h3 className="mb-4 text-sm font-semibold text-muted-light">
                Playing Style
              </h3>
              <div className="space-y-3">
                <StatBar
                  label="VPIP"
                  value={vpip}
                  description="Voluntarily Put in Pot"
                />
                <StatBar label="PFR" value={pfr} description="Pre-Flop Raise" />
                <StatBar
                  label="AGG"
                  value={aggression}
                  description="Aggression Factor"
                />
              </div>
            </div>
          </SurfaceCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2"
        >
          {isOwner && (
            <SurfaceCard className="mb-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">
                  Auto-Registration Subscriptions
                </h2>
                <Button onClick={() => setShowSubscriptionModal(true)}>
                  + Add Subscription
                </Button>
              </div>

              {subscriptions.length === 0 ? (
                <EmptyState
                  title="No subscriptions"
                  description="Add an auto-registration rule to let this bot enter tournaments automatically."
                />
              ) : (
                <div className="space-y-3">
                  {subscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="surface-card-muted flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              sub.status === "active"
                                ? "bg-green-500"
                                : "bg-gray-500"
                            }`}
                          />
                          <span className="font-medium text-white">
                            {sub.tournament_name ||
                              (sub.tournament_type_filter
                                ? `${sub.tournament_type_filter} tournaments`
                                : "All tournaments")}
                          </span>
                        </div>
                        <div className="text-sm text-muted mt-1">
                          {sub.min_buy_in || sub.max_buy_in ? (
                            <span>
                              Buy-in: {sub.min_buy_in || 0} -{" "}
                              {sub.max_buy_in || "∞"}
                            </span>
                          ) : (
                            <span>Any buy-in</span>
                          )}{" "}
                          • Priority: {sub.priority} •{" "}
                          {sub.successful_registrations} registrations
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => handleToggleSubscription(sub)}
                        >
                          {sub.status === "active" ? "Pause" : "Resume"}
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => setConfirmDeleteSubId(sub.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SurfaceCard>
          )}

          {activity?.isActive ? (
            <div className="space-y-6">
              {activity.activeGames.length > 0 && (
                <SurfaceCard className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <h2 className="text-lg font-bold text-white">
                      Active Games
                    </h2>
                  </div>
                  <div className="space-y-3">
                    {activity.activeGames.map((game) => (
                      <Link
                        key={game.tableId}
                        to={`/game/${game.tableId}`}
                        className="block bg-subtle-dark/50 rounded-lg p-4 hover:bg-subtle-dark/70 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-white">
                              {game.tableName || "Live Table"}
                            </div>
                            {game.tournamentName && (
                              <div className="text-sm text-poker-gold">
                                {game.tournamentName}
                              </div>
                            )}
                            <div className="text-sm text-muted mt-1">
                              Hand #{game.handNumber} • {game.status}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-white">
                              {game.chips.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted">chips</div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </SurfaceCard>
              )}

              {activity.activeTournaments.length > 0 && (
                <SurfaceCard className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 bg-poker-gold rounded-full animate-pulse"></div>
                    <h2 className="text-lg font-bold text-white">
                      Active Tournaments
                    </h2>
                  </div>
                  <div className="space-y-3">
                    {activity.activeTournaments.map((tournament) => (
                      <Link
                        key={tournament.tournamentId}
                        to={`/tournaments/${tournament.tournamentId}`}
                        className="block bg-subtle-dark/50 rounded-lg p-4 hover:bg-subtle-dark/70 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-white">
                              {tournament.tournamentName}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`px-2 py-0.5 text-xs rounded-full ${
                                  tournament.status === "running"
                                    ? "bg-green-500/20 text-green-400"
                                    : tournament.status === "final_table"
                                      ? "bg-poker-gold/20 text-poker-gold"
                                      : "bg-gray-500/20 text-muted"
                                }`}
                              >
                                {tournament.status.replace("_", " ")}
                              </span>
                              {tournament.position && (
                                <span className="text-sm text-muted">
                                  #{tournament.position}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-white">
                              {tournament.chips.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted">chips</div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </SurfaceCard>
              )}
            </div>
          ) : (
            <EmptyState
              title="Bot currently offline"
              description="This bot is not participating in any active games or tournaments right now."
            />
          )}
        </motion.div>
      </div>

      <SubscriptionModal
        show={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onSubmit={handleCreateSubscription}
        loading={subscriptionLoading}
        form={subscriptionForm}
        setForm={setSubscriptionForm}
      />
      <ConfirmDialog
        open={!!confirmDeleteSubId}
        title="Delete subscription"
        description="This bot will stop auto-registering under the selected rule."
        confirmLabel="Delete subscription"
        onClose={() => setConfirmDeleteSubId(null)}
        onConfirm={async () => {
          if (!confirmDeleteSubId) return;
          await handleDeleteSubscription(confirmDeleteSubId);
          setConfirmDeleteSubId(null);
        }}
      />
    </PageShell>
  );
}

function StatBar({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  const percentage = Math.min(value, 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-muted-light" title={description}>
          {label}
        </span>
        <span className="text-sm text-white">{value.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-subtle-light rounded-full h-2">
        <div
          className="bg-poker-gold rounded-full h-2 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function SubscriptionModal({
  show,
  onClose,
  onSubmit,
  loading,
  form,
  setForm,
}: {
  show: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  form: {
    tournament_type_filter: "" | "rolling" | "scheduled";
    min_buy_in: string;
    max_buy_in: string;
    priority: string;
  };
  setForm: React.Dispatch<
    React.SetStateAction<{
      tournament_type_filter: "" | "rolling" | "scheduled";
      min_buy_in: string;
      max_buy_in: string;
      priority: string;
    }>
  >;
}) {
  return (
    <AppModal
      open={show}
      onClose={onClose}
      title="Add auto-registration"
      description="Create a tournament matching rule for this bot."
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="subscription-form" disabled={loading}>
            {loading ? "Creating..." : "Create"}
          </Button>
        </div>
      }
    >
      <form id="subscription-form" onSubmit={onSubmit} className="space-y-4">
        <TextField
          label="Tournament type"
          select
          value={form.tournament_type_filter}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            setForm({
              ...form,
              tournament_type_filter: e.target.value as
                | ""
                | "rolling"
                | "scheduled",
            })
          }
        >
          <option value="">All Types</option>
          <option value="rolling">Rolling</option>
          <option value="scheduled">Scheduled</option>
        </TextField>

        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Min buy-in"
            type="number"
            value={form.min_buy_in}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setForm({ ...form, min_buy_in: e.target.value })
            }
            placeholder="0"
          />
          <TextField
            label="Max buy-in"
            type="number"
            value={form.max_buy_in}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setForm({ ...form, max_buy_in: e.target.value })
            }
            placeholder="Unlimited"
          />
        </div>

        <TextField
          label="Priority (1-100)"
          type="number"
          min="1"
          max="100"
          value={form.priority}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setForm({ ...form, priority: e.target.value })
          }
          hint="Higher priority subscriptions are processed first."
        />
      </form>
    </AppModal>
  );
}
