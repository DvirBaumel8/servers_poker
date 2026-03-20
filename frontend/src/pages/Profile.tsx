import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { authApi } from "../api/auth";
import { botsApi } from "../api/bots";
import type { Bot } from "../types";

export function Profile() {
  const navigate = useNavigate();
  const { user, token, fetchUser, logout } = useAuthStore();
  const [myBots, setMyBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) {
      navigate("/login");
      return;
    }

    try {
      setLoading(true);
      await fetchUser();
      const bots = await botsApi.getMy(token);
      setMyBots(bots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [token, fetchUser, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRegenerateApiKey = async () => {
    if (!token) return;
    if (
      !confirm(
        "Are you sure? This will invalidate your current API key and all bots using it.",
      )
    )
      return;

    setRegenerating(true);
    try {
      const result = await authApi.regenerateApiKey(token);
      setApiKey(result.api_key);
      setShowApiKey(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to regenerate API key",
      );
    } finally {
      setRegenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!token) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-white mb-4">Not logged in</h2>
        <Link
          to="/login"
          className="text-poker-gold hover:text-yellow-400 font-medium"
        >
          Go to Login →
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-gold"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Profile</h1>
        <p className="text-gray-400 mt-1">Manage your account and API access</p>
      </div>

      {error && (
        <div
          className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 cursor-pointer"
          onClick={() => setError(null)}
        >
          {error}
        </div>
      )}

      {/* User Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800/50 rounded-xl border border-gray-700 p-6 mb-6"
      >
        <h2 className="text-xl font-bold text-white mb-4">
          Account Information
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Username</label>
            <p className="text-white text-lg font-medium">{user?.username}</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <p className="text-white text-lg">{user?.email}</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Role</label>
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                user?.role === "admin"
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {user?.role?.toUpperCase()}
            </span>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Member Since
            </label>
            <p className="text-white">
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString()
                : "N/A"}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-700">
          <button
            onClick={() => {
              logout();
              navigate("/");
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
          >
            Logout
          </button>
        </div>
      </motion.div>

      {/* API Key Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gray-800/50 rounded-xl border border-gray-700 p-6 mb-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">API Key</h2>
          <button
            onClick={handleRegenerateApiKey}
            disabled={regenerating}
            className="px-4 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-400 disabled:opacity-50 transition-colors"
          >
            {regenerating ? "Regenerating..." : "Regenerate Key"}
          </button>
        </div>

        <p className="text-gray-400 text-sm mb-4">
          Use this API key to authenticate your bots with our platform. Keep it
          secret!
        </p>

        {apiKey ? (
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <code className="text-green-400 font-mono text-sm break-all">
                {showApiKey ? apiKey : "••••••••••••••••••••••••••••••••"}
              </code>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="px-3 py-1 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                >
                  {showApiKey ? "Hide" : "Show"}
                </button>
                <button
                  onClick={() => copyToClipboard(apiKey)}
                  className="px-3 py-1 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-900/50 rounded-lg p-4 text-gray-400 text-sm">
            Click "Regenerate Key" to generate a new API key. Your current key
            will be invalidated.
          </div>
        )}

        <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-yellow-400 text-sm">
            <strong>Warning:</strong> Regenerating your API key will immediately
            invalidate the old key. All bots using the old key will stop
            working.
          </p>
        </div>
      </motion.div>

      {/* My Bots Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gray-800/50 rounded-xl border border-gray-700 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">My Bots</h2>
          <Link
            to="/bots"
            className="text-poker-gold hover:text-yellow-400 text-sm font-medium"
          >
            Manage Bots →
          </Link>
        </div>

        {myBots.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🤖</div>
            <p className="text-gray-400 mb-4">
              You haven't created any bots yet
            </p>
            <Link
              to="/bots"
              className="inline-block px-4 py-2 bg-poker-gold text-gray-900 rounded-lg font-medium hover:bg-yellow-400 transition-colors"
            >
              Create Your First Bot
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myBots.map((bot) => (
              <div
                key={bot.id}
                className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      bot.active ? "bg-green-500" : "bg-gray-500"
                    }`}
                  />
                  <div>
                    <p className="text-white font-medium">{bot.name}</p>
                    <p className="text-gray-400 text-sm truncate max-w-xs">
                      {bot.endpoint}
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="text-gray-400">
                    Score: {bot.lastValidationScore ?? "N/A"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
