import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { gamesApi, type Table } from "../api/games";
import { botsApi } from "../api/bots";
import { useAuthStore } from "../stores/authStore";
import type { Bot } from "../types";

interface CreateTableForm {
  name: string;
  small_blind: number;
  big_blind: number;
  max_players: number;
  starting_chips: number;
}

export function Tables() {
  const { user, token } = useAuthStore();
  const [tables, setTables] = useState<Table[]>([]);
  const [myBots, setMyBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const tablesData = await gamesApi.getTables();
      setTables(tablesData);

      if (token) {
        const botsData = await botsApi.getMy(token);
        setMyBots(botsData.filter((b) => b.active));
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
      setCreateError(err instanceof Error ? err.message : "Failed to create table");
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-poker-gold"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Cash Tables</h1>
          <p className="text-gray-400 mt-2">
            Watch live games or join with your bot
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadData}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Refresh
          </button>
          {user && (
            <button
              onClick={() => {
                setCreateError(null);
                setShowCreateModal(true);
              }}
              className="px-4 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-400 transition-colors"
            >
              + Create Table
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 cursor-pointer"
          onClick={() => setError(null)}
        >
          {error}
        </div>
      )}

      {tables.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-xl border border-gray-700">
          <div className="text-6xl mb-4">🎰</div>
          <h2 className="text-2xl font-bold text-white mb-2">No Active Tables</h2>
          <p className="text-gray-400 mb-4">
            {user
              ? "Create a table to start playing!"
              : "No tables are currently running. Check back later!"}
          </p>
          {user && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-400 transition-colors"
            >
              Create First Table
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tables.map((table, index) => (
            <motion.div
              key={table.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-white">{table.name}</h3>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    table.status === "running"
                      ? "bg-green-500/20 text-green-400"
                      : table.status === "waiting"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-gray-500/20 text-gray-400"
                  }`}
                >
                  {table.status}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Blinds</span>
                  <span className="text-white">
                    {table.smallBlind} / {table.bigBlind}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Players</span>
                  <span className="text-white">
                    {table.currentPlayers} / {table.maxPlayers}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-700 flex gap-2">
                <Link
                  to={`/game/${table.id}`}
                  className="flex-1 px-4 py-2 bg-gray-700 text-white text-center text-sm rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Watch
                </Link>
                {user && table.currentPlayers < table.maxPlayers && (
                  <button
                    onClick={() => openJoinModal(table)}
                    disabled={myBots.length === 0}
                    className="flex-1 px-4 py-2 bg-poker-gold text-gray-900 text-sm font-medium rounded-lg hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={myBots.length === 0 ? "Create a bot first" : "Join with your bot"}
                  >
                    Join
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Table Modal */}
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
              className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-6">Create Table</h2>

              <form onSubmit={handleCreateTable} className="space-y-4">
                {createError && (
                  <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {createError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Table Name
                  </label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, name: e.target.value })
                    }
                    required
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    placeholder="High Stakes Table"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Small Blind
                    </label>
                    <input
                      type="number"
                      value={createForm.small_blind}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          small_blind: parseInt(e.target.value) || 0,
                        })
                      }
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
                      value={createForm.big_blind}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          big_blind: parseInt(e.target.value) || 0,
                        })
                      }
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
                    <select
                      value={createForm.max_players}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          max_players: parseInt(e.target.value),
                        })
                      }
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    >
                      {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <option key={n} value={n}>
                          {n} players
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Starting Chips
                    </label>
                    <input
                      type="number"
                      value={createForm.starting_chips}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          starting_chips: parseInt(e.target.value) || 0,
                        })
                      }
                      required
                      min={100}
                      step={100}
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
                    {createLoading ? "Creating..." : "Create Table"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Join Table Modal */}
      <AnimatePresence>
        {showJoinModal && joiningTable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setShowJoinModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-2">Join Table</h2>
              <p className="text-gray-400 mb-6">
                Select a bot to join <span className="text-white">{joiningTable.name}</span>
              </p>

              <form onSubmit={handleJoinTable} className="space-y-4">
                {joinError && (
                  <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {joinError}
                  </div>
                )}

                {myBots.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-gray-400 mb-4">
                      You don't have any active bots. Create one first!
                    </p>
                    <Link
                      to="/bots"
                      className="text-poker-gold hover:text-yellow-400 font-medium"
                    >
                      Go to Bots →
                    </Link>
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

                    <div className="bg-gray-900/50 rounded-lg p-4 text-sm">
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-400">Blinds</span>
                        <span className="text-white">
                          {joiningTable.smallBlind} / {joiningTable.bigBlind}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Players</span>
                        <span className="text-white">
                          {joiningTable.currentPlayers} / {joiningTable.maxPlayers}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setShowJoinModal(false)}
                        className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={joinLoading || !selectedBotId}
                        className="flex-1 px-4 py-3 bg-poker-gold text-gray-900 font-semibold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
                      >
                        {joinLoading ? "Joining..." : "Join Table"}
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
