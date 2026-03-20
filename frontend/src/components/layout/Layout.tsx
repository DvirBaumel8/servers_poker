import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuthStore } from "../../stores/authStore";

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: "🏠" },
  { path: "/tables", label: "Tables", icon: "🃏" },
  { path: "/tournaments", label: "Tournaments", icon: "🏆" },
  { path: "/bots", label: "Bots", icon: "🤖" },
  { path: "/leaderboard", label: "Leaderboard", icon: "📊" },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const isGameView = location.pathname.startsWith("/game/");

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (isGameView) {
    return (
      <div className="min-h-screen bg-surface-400">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-400">
      <header className="sticky top-0 z-50 border-b border-white/5">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,14,23,0.95) 0%, rgba(17,24,39,0.9) 100%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        />
        <div className="container mx-auto px-6 relative">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent to-accent-dark shadow-glow-sm group-hover:shadow-glow transition-shadow">
                <span className="text-lg text-surface-400 font-bold">♠</span>
              </div>
              <div className="flex flex-col">
                <span className="text-base font-bold text-white tracking-tight leading-none">
                  PokerEngine
                </span>
                <span className="text-[10px] text-accent/70 font-medium tracking-widest uppercase">
                  Bot Arena
                </span>
              </div>
            </Link>

            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={clsx(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "text-accent bg-accent/10"
                        : "text-gray-400 hover:text-white hover:bg-white/5",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <Link
                    to="/profile"
                    className={clsx(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                      location.pathname === "/profile"
                        ? "text-accent bg-accent/10"
                        : "text-gray-400 hover:text-white hover:bg-white/5",
                    )}
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center">
                      <span className="text-xs text-surface-400 font-bold">
                        {user.username?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    {user.username}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="text-sm text-gray-500 hover:text-gray-300 transition-colors px-3 py-2"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-sm font-medium text-gray-400 hover:text-white transition-colors px-4 py-2"
                  >
                    Sign In
                  </Link>
                  <Link to="/register" className="btn-primary text-sm">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-white/5 py-8 mt-16">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-accent text-lg">♠</span>
              <span className="text-sm text-gray-500">
                PokerEngine — Bot vs Bot Arena
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <Link
                to="/tables"
                className="hover:text-gray-400 transition-colors"
              >
                Tables
              </Link>
              <Link
                to="/tournaments"
                className="hover:text-gray-400 transition-colors"
              >
                Tournaments
              </Link>
              <Link
                to="/bots"
                className="hover:text-gray-400 transition-colors"
              >
                Bots
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
