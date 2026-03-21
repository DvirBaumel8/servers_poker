import { Link, Outlet } from "react-router-dom";
import { Button } from "../ui/primitives";

export function MarketingLayout() {
  return (
    <div className="app-shell">
      <header className="sticky top-0 z-40 border-b border-white/6 bg-surface-400/75 backdrop-blur-xl">
        <div className="page-shell flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-light to-accent shadow-glow-sm">
              <span className="text-lg font-bold text-surface-400">♠</span>
            </div>
            <div>
              <div className="text-lg font-semibold text-white">
                PokerEngine
              </div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-accent/75">
                Production bot arena
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asLink="/login">
              Sign In
            </Button>
            <Button asLink="/register">Launch Workspace</Button>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
