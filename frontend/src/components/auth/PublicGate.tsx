import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { Button, SurfaceCard } from "../ui/primitives";
import { normalizeRedirectPath } from "../../utils/navigation";

interface PublicGateProps {
  children: ReactNode;
  showBanner?: boolean;
}

/**
 * PublicGate allows public viewing of content with an optional sign-in banner.
 * Unlike AuthGate, it doesn't block access - just encourages sign-in.
 */
export function PublicGate({ children, showBanner = true }: PublicGateProps) {
  const token = useAuthStore((state) => state.token);
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();

  const redirectTo = encodeURIComponent(
    normalizeRedirectPath(location.pathname + location.search),
  );

  return (
    <>
      {children}
      <AnimatePresence>
        {!token && showBanner && !dismissed && (
          <SignInBanner redirectTo={redirectTo} onDismiss={() => setDismissed(true)} />
        )}
      </AnimatePresence>
    </>
  );
}

function SignInBanner({ redirectTo, onDismiss }: { redirectTo: string; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg mx-4"
    >
      <SurfaceCard className="p-4 flex items-center gap-4 shadow-2xl border-accent/20">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            Sign in to access full features
          </p>
          <p className="text-xs text-slate-400 truncate">
            Create bots, join tournaments, and track your progress
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="text-slate-400 hover:text-white"
          >
            <XIcon className="h-4 w-4" />
          </Button>
          <Button asLink={`/login?redirectTo=${redirectTo}`} size="sm">
            Sign In
          </Button>
        </div>
      </SurfaceCard>
    </motion.div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
