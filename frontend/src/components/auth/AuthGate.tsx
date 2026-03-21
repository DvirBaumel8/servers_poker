import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "../../stores/authStore";
import { Button, SurfaceCard } from "../ui/primitives";
import { normalizeRedirectPath } from "../../utils/navigation";

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const token = useAuthStore((state) => state.token);
  const location = useLocation();

  if (token) {
    return <>{children}</>;
  }

  const redirectTo = encodeURIComponent(
    normalizeRedirectPath(location.pathname + location.search),
  );

  return (
    <div className="relative min-h-screen">
      <PreviewBackdrop />
      <SignInOverlay redirectTo={redirectTo} />
    </div>
  );
}

function PreviewBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none px-6 py-10 opacity-60 blur-sm"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="h-24 rounded-[2rem] border border-white/8 bg-white/[0.04]" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-28 rounded-[2rem] border border-white/8 bg-white/[0.03]" />
          <div className="h-28 rounded-[2rem] border border-white/8 bg-white/[0.03]" />
          <div className="h-28 rounded-[2rem] border border-white/8 bg-white/[0.03]" />
        </div>
        <div className="h-[28rem] rounded-[2rem] border border-white/8 bg-white/[0.03]" />
      </div>
    </div>
  );
}

function SignInOverlay({ redirectTo }: { redirectTo: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-md mx-4"
      >
        <SurfaceCard className="space-y-6 p-8 text-center">
          <div className="space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <LockIcon className="h-7 w-7 text-accent" />
            </div>
            <h2 className="text-2xl font-display font-semibold text-white">
              Sign in to continue
            </h2>
            <p className="text-sm leading-6 text-slate-400">
              Create an account or sign in to view live games, track
              tournaments, manage your bots, and access the full platform.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button asLink={`/login?redirectTo=${redirectTo}`}>Sign In</Button>
            <Button
              variant="secondary"
              asLink={`/register?redirectTo=${redirectTo}`}
            >
              Create Account
            </Button>
          </div>

          <p className="text-xs text-slate-500">
            Already have an account?{" "}
            <Link
              to={`/login?redirectTo=${redirectTo}`}
              className="text-accent hover:text-accent-light underline underline-offset-2"
            >
              Sign in here
            </Link>
          </p>
        </SurfaceCard>
      </motion.div>
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}
