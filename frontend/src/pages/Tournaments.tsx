import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TournamentCard } from "../components/tournament/TournamentCard";
import { useTournamentStore } from "../stores/tournamentStore";
import { tournamentsApi } from "../api/tournaments";
import { botsApi } from "../api/bots";
import { useAuthStore } from "../stores/authStore";
import type { Bot, Tournament } from "../types";

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
  const { tournaments, loading, error, fetchTournaments } = useTournamentStore();
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
  const [registeringTournament, setRegisteringTournament] = useState<Tournament | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<string>("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const loadBots = useCallback(async () => {
    if (token) {
      try {
        const bots = await botsApi.getMy(token);
        setMyBots(bots.filter((b) => b.active));
      } catch {
        console.error("Failed to load bots");
      }
    }
  }, [token]);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  useEffect(() => {
    fetchTournaments(statusFilter);
  }, [statusFilter]);

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
        token
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
      setCreateError(err instanceof Error ? err.message : "Failed to create tournament");
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
      await tournamentsApi.register(registeringTournament.id, selectedBotId, token);
      setShowRegisterModal(false);
      setRegisteringTournament(null);
      setSelectedBotId("");
      fetchTournaments(statusFilter || undefined);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Failed to register");
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleUnregister = async (tournamentId: string, botId: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to unregister from this tournament?")) return;

    try {
      await tournamentsApi.unregister(tournamentId, botId, token);
      fetchTournaments(statusFilter || undefined);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to unregister");
    }
  };

  const handleStartTournament = async (tournamentId: string) => {
    if (!token) return;
    try {
      await tournamentsApi.start(tournamentId, token);
      fetchTournaments(statusFilter || undefined);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start tournament");
    }
  };

  const handleCancelTournament = async (tournamentId: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to cancel this tournament?")) return;

    try {
      await tournamentsApi.cancel(tournamentId, token);
      fetchTournaments(statusFilter || undefined);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to cancel tournament");
    }
  };

  const openRegisterModal = (tournament: Tournament) => {
    setRegisteringTournament(tournament);
    setSelectedBotId(myBots[0]?.id || "");
    setRegisterError(null);
    setShowRegisterModal(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Tournaments</h1>
          <p className="text-gray-400 mt-1">
            Browse and join poker tournaments
          </p>
        </div>

        <div className="flex gap-2">
          {STATUSES.map((status) => (
            <button
              key={status.value}
              onClick={() => setStatusFilter(status.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === status.value
                  ? "bg-poker-gold text-gray-900"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {status.label}
            </button>
          ))}
          {user && (
            <button
              onClick={() => {
                setCreateError(null);
                setShowCreateModal(true);
              }}
              className="px-4 py-2 bg-poker-gold text-gray-900 rounded-lg text-sm font-medium hover:bg-yellow-400 transition-colors ml-2"
            >
              + Create
            </button>
          )}
        </div>
      </div>

      {(error || actionError) && (
        <div
          className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 cursor-pointer"
          onClick={() => setActionError(null)}
        >
          {error || actionError}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-gold"></div>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎰</div>
          <h3 className="text-xl font-bold text-white mb-2">
            No tournaments found
          </h3>
          <p className="text-gray-400 mb-4">
            {user
              ? "Create a tournament to start competing!"
              : "Check back later for upcoming tournaments"}
          </p>
          {user && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-400 transition-colors"
            >
              Create Tournament
            </button>
          )}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {tournaments.map((tournament, index) => (
            <motion.div
              key={tournament.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <TournamentCard
                tournament={tournament}
                onRegister={user && tournament.status === "registering" ? () => openRegisterModal(tournament) : undefined}
                onUnregister={
                  user && tournament.status === "registering"
                    ? (botId: string) => handleUnregister(tournament.id, botId)
                    : undefined
                }
                onStart={
                  user && tournament.status === "registering" && tournament.registeredPlayers >= 2
                    ? () => handleStartTournament(tournament.id)
                    : undefined
                }
                onCancel={
                  user && tournament.status === "registering"
                    ? () => handleCancelTournament(tournament.id)
                    : undefined
                }
                myBotIds={myBots.map((b) => b.id)}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create Tournament Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-xl p-6 w-full max-w-lg border border-gray-700 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-6">Create Tournament</h2>

              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {createError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Tournament Name
                  </label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    placeholder="Sunday Million"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Buy-in
                    </label>
                    <input
                      type="number"
                      value={createForm.buyIn}
                      onChange={(e) => setCreateForm({ ...createForm, buyIn: parseInt(e.target.value) || 0 })}
                      required
                      min={0}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Starting Chips
                    </label>
                    <input
                      type="number"
                      value={createForm.startingChips}
                      onChange={(e) => setCreateForm({ ...createForm, startingChips: parseInt(e.target.value) || 0 })}
                      required
                      min={100}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Small Blind
                    </label>
                    <input
                      type="number"
                      value={createForm.smallBlind}
                      onChange={(e) => setCreateForm({ ...createForm, smallBlind: parseInt(e.target.value) || 0 })}
                      required
                      min={1}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Big Blind
                    </label>
                    <input
                      type="number"
                      value={createForm.bigBlind}
                      onChange={(e) => setCreateForm({ ...createForm, bigBlind: parseInt(e.target.value) || 0 })}
                      required
                      min={1}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Max Players
                    </label>
                    <input
                      type="number"
                      value={createForm.maxPlayers}
                      onChange={(e) => setCreateForm({ ...createForm, maxPlayers: parseInt(e.target.value) || 0 })}
                      required
                      min={2}
                      max={1000}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Blind Increase (min)
                    </label>
                    <input
                      type="number"
                      value={createForm.blindIncreaseMinutes}
                      onChange={(e) => setCreateForm({ ...createForm, blindIncreaseMinutes: parseInt(e.target.value) || 0 })}
                      required
                      min={1}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createLoading}
                    className="flex-1 px-4 py-3 bg-poker-gold text-gray-900 font-semibold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
                  >
                    {createLoading ? "Creating..." : "Create Tournament"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Register Bot Modal */}
      <AnimatePresence>
        {showRegisterModal && registeringTournament && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setShowRegisterModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-2">Register for Tournament</h2>
              <p className="text-gray-400 mb-6">{registeringTournament.name}</p>

              <form onSubmit={handleRegister} className="space-y-4">
                {registerError && (
                  <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {registerError}
                  </div>
                )}

                {myBots.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-gray-400">
                      You need an active bot to register. Create one first!
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Select Bot
                      </label>
                      <select
                        value={selectedBotId}
                        onChange={(e) => setSelectedBotId(e.target.value)}
                        required
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-poker-gold"
                      >
                        {myBots.map((bot) => (
                          <option key={bot.id} value={bot.id}>
                            {bot.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="bg-gray-900/50 rounded-lg p-4 text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Buy-in</span>
                        <span className="text-white">{registeringTournament.buyIn}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Starting Chips</span>
                        <span className="text-white">{registeringTournament.startingChips}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Players</span>
                        <span className="text-white">
                          {registeringTournament.registeredPlayers} / {registeringTournament.maxPlayers}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setShowRegisterModal(false)}
                        className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={registerLoading || !selectedBotId}
                        className="flex-1 px-4 py-3 bg-poker-gold text-gray-900 font-semibold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
                      >
                        {registerLoading ? "Registering..." : "Register"}
                      </button>
                    </div>
                  </>
                )}
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
