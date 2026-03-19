import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { botsApi } from "../api/bots";
import { useAuthStore } from "../stores/authStore";
import type { Bot } from "../types";

interface BotFormData {
  name: string;
  endpoint: string;
  description: string;
}

interface ValidationResult {
  valid: boolean;
  score: number;
  details: {
    reachable: boolean;
    respondedCorrectly: boolean;
    responseTimeMs: number;
    errors: string[];
  };
}

export function Bots() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const [bots, setBots] = useState<Bot[]>([]);
  const [myBots, setMyBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMyBots, setShowMyBots] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBot, setEditingBot] = useState<Bot | null>(null);
  const [formData, setFormData] = useState<BotFormData>({
    name: "",
    endpoint: "",
    description: "",
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Validation states
  const [validatingBotId, setValidatingBotId] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<
    Record<string, ValidationResult>
  >({});

  const loadBots = useCallback(async () => {
    try {
      setLoading(true);
      const data = await botsApi.getAll();
      setBots(data);

      if (token) {
        const myData = await botsApi.getMy(token);
        setMyBots(myData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bots");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setFormLoading(true);
    setFormError(null);

    try {
      await botsApi.create(formData, token);
      setShowCreateModal(false);
      setFormData({ name: "", endpoint: "", description: "" });
      loadBots();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create bot");
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingBot) return;

    setFormLoading(true);
    setFormError(null);

    try {
      await botsApi.update(
        editingBot.id,
        { endpoint: formData.endpoint, description: formData.description },
        token
      );
      setShowEditModal(false);
      setEditingBot(null);
      loadBots();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update bot");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (botId: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to deactivate this bot?")) return;

    try {
      await botsApi.deactivate(botId, token);
      loadBots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete bot");
    }
  };

  const handleValidate = async (botId: string) => {
    if (!token) return;

    setValidatingBotId(botId);
    try {
      const result = await botsApi.validate(botId, token);
      setValidationResults((prev) => ({ ...prev, [botId]: result }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidatingBotId(null);
    }
  };

  const handleActivate = async (botId: string) => {
    if (!token) return;
    try {
      await botsApi.activate(botId, token);
      loadBots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate bot");
    }
  };

  const openEditModal = (bot: Bot) => {
    setEditingBot(bot);
    setFormData({
      name: bot.name,
      endpoint: bot.endpoint,
      description: bot.description || "",
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const displayedBots = showMyBots ? myBots : bots;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-gold"></div>
      </div>
    );
  }

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

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Bots</h1>
          <p className="text-gray-400 mt-1">
            {showMyBots ? "Your registered bots" : "Active poker bots on the platform"}
          </p>
        </div>

        <div className="flex gap-3">
          {user && (
            <>
              <button
                onClick={() => setShowMyBots(!showMyBots)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showMyBots
                    ? "bg-poker-gold text-gray-900"
                    : "bg-gray-700 text-white hover:bg-gray-600"
                }`}
              >
                {showMyBots ? "All Bots" : "My Bots"}
              </button>
              <button
                onClick={() => {
                  setFormData({ name: "", endpoint: "", description: "" });
                  setFormError(null);
                  setShowCreateModal(true);
                }}
                className="px-4 py-2 bg-poker-gold text-gray-900 rounded-lg text-sm font-medium hover:bg-yellow-400 transition-colors"
              >
                + Create Bot
              </button>
            </>
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

      {displayedBots.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🤖</div>
          <h3 className="text-xl font-bold text-white mb-2">
            {showMyBots ? "You don't have any bots yet" : "No bots yet"}
          </h3>
          <p className="text-gray-400 mb-4">
            {showMyBots
              ? "Create your first bot to start competing"
              : "Register your first bot to get started"}
          </p>
          {user && showMyBots && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-400 transition-colors"
            >
              Create Your First Bot
            </button>
          )}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {displayedBots.map((bot, index) => {
            const isOwner = user && bot.userId === user.id;
            const validation = validationResults[bot.id];

            return (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-gray-800/50 rounded-xl border border-gray-700 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-white truncate">
                      {bot.name}
                    </h3>
                    <span className="text-sm text-gray-400 truncate block">
                      {bot.endpoint}
                    </span>
                  </div>
                  <span
                    className={`w-3 h-3 rounded-full flex-shrink-0 ml-2 ${
                      bot.active ? "bg-green-500" : "bg-gray-500"
                    }`}
                    title={bot.active ? "Active" : "Inactive"}
                  />
                </div>

                {bot.description && (
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                    {bot.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-sm mb-4">
                  <span className="text-gray-400">
                    Score: {bot.lastValidationScore ?? "N/A"}
                  </span>
                  <span className="text-gray-400">
                    {new Date(bot.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {validation && (
                  <div
                    className={`mb-4 p-3 rounded-lg text-sm ${
                      validation.valid
                        ? "bg-green-500/10 border border-green-500 text-green-400"
                        : "bg-red-500/10 border border-red-500 text-red-400"
                    }`}
                  >
                    <div className="font-medium mb-1">
                      {validation.valid ? "✓ Validation Passed" : "✗ Validation Failed"}
                    </div>
                    <div className="text-xs">
                      Score: {validation.score} | Response: {validation.details.responseTimeMs}ms
                    </div>
                    {validation.details.errors.length > 0 && (
                      <div className="text-xs mt-1">
                        {validation.details.errors.slice(0, 2).join(", ")}
                      </div>
                    )}
                  </div>
                )}

                {isOwner && (
                  <div className="flex gap-2 pt-4 border-t border-gray-700">
                    <button
                      onClick={() => handleValidate(bot.id)}
                      disabled={validatingBotId === bot.id}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
                    >
                      {validatingBotId === bot.id ? "Validating..." : "Validate"}
                    </button>
                    <button
                      onClick={() => openEditModal(bot)}
                      className="px-3 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      Edit
                    </button>
                    {!bot.active ? (
                      <button
                        onClick={() => handleActivate(bot.id)}
                        className="px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-500 transition-colors"
                      >
                        Activate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDelete(bot.id)}
                        className="px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-500 transition-colors"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Create Bot Modal */}
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
              <h2 className="text-2xl font-bold text-white mb-6">Create Bot</h2>

              <form onSubmit={handleCreate} className="space-y-4">
                {formError && (
                  <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Bot Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    placeholder="MyPokerBot"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Endpoint URL
                  </label>
                  <input
                    type="url"
                    value={formData.endpoint}
                    onChange={(e) =>
                      setFormData({ ...formData, endpoint: e.target.value })
                    }
                    required
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-poker-gold"
                    placeholder="https://my-bot.example.com/action"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-poker-gold resize-none"
                    placeholder="A brief description of your bot's strategy"
                  />
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
                    disabled={formLoading}
                    className="flex-1 px-4 py-3 bg-poker-gold text-gray-900 font-semibold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
                  >
                    {formLoading ? "Creating..." : "Create Bot"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Bot Modal */}
      <AnimatePresence>
        {showEditModal && editingBot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setShowEditModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-6">
                Edit {editingBot.name}
              </h2>

              <form onSubmit={handleEdit} className="space-y-4">
                {formError && (
                  <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Endpoint URL
                  </label>
                  <input
                    type="url"
                    value={formData.endpoint}
                    onChange={(e) =>
                      setFormData({ ...formData, endpoint: e.target.value })
                    }
                    required
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-poker-gold"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-poker-gold resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="flex-1 px-4 py-3 bg-poker-gold text-gray-900 font-semibold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
                  >
                    {formLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
