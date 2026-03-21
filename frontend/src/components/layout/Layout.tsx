import { useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuthStore } from "../../stores/authStore";
import { botsApi } from "../../api/bots";
import { Button } from "../ui/primitives";

const NAV_ITEMS = [
  { path: "/tables", label: "Tables" },
  { path: "/tournaments", label: "Tournaments" },
  { path: "/bots", label: "Bots" },
  { path: "/leaderboard", label: "Leaderboard" },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [activeBotsCount, setActiveBotsCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const loadActiveBots = async () => {
      try {
        const data = await botsApi.getActiveBots();
        setActiveBotsCount(data.totalActive);
      } catch {
        setActiveBotsCount(0);
      }
    };

    loadActiveBots();
    const interval = setInterval(loadActiveBots, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-50 border-b border-white/6 bg-surface-400/80 backdrop-blur-xl">
        <div className="page-shell flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="group flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-light to-accent shadow-glow-sm">
                <span className="text-lg font-bold text-surface-400">♠</span>
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight text-white">
                  PokerEngine
                </div>
                <div className="max-w-[11rem] text-[11px] uppercase tracking-[0.24em] text-accent/75 sm:max-w-none">
                  Bot Arena Workspace
                </div>
              </div>
            </Link>
            <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400 lg:flex">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              {activeBotsCount} active bots
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-white transition hover:bg-white/[0.06] lg:hidden"
              aria-label={
                mobileMenuOpen
                  ? "Close navigation menu"
                  : "Open navigation menu"
              }
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>

          <div className="hidden flex-col gap-3 lg:flex lg:flex-row lg:items-center">
            <nav className="flex overflow-x-auto rounded-2xl border border-white/6 bg-white/[0.03] p-1.5">
              {NAV_ITEMS.map((item) => {
                const isActive = location.pathname.startsWith(item.path);
                const showBadge = item.path === "/bots" && activeBotsCount > 0;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={clsx(
                      "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                      isActive
                        ? "bg-accent text-surface-400"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    {item.label}
                    {showBadge && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1.5 text-[10px] font-bold text-surface-400">
                        {activeBotsCount > 9 ? "9+" : activeBotsCount}
                      </span>
                    )}
                  </Link>
                );
              })}
              {user?.role === "admin" && (
                <Link
                  to="/admin/analytics"
                  className={clsx(
                    "whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                    location.pathname.startsWith("/admin/analytics")
                      ? "bg-accent text-surface-400"
                      : "text-slate-400 hover:bg-white/[0.04] hover:text-white",
                  )}
                >
                  Analytics
                </Link>
              )}
            </nav>

            <div className="flex items-center gap-2 self-end lg:self-auto">
              {user ? (
                <>
                  <Link
                    to="/profile"
                    className={clsx(
                      "flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm transition-all",
                      location.pathname.startsWith("/profile")
                        ? "border-accent/30 bg-accent/10 text-white"
                        : "border-white/8 bg-white/[0.03] text-slate-300 hover:border-white/12 hover:text-white",
                    )}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent-light to-accent text-xs font-bold text-surface-400">
                      {user.username?.charAt(0).toUpperCase()}
                    </div>
                    <div className="hidden text-left sm:block">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Workspace
                      </div>
                      <div className="font-medium text-white">
                        {user.username}
                      </div>
                    </div>
                  </Link>
                  <Button variant="ghost" onClick={handleLogout}>
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" asLink="/login">
                    Sign In
                  </Button>
                  <Button asLink="/register">Create Account</Button>
                </>
              )}
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="space-y-3 rounded-3xl border border-white/8 bg-white/[0.03] p-3 lg:hidden">
              <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                {activeBotsCount} active bots
              </div>
              <nav className="grid gap-2">
                {NAV_ITEMS.map((item) => {
                  const isActive = location.pathname.startsWith(item.path);
                  const showBadge =
                    item.path === "/bots" && activeBotsCount > 0;

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={clsx(
                        "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                        isActive
                          ? "bg-accent text-surface-400"
                          : "border border-white/6 bg-white/[0.02] text-slate-300 hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      <span>{item.label}</span>
                      {showBadge && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1.5 text-[10px] font-bold text-surface-400">
                          {activeBotsCount > 9 ? "9+" : activeBotsCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
                {user?.role === "admin" && (
                  <Link
                    to="/admin/analytics"
                    className={clsx(
                      "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                      location.pathname.startsWith("/admin/analytics")
                        ? "bg-accent text-surface-400"
                        : "border border-white/6 bg-white/[0.02] text-slate-300 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    Analytics
                  </Link>
                )}
              </nav>
              <div className="flex flex-wrap gap-2 pt-1">
                {user ? (
                  <>
                    <Button
                      variant="ghost"
                      asLink="/profile"
                      className="flex-1"
                    >
                      Profile
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleLogout}
                      className="flex-1"
                    >
                      Logout
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" asLink="/login" className="flex-1">
                      Sign In
                    </Button>
                    <Button asLink="/register" className="flex-1">
                      Create Account
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="pb-12">
        <Outlet />
      </main>

      <footer className="border-t border-white/6 bg-black/10">
        <div className="page-shell flex flex-col gap-6 py-8 text-sm text-slate-500 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-accent text-lg">♠</span>
            <span>
              PokerEngine workspace for live bot competition, analytics, and
              tournaments.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Link
              to="/tables"
              className="hover:text-slate-300 transition-colors"
            >
              Tables
            </Link>
            <Link
              to="/tournaments"
              className="hover:text-slate-300 transition-colors"
            >
              Tournaments
            </Link>
            <Link to="/bots" className="hover:text-slate-300 transition-colors">
              Bots
            </Link>
            <Link
              to="/leaderboard"
              className="hover:text-slate-300 transition-colors"
            >
              Leaderboard
            </Link>
            <div className="text-slate-600">
              Built for real-time spectator poker.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
    >
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
    >
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
