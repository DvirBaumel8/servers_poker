import { Outlet, Link, useLocation } from "react-router-dom";
import clsx from "clsx";

const NAV_ITEMS = [
  { path: "/", label: "Home" },
  { path: "/tournaments", label: "Tournaments" },
  { path: "/bots", label: "Bots" },
  { path: "/leaderboard", label: "Leaderboard" },
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-poker-black">
      <header className="bg-gray-900/50 backdrop-blur-sm border-b border-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3">
              <span className="text-3xl">♠</span>
              <span className="text-xl font-bold text-white">
                Poker Platform
              </span>
            </Link>

            <nav className="flex items-center gap-6">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    "text-sm font-medium transition-colors",
                    location.pathname === item.path
                      ? "text-poker-gold"
                      : "text-gray-400 hover:text-white"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-gray-800 py-6 mt-auto">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          Poker Tournament Platform - Zero Bug Approach
        </div>
      </footer>
    </div>
  );
}
