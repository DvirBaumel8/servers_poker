import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { botsApi } from "../api/bots";
import { useAuthStore } from "../stores/authStore";
import type { Bot, BotActivity } from "../types";
import {
  AlertBanner,
  Button,
  ConfirmDialog,
  EmptyState,
  MetricCard,
  PageHeader,
  PageShell,
  SegmentedTabs,
  SkeletonCard,
  SkeletonMetricCards,
  SkeletonPageHeader,
  StatusPill,
  SurfaceCard,
} from "../components/ui/primitives";

export function Bots() {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [bots, setBots] = useState<Bot[]>([]);
  const [myBots, setMyBots] = useState<Bot[]>([]);
  const [activeBots, setActiveBots] = useState<BotActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountWarning, setAccountWarning] = useState<string | null>(null);
  const [showMyBots, setShowMyBots] = useState(false);
  const [confirmDeleteBotId, setConfirmDeleteBotId] = useState<string | null>(
    null,
  );

  const loadBots = useCallback(async () => {
    try {
      setLoading(true);
      setAccountWarning(null);
      const [data, activeData] = await Promise.all([
        botsApi.getAll(),
        botsApi.getActiveBots(),
      ]);
      setBots(data);
      setActiveBots(activeData.bots);

      if (token) {
        try {
          const myData = await botsApi.getMy(token);
          setMyBots(myData);
        } catch (err) {
          setMyBots([]);
          setAccountWarning(
            err instanceof Error
              ? err.message
              : "Unable to load your private bot inventory",
          );
        }
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bots");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  const handleDelete = async (botId: string) => {
    if (!token) return;

    try {
      await botsApi.deactivate(botId, token);
      loadBots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete bot");
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

  const displayedBots = showMyBots ? myBots : bots;
  const totalLiveGames = activeBots.reduce(
    (sum, activity) => sum + activity.activeGames.length,
    0,
  );

  if (loading) {
    return (
      <PageShell className="space-y-8">
        <SkeletonPageHeader />
        <SkeletonMetricCards count={4} />
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-8">
      <PageHeader
        eyebrow="Bot workspace"
        title={showMyBots ? "Your bot operations" : "Platform bot directory"}
        description={
          showMyBots
            ? "Manage owned bots, activate or deactivate them, and monitor recent performance."
            : "Explore active competitors across the platform and jump into live bot profiles."
        }
        actions={
          user ? (
            <>
              <SegmentedTabs
                value={showMyBots ? "mine" : "all"}
                onChange={(value) => setShowMyBots(value === "mine")}
                items={[
                  { value: "all", label: "All bots" },
                  { value: "mine", label: "My bots" },
                ]}
              />
              <Button onClick={() => navigate("/bots/build")}>
                Build a Bot
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Visible bots"
          value={displayedBots.length}
          hint="Current listing scope"
          accent
        />
        <MetricCard
          label="Active right now"
          value={activeBots.length}
          hint="Bots in live games or tournaments"
        />
        <MetricCard
          label="Live games"
          value={totalLiveGames}
          hint="Games being played by tracked bots"
        />
        <MetricCard
          label="My bots"
          value={user ? myBots.length : "—"}
          hint="Owned bot inventory"
        />
      </div>

      {error && (
        <AlertBanner
          dismissible
          onDismiss={() => setError(null)}
          onRetry={loadBots}
          title="Bot workspace error"
        >
          {error}
        </AlertBanner>
      )}

      {accountWarning && (
        <AlertBanner
          dismissible
          onDismiss={() => setAccountWarning(null)}
          title="Account-only bot data unavailable"
        >
          The public directory loaded, but your private bot inventory could not
          be refreshed. {accountWarning}
        </AlertBanner>
      )}

      {activeBots.length > 0 && !showMyBots && (
        <SurfaceCard className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow-label">Live bot activity</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Bots currently in action
              </h2>
            </div>
            <StatusPill
              label={`${activeBots.length} active`}
              tone="success"
              pulse
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {activeBots.slice(0, 8).map((activity) => (
              <Link
                key={activity.botId}
                to={`/bots/${activity.botId}`}
                className="surface-card-muted block transition-colors hover:border-accent/20"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                      AI
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">
                        {activity.botName}
                      </div>
                      <div className="text-xs text-slate-500">Live routing</div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-400">
                    {activity.activeGames.length > 0 && (
                      <div>
                        {activity.activeGames.length} live game
                        {activity.activeGames.length !== 1 ? "s" : ""}
                      </div>
                    )}
                    {activity.activeTournaments.length > 0 && (
                      <div>
                        {activity.activeTournaments.length} tournament seat
                        {activity.activeTournaments.length !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </SurfaceCard>
      )}

      {displayedBots.length === 0 ? (
        <EmptyState
          illustration="bot"
          title={
            showMyBots ? "No bots in your workspace yet" : "No bots available"
          }
          description={
            showMyBots
              ? "Build your first bot to start competing in tournaments."
              : "The platform has no bots to show right now."
          }
          action={
            user && showMyBots ? (
              <Button onClick={() => navigate("/bots/build")}>
                Build your first bot
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
          {displayedBots.map((bot, index) => {
            const isOwner = user && bot.userId === user.id;
            const botActivity = activeBots.find((a) => a.botId === bot.id);

            return (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <SurfaceCard className="h-full space-y-5">
                  <Link to={`/bots/${bot.id}`} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-xl font-semibold text-white">
                          {bot.name}
                        </h3>
                        {bot.description && (
                          <p className="mt-1 truncate text-sm text-slate-500">
                            {bot.description}
                          </p>
                        )}
                      </div>
                      <StatusPill
                        label={bot.active ? "active" : "paused"}
                        tone={bot.active ? "success" : "neutral"}
                        pulse={!!botActivity?.isActive}
                      />
                    </div>
                  </Link>

                  {bot.description && (
                    <p className="line-clamp-2 text-sm leading-6 text-slate-400">
                      {bot.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <SurfaceCard muted>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Status
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {bot.active ? "Active" : "Paused"}
                      </div>
                    </SurfaceCard>
                    <SurfaceCard muted>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Created
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {new Date(bot.createdAt).toLocaleDateString()}
                      </div>
                    </SurfaceCard>
                  </div>

                  {isOwner && (
                    <div className="flex flex-wrap gap-2 border-t border-white/6 pt-4">
                      {!bot.active ? (
                        <Button
                          variant="primary"
                          onClick={() => handleActivate(bot.id)}
                        >
                          Activate
                        </Button>
                      ) : (
                        <Button
                          variant="danger"
                          onClick={() => setConfirmDeleteBotId(bot.id)}
                        >
                          Deactivate
                        </Button>
                      )}
                    </div>
                  )}
                </SurfaceCard>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteBotId}
        title="Deactivate bot"
        description="This will remove the bot from active use until you reactivate it."
        confirmLabel="Deactivate bot"
        onClose={() => setConfirmDeleteBotId(null)}
        onConfirm={async () => {
          if (!confirmDeleteBotId) return;
          await handleDelete(confirmDeleteBotId);
          setConfirmDeleteBotId(null);
        }}
      />
    </PageShell>
  );
}
