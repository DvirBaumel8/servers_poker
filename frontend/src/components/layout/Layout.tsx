import { useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuthStore } from "../../stores/authStore";
import { botsApi } from "../../api/bots";
import { Button } from "../ui/primitives";
import { ACTIVE_BOTS_POLL_MS } from "../../utils/timing";

const NAV_ITEMS = [
  { path: "/tables", label: "Tables", icon: "tables" },
  { path: "/tournaments", label: "Tournaments", icon: "tournaments" },
  { path: "/bots", label: "Bots", icon: "bots" },
  { path: "/leaderboard", label: "Leaderboard", icon: "leaderboard" },
] as const;

function NavIcon({ icon, className }: { icon: string; className?: string }) {
  const iconClass = className || "w-4 h-4";
  switch (icon) {
    case "tables":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <rect x="3" y="8" width="18" height="10" rx="2" />
          <path d="M7 8V6a2 2 0 012-2h6a2 2 0 012 2v2" />
          <circle cx="12" cy="13" r="2" />
        </svg>
      );
    case "tournaments":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M6 9H4a2 2 0 01-2-2V5a2 2 0 012-2h2" />
          <path d="M18 9h2a2 2 0 002-2V5a2 2 0 00-2-2h-2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
          <path d="M7 4h10v5a5 5 0 01-10 0V4z" />
        </svg>
      );
    case "bots":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M9 8V6a3 3 0 116 0v2" />
          <circle cx="9" cy="14" r="1.5" fill="currentColor" />
          <circle cx="15" cy="14" r="1.5" fill="currentColor" />
        </svg>
      );
    case "leaderboard":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 15l-2 5h4l-2-5z" />
          <circle cx="12" cy="8" r="6" />
          <path d="M12 5v6l3-3" />
        </svg>
      );
    case "manage":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 15V3m0 12l-4-4m4 4l4-4" />
          <path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" />
          <path d="M4 17h16" />
        </svg>
      );
    case "analytics":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M3 3v18h18" />
          <path d="M7 16l4-6 4 4 5-8" />
        </svg>
      );
    default:
      return null;
  }
}

const ACTIVE_BOTS_CACHE_KEY = "pokerengine_active_bots_count";

function getCachedBotsCount(): number {
  try {
    const cached = localStorage.getItem(ACTIVE_BOTS_CACHE_KEY);
    return cached ? parseInt(cached, 10) : 0;
  } catch {
    return 0;
  }
}

function setCachedBotsCount(count: number): void {
  try {
    localStorage.setItem(ACTIVE_BOTS_CACHE_KEY, String(count));
  } catch {
    // Ignore storage errors
  }
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const isAuthenticated = !!token; // Use token for auth check (immediately available from localStorage)
  const [activeBotsCount, setActiveBotsCount] = useState(getCachedBotsCount);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const loadActiveBots = async () => {
      try {
        const data = await botsApi.getActiveBots();
        setActiveBotsCount(data.totalActive);
        setCachedBotsCount(data.totalActive);
      } catch {
        // Keep the cached/current value on error, don't reset to 0
      }
    };

    loadActiveBots();
    const interval = setInterval(loadActiveBots, ACTIVE_BOTS_POLL_MS);
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
        <div className="page-shell flex flex-col gap-3 py-3 sm:gap-4 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <Link to="/" className="group flex items-center gap-2 sm:gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-light to-accent shadow-glow-sm sm:h-11 sm:w-11 sm:rounded-2xl">
                <span className="text-base font-bold text-surface-400 sm:text-lg">
                  ♠
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold tracking-tight text-white sm:text-lg">
                  PokerEngine
                </div>
                <div className="hidden text-[11px] uppercase tracking-[0.24em] text-accent/75 xs:block sm:text-[11px]">
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-white transition hover:bg-white/[0.06] sm:h-11 sm:w-11 sm:rounded-2xl lg:hidden"
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
                    <NavIcon
                      icon={item.icon}
                      className={isActive ? "w-4 h-4 opacity-80" : "w-4 h-4"}
                    />
                    {item.label}
                    {showBadge && (
                      <span className="ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-success px-1.5 text-[10px] font-bold text-surface-400">
                        {activeBotsCount > 9 ? "9+" : activeBotsCount}
                      </span>
                    )}
                  </Link>
                );
              })}
              {user?.role === "admin" && (
                <>
                  <Link
                    to="/admin/tournaments"
                    className={clsx(
                      "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                      location.pathname.startsWith("/admin/tournaments")
                        ? "bg-accent text-surface-400"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    <NavIcon
                      icon="manage"
                      className={
                        location.pathname.startsWith("/admin/tournaments")
                          ? "w-4 h-4 opacity-80"
                          : "w-4 h-4"
                      }
                    />
                    Manage
                  </Link>
                  <Link
                    to="/admin/analytics"
                    className={clsx(
                      "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                      location.pathname.startsWith("/admin/analytics")
                        ? "bg-accent text-surface-400"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    <NavIcon
                      icon="analytics"
                      className={
                        location.pathname.startsWith("/admin/analytics")
                          ? "w-4 h-4 opacity-80"
                          : "w-4 h-4"
                      }
                    />
                    Analytics
                  </Link>
                </>
              )}
            </nav>

            <div className="flex items-center gap-2 self-end lg:self-auto">
              {isAuthenticated ? (
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
                      {user?.username?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="hidden text-left sm:block">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Workspace
                      </div>
                      <div className="font-medium text-white">
                        {user?.username || "Loading..."}
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
                      <span className="flex items-center gap-2.5">
                        <NavIcon icon={item.icon} className="w-5 h-5" />
                        {item.label}
                      </span>
                      {showBadge && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1.5 text-[10px] font-bold text-surface-400">
                          {activeBotsCount > 9 ? "9+" : activeBotsCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
                {user?.role === "admin" && (
                  <>
                    <Link
                      to="/admin/tournaments"
                      className={clsx(
                        "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                        location.pathname.startsWith("/admin/tournaments")
                          ? "bg-accent text-surface-400"
                          : "border border-white/6 bg-white/[0.02] text-slate-300 hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <NavIcon icon="manage" className="w-5 h-5" />
                        Manage Tournaments
                      </span>
                    </Link>
                    <Link
                      to="/admin/analytics"
                      className={clsx(
                        "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                        location.pathname.startsWith("/admin/analytics")
                          ? "bg-accent text-surface-400"
                          : "border border-white/6 bg-white/[0.02] text-slate-300 hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <NavIcon icon="analytics" className="w-5 h-5" />
                        Analytics
                      </span>
                    </Link>
                  </>
                )}
              </nav>
              <div className="flex flex-wrap gap-2 pt-1">
                {isAuthenticated ? (
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
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <NavIcon icon="tables" className="w-3.5 h-3.5" />
              Tables
            </Link>
            <Link
              to="/tournaments"
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <NavIcon icon="tournaments" className="w-3.5 h-3.5" />
              Tournaments
            </Link>
            <Link
              to="/bots"
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <NavIcon icon="bots" className="w-3.5 h-3.5" />
              Bots
            </Link>
            <Link
              to="/leaderboard"
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <NavIcon icon="leaderboard" className="w-3.5 h-3.5" />
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
