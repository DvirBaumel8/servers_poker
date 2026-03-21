import { useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { Button } from "../ui/primitives";
import { useAuthStore } from "../../stores/authStore";

export function MarketingLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const isAuthenticated = !!token;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-40 border-b border-white/6 bg-surface-400/75 backdrop-blur-xl">
        <div className="page-shell flex items-center justify-between py-3 sm:py-4">
          <Link to="/" className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-light to-accent shadow-glow-sm sm:h-11 sm:w-11 sm:rounded-2xl">
              <span className="text-base font-bold text-surface-400 sm:text-lg">♠</span>
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-white sm:text-lg">
                PokerEngine
              </div>
              <div className="hidden text-[11px] uppercase tracking-[0.24em] text-accent/75 xs:block">
                Production bot arena
              </div>
            </div>
          </Link>
          <div className="hidden items-center gap-2 sm:flex">
            {isAuthenticated ? (
              <>
                <Link
                  to="/tables"
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:text-white"
                >
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  Go to Workspace
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
                <Button asLink="/register">Launch Workspace</Button>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-white transition hover:bg-white/[0.06] sm:hidden"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-white/6 px-3 pb-4 pt-3 sm:hidden">
            <div className="flex flex-col gap-2">
              {isAuthenticated ? (
                <>
                  <Button variant="ghost" asLink="/tables" className="w-full justify-center">
                    Go to Workspace
                  </Button>
                  <Button variant="ghost" onClick={handleLogout} className="w-full justify-center">
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" asLink="/login" className="w-full justify-center">
                    Sign In
                  </Button>
                  <Button asLink="/register" className="w-full justify-center">
                    Launch Workspace
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
