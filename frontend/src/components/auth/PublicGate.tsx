import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
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
          <SignInBanner
            redirectTo={redirectTo}
            onDismiss={() => setDismissed(true)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function SignInBanner({
  redirectTo,
  onDismiss,
}: {
  redirectTo: string;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="fixed top-20 right-4 z-50 max-w-xs"
    >
      <SurfaceCard className="p-3 flex flex-col gap-3 shadow-2xl border-accent/20">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">
              Sign in for full access
            </p>
            <p className="text-xs text-slate-400">
              Create bots & join tournaments
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={onDismiss}
            className="text-slate-400 hover:text-white shrink-0 p-1"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
        <Button asLink={`/login?redirectTo=${redirectTo}`} className="w-full">
          Sign In
        </Button>
      </SurfaceCard>
    </motion.div>
  );
}

function XIcon({ className }: { className?: string }) {
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
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}
