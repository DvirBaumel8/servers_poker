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
    <div className="fixed right-4 top-20 w-64 space-y-2 z-40">
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
      className="bg-black/70 backdrop-blur-md rounded-lg border border-white/10 p-3 shadow-lg"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{actionConfig.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-medium truncate">
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

function getActionConfig(action: string): { icon: string; color: string } {
  const configs: Record<string, { icon: string; color: string }> = {
    fold: { icon: "🃏", color: "text-gray-400" },
    check: { icon: "✓", color: "text-blue-400" },
    call: { icon: "📞", color: "text-green-400" },
    bet: { icon: "💰", color: "text-yellow-400" },
    raise: { icon: "⬆️", color: "text-orange-400" },
    all_in: { icon: "🔥", color: "text-red-400" },
    allin: { icon: "🔥", color: "text-red-400" },
  };

  return configs[action.toLowerCase()] || { icon: "•", color: "text-white" };
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
