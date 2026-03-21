import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { authApi } from "../api/auth";
import { botsApi } from "../api/bots";
import type { Bot } from "../types";
import {
  AlertBanner,
  Button,
  ConfirmDialog,
  EmptyState,
  LoadingBlock,
  MetricCard,
  PageHeader,
  PageShell,
  StatusPill,
  SurfaceCard,
} from "../components/ui/primitives";

export function Profile() {
  const navigate = useNavigate();
  const { user, token, fetchUser, logout } = useAuthStore();
  const [myBots, setMyBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

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
      <PageShell>
        <EmptyState
          title="Authentication required"
          description="Sign in to manage your profile, API key, and owned bots."
          action={
            <Button variant="secondary" asLink="/login">
              Go to login
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (loading) {
    return (
      <LoadingBlock label="Loading profile workspace" className="page-shell" />
    );
  }

  return (
    <PageShell className="space-y-8">
      <PageHeader
        eyebrow="Profile workspace"
        title="Account, credentials, and bot ownership"
        description="Manage identity, API access, and the bots currently assigned to your account."
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              logout();
              navigate("/");
            }}
          >
            Logout
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Owned bots"
          value={myBots.length}
          hint="Bots in your account"
          accent
        />
        <MetricCard
          label="Role"
          value={user?.role?.toUpperCase() || "USER"}
          hint="Workspace access level"
        />
        <MetricCard
          label="Email"
          value={user?.email || "N/A"}
          hint="Primary account contact"
        />
        <MetricCard
          label="Member since"
          value={
            user?.createdAt
              ? new Date(user.createdAt).toLocaleDateString()
              : "N/A"
          }
          hint="Account creation date"
        />
      </div>

      {error && (
        <AlertBanner
          dismissible
          onDismiss={() => setError(null)}
          title="Profile error"
        >
          {error}
        </AlertBanner>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <SurfaceCard className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-accent-light to-accent text-xl font-bold text-surface-400">
                {user?.username?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-white">
                  {user?.username}
                </h2>
                <p className="text-sm text-slate-400">{user?.email}</p>
              </div>
            </div>
            <StatusPill
              label={user?.role === "admin" ? "admin access" : "member"}
              tone={user?.role === "admin" ? "info" : "neutral"}
            />
          </div>
        </SurfaceCard>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <SurfaceCard className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                API key access
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Use this key to authenticate your external bots with the
                platform.
              </p>
            </div>
            <Button
              onClick={() => setConfirmRegenerate(true)}
              disabled={regenerating}
            >
              {regenerating ? "Regenerating..." : "Regenerate key"}
            </Button>
          </div>

          {apiKey ? (
            <div className="rounded-3xl border border-white/8 bg-surface-400 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <code className="break-all font-mono text-sm text-emerald-300">
                  {showApiKey ? apiKey : "••••••••••••••••••••••••••••••••"}
                </code>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => copyToClipboard(apiKey)}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <SurfaceCard muted>
              <p className="text-sm text-slate-400">
                Generate a new API key when you are ready to connect a bot
                endpoint.
              </p>
            </SurfaceCard>
          )}

          <AlertBanner tone="warning" title="Key rotation warning">
            Regenerating your key immediately invalidates the current credential
            for every bot using it.
          </AlertBanner>
        </SurfaceCard>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <SurfaceCard className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Owned bots</h2>
              <p className="mt-1 text-sm text-slate-400">
                Quick access to the bots registered under your account.
              </p>
            </div>
            <Button variant="secondary" asLink="/bots">
              Manage bots
            </Button>
          </div>

          {myBots.length === 0 ? (
            <EmptyState
              title="No bots registered"
              description="Create your first bot to start validating endpoints and joining live games."
              action={<Button asLink="/bots">Open bot workspace</Button>}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {myBots.map((bot) => (
                <Link
                  key={bot.id}
                  to={`/bots/${bot.id}`}
                  className="surface-card-muted block transition-colors hover:border-accent/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-white">
                        {bot.name}
                      </h3>
                      <p className="truncate text-sm text-slate-500">
                        {bot.endpoint}
                      </p>
                    </div>
                    <StatusPill
                      label={bot.active ? "active" : "paused"}
                      tone={bot.active ? "success" : "neutral"}
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SurfaceCard>
      </motion.div>

      <ConfirmDialog
        open={confirmRegenerate}
        title="Regenerate API key"
        description="Your current API key will stop working immediately for all connected bots."
        confirmLabel="Regenerate key"
        onClose={() => setConfirmRegenerate(false)}
        onConfirm={async () => {
          await handleRegenerateApiKey();
          setConfirmRegenerate(false);
        }}
        busy={regenerating}
      />
    </PageShell>
  );
}
