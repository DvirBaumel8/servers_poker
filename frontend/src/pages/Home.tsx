import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { analyticsApi, PlatformStats } from "../api";
import { usePageTracking } from "../hooks/usePageTracking";
import { Button, MetricCard, SurfaceCard } from "../components/ui/primitives";

const FEATURE_BLOCKS = [
  {
    title: "Live bot arena",
    description:
      "Spectate real-time cash tables and tournaments with premium gameplay presentation, status signals, and event-driven updates.",
  },
  {
    title: "One bot workspace",
    description:
      "Create bots, validate endpoints, register for tournaments, and monitor activity from a single operator-style product shell.",
  },
  {
    title: "Strategy analytics",
    description:
      "Measure performance through tournament results, hands played, live metrics, and platform-wide analytics surfaces.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Implement an action endpoint",
    description:
      "Run an HTTP service that accepts state and returns a legal poker decision.",
    code: "return { type: 'raise', amount: 100 };",
  },
  {
    step: "02",
    title: "Register and validate the bot",
    description:
      "Connect your endpoint, run validation, and activate your bot for live competition.",
    code: 'POST /api/v1/bots { "name": "RiverPilot" }',
  },
  {
    step: "03",
    title: "Deploy into live traffic",
    description:
      "Enter tournaments, watch the table, and iterate based on live and historical performance.",
    code: "GET /api/v1/games/:id/state",
  },
];

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M+`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K+`;
  return num.toString();
}

export function Home() {
  usePageTracking();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    analyticsApi
      .getPlatformStats()
      .then(setStats)
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, []);

  const statCards = [
    {
      label: "Hands dealt",
      value: stats ? formatNumber(stats.lifetime.totalHandsDealt) : "—",
      hint: "Validated across lifetime gameplay",
    },
    {
      label: "Registered bots",
      value: stats ? formatNumber(stats.lifetime.totalBots) : "—",
      hint: "Competitive field across all accounts",
    },
    {
      label: "Tournaments",
      value: stats ? formatNumber(stats.lifetime.totalTournaments) : "—",
      hint: "Rolling and scheduled formats",
    },
    {
      label: "Live tables",
      value: stats ? stats.live.activeGames : "—",
      hint: "Currently streaming in the arena",
    },
  ];

  return (
    <div className="overflow-hidden">
      <section className="border-b border-white/6">
        <div className="page-shell grid gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="space-y-4">
              <div className="eyebrow-label">
                A premium bot-vs-bot poker platform
              </div>
              <h1 className="max-w-4xl text-3xl font-display font-semibold leading-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
                The production workspace for{" "}
                <span className="gold-gradient-text">
                  No-Limit Hold&apos;em automation
                </span>
                .
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
                Build bots, ship them into live tournaments, monitor active
                tables, and review performance inside a product designed for
                serious poker operators.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asLink="/register" className="px-7 py-3.5 text-base">
                Create workspace
              </Button>
              <Button
                variant="secondary"
                asLink="/tables"
                className="px-7 py-3.5 text-base"
              >
                Watch live tables
              </Button>
            </div>

            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_BLOCKS.map((feature) => (
                <SurfaceCard
                  key={feature.title}
                  muted
                  className="space-y-2 sm:space-y-3"
                >
                  <div className="text-sm font-semibold text-white">
                    {feature.title}
                  </div>
                  <p className="text-xs leading-5 text-slate-400 sm:text-sm sm:leading-6">
                    {feature.description}
                  </p>
                </SurfaceCard>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="glass-panel relative overflow-hidden p-6"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(210,177,95,0.12),transparent_32%)]" />
            <div className="relative space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Live arena
                  </div>
                  <div className="mt-1 text-xl font-semibold text-white">
                    Prime tournament hour
                  </div>
                </div>
                <div className="status-running">Running</div>
              </div>
              <div className="rounded-[2rem] border border-amber-700/20 bg-felt-gradient p-5 shadow-table">
                <div className="rounded-[2rem] border border-white/6 bg-black/10 p-4">
                  <div className="mb-6 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-amber-100/55">
                    <span>Final table stream</span>
                    <span>Level 18</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-3 sm:gap-3">
                    {[
                      ["Players", "9 / 9"],
                      ["Pot", "14.2K"],
                      ["Blinds", "1K / 2K"],
                      ["Active bot", "RiverPilot"],
                      ["Action", "Raise"],
                      ["Clock", "08.4s"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl bg-black/25 px-2 py-3 text-slate-200 sm:rounded-2xl sm:px-3 sm:py-4"
                      >
                        <div className="text-[10px] uppercase tracking-[0.15em] text-slate-400 sm:text-[11px] sm:tracking-[0.2em]">
                          {label}
                        </div>
                        <div className="mt-1 text-base font-semibold text-white sm:mt-2 sm:text-lg">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <SurfaceCard muted>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Current focus
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    Tournament operations
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    Late registration, stack visibility, and live state
                    tracking.
                  </div>
                </SurfaceCard>
                <SurfaceCard muted>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Workflow
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    Bot lifecycle
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    Register, validate, activate, observe, and iterate faster.
                  </div>
                </SurfaceCard>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="page-shell py-8 sm:py-10">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * index }}
            >
              <MetricCard
                label={stat.label}
                value={
                  isLoading ? (
                    <span className="inline-block h-9 w-24 animate-pulse rounded-xl bg-white/6" />
                  ) : (
                    stat.value
                  )
                }
                hint={stat.hint}
                accent
              />
            </motion.div>
          ))}
        </div>
      </section>

      <section className="page-shell py-8 sm:py-10">
        <div className="mb-8 max-w-2xl space-y-3 sm:mb-10">
          <div className="eyebrow-label">How the platform works</div>
          <h2 className="section-title">
            From API endpoint to live poker seat in three moves.
          </h2>
          <p className="section-subtitle">
            The workflow is deliberately short: connect a bot, deploy it, and
            watch the results through real product surfaces instead of a toy
            demo.
          </p>
        </div>

        <div className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index }}
            >
              <SurfaceCard className="h-full space-y-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-sm font-bold text-accent">
                  {step.step}
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-6 text-slate-400">
                    {step.description}
                  </p>
                </div>
                <code className="block rounded-2xl border border-white/8 bg-surface-400 px-4 py-3 font-mono text-xs text-accent/90">
                  {step.code}
                </code>
              </SurfaceCard>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="page-shell pb-16 pt-8">
        <SurfaceCard className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="eyebrow-label">Ready to launch</div>
            <h2 className="text-3xl font-display font-semibold text-white">
              Turn the bot arena into your live test bench.
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-400">
              Set up the account, register a bot, and move directly into live
              tables, tournaments, and analytics without switching tools.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asLink="/register">Create account</Button>
            <Button variant="secondary" asLink="/tournaments">
              Explore tournaments
            </Button>
          </div>
        </SurfaceCard>
      </section>
    </div>
  );
}
