import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { botsApi } from "../api/bots";
import { useAuthStore } from "../stores/authStore";
import type { Bot, BotActivity, BotSubscription } from "../types";

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
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const [profile, setProfile] = useState<BotProfileData | null>(null);
  const [activity, setActivity] = useState<BotActivity | null>(null);
  const [subscriptions, setSubscriptions] = useState<BotSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
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
    const interval = setInterval(loadData, 10000);
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
          tournament_type_filter: subscriptionForm.tournament_type_filter || undefined,
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
    if (!confirm("Are you sure you want to delete this subscription?")) return;

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
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-gold"></div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🤖</div>
        <h3 className="text-xl font-bold text-white mb-2">Bot Not Found</h3>
        <p className="text-gray-400 mb-4">{error || "Unable to load bot"}</p>
        <button
          onClick={() => navigate("/bots")}
          className="px-6 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-400 transition-colors"
        >
          Back to Bots
        </button>
      </div>
    );
  }

  const { bot, stats, vpip, pfr, aggression } = profile;

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
            clipRule="evenodd"
          />
        </svg>
        Back
      </button>

      <div className="grid lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1"
        >
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-poker-gold/20 rounded-full flex items-center justify-center">
                <span className="text-3xl">🤖</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{bot.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`w-2 h-2 rounded-full ${activity?.isActive ? "bg-green-500 animate-pulse" : "bg-gray-500"}`}
                  />
                  <span className="text-sm text-gray-400">
                    {activity?.isActive ? "Active Now" : "Offline"}
                  </span>
                </div>
              </div>
            </div>

            {bot.description && (
              <p className="text-gray-400 text-sm mb-6">{bot.description}</p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900/50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-white">
                  {stats.totalHands}
                </div>
                <div className="text-xs text-gray-400">Hands Played</div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-white">
                  {stats.totalTournaments}
                </div>
                <div className="text-xs text-gray-400">Tournaments</div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-white">
                  {stats.tournamentWins}
                </div>
                <div className="text-xs text-gray-400">Wins</div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4 text-center">
                <div
                  className={`text-2xl font-bold ${stats.totalNet >= 0 ? "text-green-400" : "text-red-400"}`}
                >
                  {stats.totalNet >= 0 ? "+" : ""}
                  {stats.totalNet.toLocaleString()}
                </div>
                <div className="text-xs text-gray-400">Net Chips</div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">
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
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2"
        >
          {isOwner && (
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">
                  Auto-Registration Subscriptions
                </h2>
                <button
                  onClick={() => setShowSubscriptionModal(true)}
                  className="px-4 py-2 bg-poker-gold text-gray-900 text-sm font-medium rounded-lg hover:bg-yellow-400 transition-colors"
                >
                  + Add Subscription
                </button>
              </div>

              {subscriptions.length === 0 ? (
                <p className="text-gray-400 text-sm">
                  No auto-registration subscriptions. Add one to automatically
                  register this bot in tournaments.
                </p>
              ) : (
                <div className="space-y-3">
                  {subscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="bg-gray-900/50 rounded-lg p-4 flex items-center justify-between"
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
                        <div className="text-sm text-gray-400 mt-1">
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
                        <button
                          onClick={() => handleToggleSubscription(sub)}
                          className={`px-3 py-1 text-sm rounded-lg ${
                            sub.status === "active"
                              ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                              : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                          }`}
                        >
                          {sub.status === "active" ? "Pause" : "Resume"}
                        </button>
                        <button
                          onClick={() => handleDeleteSubscription(sub.id)}
                          className="px-3 py-1 text-sm rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activity?.isActive ? (
            <div className="space-y-6">
              {activity.activeGames.length > 0 && (
                <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
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
                        className="block bg-gray-900/50 rounded-lg p-4 hover:bg-gray-900/70 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-white">
                              {game.tableName ||
                                `Table ${game.tableId.substring(0, 8)}`}
                            </div>
                            {game.tournamentName && (
                              <div className="text-sm text-poker-gold">
                                {game.tournamentName}
                              </div>
                            )}
                            <div className="text-sm text-gray-400 mt-1">
                              Hand #{game.handNumber} • {game.status}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-white">
                              {game.chips.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-400">chips</div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {activity.activeTournaments.length > 0 && (
                <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
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
                        className="block bg-gray-900/50 rounded-lg p-4 hover:bg-gray-900/70 transition-colors"
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
                                      : "bg-gray-500/20 text-gray-400"
                                }`}
                              >
                                {tournament.status.replace("_", " ")}
                              </span>
                              {tournament.position && (
                                <span className="text-sm text-gray-400">
                                  #{tournament.position}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-white">
                              {tournament.chips.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-400">chips</div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-12 text-center">
              <div className="text-5xl mb-4">💤</div>
              <h3 className="text-xl font-bold text-white mb-2">
                Bot is Currently Offline
              </h3>
              <p className="text-gray-400">
                This bot is not participating in any active games or tournaments
                right now.
              </p>
            </div>
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
    </div>
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
        <span className="text-sm font-medium text-gray-300" title={description}>
          {label}
        </span>
        <span className="text-sm text-white">{value.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
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
  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-2xl font-bold text-white mb-6">
            Add Auto-Registration
          </h2>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tournament Type
              </label>
              <select
                value={form.tournament_type_filter}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tournament_type_filter: e.target.value as
                      | ""
                      | "rolling"
                      | "scheduled",
                  })
                }
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-poker-gold"
              >
                <option value="">All Types</option>
                <option value="rolling">Rolling</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Min Buy-in
                </label>
                <input
                  type="number"
                  value={form.min_buy_in}
                  onChange={(e) =>
                    setForm({ ...form, min_buy_in: e.target.value })
                  }
                  placeholder="0"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-poker-gold"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Buy-in
                </label>
                <input
                  type="number"
                  value={form.max_buy_in}
                  onChange={(e) =>
                    setForm({ ...form, max_buy_in: e.target.value })
                  }
                  placeholder="Unlimited"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-poker-gold"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Priority (1-100)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-poker-gold"
              />
              <p className="text-xs text-gray-400 mt-1">
                Higher priority subscriptions are processed first
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-3 bg-poker-gold text-gray-900 font-semibold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
