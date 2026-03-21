import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export interface ActionEvent {
  id: string;
  playerName: string;
  action: string;
  amount?: number;
  timestamp: number;
}

interface ActionFeedProps {
  actions: ActionEvent[];
  maxVisible?: number;
}

export function ActionFeed({ actions, maxVisible = 4 }: ActionFeedProps) {
  const visibleActions = actions.slice(-maxVisible);

  return (
    <div className="fixed right-4 top-24 z-40 hidden w-72 space-y-2 xl:block">
      <div className="mb-2 rounded-2xl border border-white/8 bg-black/30 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-slate-500 backdrop-blur-md">
        Table activity
      </div>
      <AnimatePresence mode="popLayout">
        {visibleActions.map((action) => (
          <ActionItem key={action.id} action={action} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ActionItem({ action }: { action: ActionEvent }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  const actionConfig = getActionConfig(action.action);

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.8 }}
      className="rounded-2xl border border-white/8 bg-black/45 p-3 shadow-panel backdrop-blur-md"
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 ${actionConfig.surface}`}
        >
          {actionConfig.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium text-white">
            {action.playerName}
          </div>
          <div className={`text-xs font-semibold ${actionConfig.color}`}>
            {formatAction(action.action, action.amount)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function getActionConfig(action: string): {
  icon: string;
  color: string;
  surface: string;
} {
  const configs: Record<
    string,
    { icon: string; color: string; surface: string }
  > = {
    fold: {
      icon: "F",
      color: "text-slate-300",
      surface: "bg-white/[0.04] text-slate-300",
    },
    check: {
      icon: "C",
      color: "text-blue-300",
      surface: "bg-info-muted text-info",
    },
    call: {
      icon: "CL",
      color: "text-emerald-300",
      surface: "bg-success-muted text-success",
    },
    bet: {
      icon: "B",
      color: "text-yellow-200",
      surface: "bg-warning-muted text-warning",
    },
    raise: {
      icon: "R",
      color: "text-orange-300",
      surface: "bg-orange-500/15 text-orange-300",
    },
    all_in: {
      icon: "AI",
      color: "text-red-300",
      surface: "bg-danger-muted text-danger",
    },
    allin: {
      icon: "AI",
      color: "text-red-300",
      surface: "bg-danger-muted text-danger",
    },
  };

  return (
    configs[action.toLowerCase()] || {
      icon: "•",
      color: "text-white",
      surface: "bg-white/[0.04] text-white",
    }
  );
}

function formatAction(action: string, amount?: number): string {
  const actionUpper = action.toUpperCase();
  if (amount && amount > 0) {
    return `${actionUpper} ${formatAmount(amount)}`;
  }
  return actionUpper;
}

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 10000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString();
}

export function useActionFeed() {
  const [actions, setActions] = useState<ActionEvent[]>([]);

  const addAction = (playerName: string, action: string, amount?: number) => {
    const newAction: ActionEvent = {
      id: `${Date.now()}-${Math.random()}`,
      playerName,
      action,
      amount,
      timestamp: Date.now(),
    };
    setActions((prev) => [...prev.slice(-10), newAction]);
  };

  const clearActions = () => setActions([]);

  return { actions, addAction, clearActions };
}
