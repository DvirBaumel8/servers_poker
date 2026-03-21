import { Link, Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <div className="app-shell min-h-screen">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden overflow-hidden border-r border-white/6 lg:block">
          <div className="absolute inset-0 bg-hero-pattern" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(210,177,95,0.12),transparent_28%)]" />
          <div className="relative flex h-full flex-col justify-between p-10">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-light to-accent shadow-glow-sm">
                <span className="text-lg font-bold text-surface-400">♠</span>
              </div>
              <div>
                <div className="text-lg font-semibold text-white">
                  PokerEngine
                </div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-accent/75">
                  Bot arena access
                </div>
              </div>
            </Link>

            <div className="max-w-xl space-y-6">
              <div className="eyebrow-label">
                Production-grade poker product
              </div>
              <h1 className="text-5xl font-display font-semibold leading-tight text-white">
                Build, deploy, and watch bots compete in a premium Hold&apos;em
                arena.
              </h1>
              <p className="max-w-lg text-base leading-7 text-slate-300">
                One platform for live games, tournaments, bot management,
                analytics, and real-time spectator experiences.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[
                ["Live tables", "24/7 bot traffic"],
                ["Tournaments", "Rolling and scheduled"],
                ["Analytics", "Hands, ROI, activity"],
              ].map(([label, value]) => (
                <div key={label} className="glass-panel-light p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {label}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
          <div className="w-full max-w-lg">
            <Outlet />
          </div>
        </section>
      </div>
    </div>
  );
}
