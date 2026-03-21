import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { analyticsApi, PlatformStats } from "../api";
import { usePageTracking } from "../utils/analytics";

const FEATURES = [
  {
    icon: "🤖",
    title: "Build Your Bot",
    desc: "Create intelligent poker bots with our simple HTTP API. One endpoint, infinite strategies.",
    color: "from-blue-500/20 to-blue-600/5",
    border: "border-blue-500/20",
  },
  {
    icon: "🏆",
    title: "Compete Live",
    desc: "Enter rolling and scheduled tournaments. Watch your bots battle in real-time.",
    color: "from-accent/20 to-accent/5",
    border: "border-accent/20",
  },
  {
    icon: "📊",
    title: "Analyze & Improve",
    desc: "Detailed hand histories, win rates, and provably fair verification for every hand.",
    color: "from-emerald-500/20 to-emerald-600/5",
    border: "border-emerald-500/20",
  },
];

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M+`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K+`;
  }
  return num.toString();
}

interface StatItem {
  value: string;
  label: string;
}

const STEPS = [
  {
    step: "01",
    title: "Create a Bot Server",
    desc: "Build an HTTP server that responds to POST /action with your poker decision.",
    code: "return { type: 'raise', amount: 100 };",
  },
  {
    step: "02",
    title: "Register & Connect",
    desc: "Sign up, register your bot endpoint, and join a table or tournament.",
    code: 'curl -X POST /api/v1/bots -d \'{"name":"MyBot"}\'',
  },
  {
    step: "03",
    title: "Watch & Win",
    desc: "Spectate your bot playing live. Analyze results and refine your strategy.",
    code: "GET /api/v1/games/:id/state",
  },
];

export function Home() {
  usePageTracking();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    analyticsApi
      .getPlatformStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const displayStats: StatItem[] = stats
    ? [
        {
          value: formatNumber(stats.lifetime.totalHandsDealt),
          label: "Hands Dealt",
        },
        { value: formatNumber(stats.lifetime.totalBots), label: "Total Bots" },
        {
          value: formatNumber(stats.lifetime.totalTournaments),
          label: "Tournaments",
        },
        { value: `${stats.live.activeGames}`, label: "Live Games" },
      ]
    : [
        { value: "—", label: "Hands Dealt" },
        { value: "—", label: "Total Bots" },
        { value: "—", label: "Tournaments" },
        { value: "—", label: "Live Games" },
      ];

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-pattern" />
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full opacity-[0.03]"
            style={{
              background:
                "radial-gradient(circle, rgba(201,162,39,1) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute -bottom-1/2 -left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.02]"
            style={{
              background:
                "radial-gradient(circle, rgba(16,185,129,1) 0%, transparent 70%)",
            }}
          />
        </div>

        <div className="relative container mx-auto px-6 pt-20 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-8">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-medium text-accent">
                Live Games Running Now
              </span>
            </div>

            <h1 className="text-5xl md:text-6xl font-display font-bold text-white mb-6 leading-tight">
              Where Bots Play{" "}
              <span className="gold-gradient-text">No-Limit Hold'em</span>
            </h1>

            <p className="text-lg text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed">
              Build an HTTP bot, register it, and watch it compete against other
              developers' bots in real-time poker tournaments.
            </p>

            <div className="flex items-center justify-center gap-4">
              <Link
                to="/register"
                className="btn-primary text-base px-8 py-3.5"
              >
                Start Building
              </Link>
              <Link
                to="/tables"
                className="btn-secondary text-base px-8 py-3.5"
              >
                Watch Live
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative border-y border-white/5 bg-surface-300/50">
        <div className="container mx-auto px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {displayStats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i }}
                className="text-center"
              >
                <div className="text-2xl md:text-3xl font-bold gold-gradient-text">
                  {isLoading ? (
                    <span className="inline-block w-16 h-8 bg-surface-400 animate-pulse rounded" />
                  ) : (
                    stat.value
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-6 py-20">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl font-display font-bold text-white mb-3">
            How It Works
          </h2>
          <p className="text-gray-500 max-w-md mx-auto">
            Three steps from zero to competing in live poker tournaments.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {FEATURES.map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i + 0.4 }}
              className={`glass-panel p-8 border ${feat.border} hover:border-accent/30 transition-all duration-300 group`}
            >
              <div
                className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feat.color} flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform`}
              >
                {feat.icon}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {feat.title}
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                {feat.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Steps */}
      <section className="container mx-auto px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-6">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 * i + 0.6 }}
                className="glass-panel p-6 flex items-start gap-6 group hover:border-accent/20 transition-all duration-300"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-accent">
                    {step.step}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-semibold mb-1">
                    {step.title}
                  </h4>
                  <p className="text-sm text-gray-400 mb-3">{step.desc}</p>
                  <code className="text-xs font-mono text-accent/80 bg-surface-400 px-3 py-1.5 rounded-lg border border-white/5 inline-block">
                    {step.code}
                  </code>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 pb-20">
        <div className="max-w-3xl mx-auto glass-panel p-12 text-center border-accent/10">
          <h2 className="text-3xl font-display font-bold text-white mb-4">
            Ready to Build Your Bot?
          </h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            Join the arena in under 5 minutes. All you need is an HTTP server
            that returns a JSON action.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to="/register" className="btn-primary text-base px-8 py-3.5">
              Create Account
            </Link>
            <Link to="/bots" className="btn-secondary text-base px-8 py-3.5">
              View Bots
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
