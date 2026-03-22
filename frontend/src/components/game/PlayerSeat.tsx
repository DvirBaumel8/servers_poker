import { memo, useEffect, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { PlayingCard } from "../common/PlayingCard";
import type { Player, Card } from "../../types";

interface PlayerSeatProps {
  player: Player;
  isDealer?: boolean;
  isActive?: boolean;
  showCards?: boolean;
  seatIndex?: number;
  className?: string;
  lastAction?: {
    type: string;
    amount?: number;
    timestamp: number;
  };
  turnTimeoutMs?: number;
  turnStartTime?: number;
}

const AVATAR_COLORS = [
  { bg: "from-amber-500 to-orange-600", ring: "ring-amber-400/50" },
  { bg: "from-sky-500 to-blue-600", ring: "ring-sky-400/50" },
  { bg: "from-violet-500 to-purple-600", ring: "ring-violet-400/50" },
  { bg: "from-emerald-500 to-green-600", ring: "ring-emerald-400/50" },
  { bg: "from-rose-500 to-pink-600", ring: "ring-rose-400/50" },
  { bg: "from-cyan-500 to-teal-600", ring: "ring-cyan-400/50" },
  { bg: "from-red-500 to-red-700", ring: "ring-red-400/50" },
  { bg: "from-indigo-500 to-indigo-700", ring: "ring-indigo-400/50" },
  { bg: "from-yellow-400 to-amber-600", ring: "ring-yellow-400/50" },
];

const BOT_TYPE_STYLES: Record<
  string,
  { bg: string; ring: string; icon: string }
> = {
  random: {
    bg: "from-gray-500 to-slate-600",
    ring: "ring-gray-400/50",
    icon: "🎲",
  },
  smart: {
    bg: "from-blue-500 to-indigo-600",
    ring: "ring-blue-400/50",
    icon: "🧠",
  },
  folder: {
    bg: "from-red-400 to-rose-600",
    ring: "ring-red-400/50",
    icon: "📁",
  },
  aggressive: {
    bg: "from-orange-500 to-red-600",
    ring: "ring-orange-400/50",
    icon: "🔥",
  },
  tight: {
    bg: "from-cyan-500 to-blue-600",
    ring: "ring-cyan-400/50",
    icon: "🎯",
  },
  caller: {
    bg: "from-green-500 to-emerald-600",
    ring: "ring-green-400/50",
    icon: "📞",
  },
};

function getBotTypeFromName(name: string): string | null {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("random")) return "random";
  if (lowerName.includes("smart")) return "smart";
  if (lowerName.includes("folder")) return "folder";
  if (lowerName.includes("aggressive")) return "aggressive";
  if (lowerName.includes("tight")) return "tight";
  if (lowerName.includes("caller")) return "caller";
  return null;
}

export const PlayerSeat = memo(function PlayerSeat({
  player,
  isDealer = false,
  isActive = false,
  showCards = false,
  seatIndex = 0,
  className,
  lastAction,
  turnTimeoutMs = 10000,
  turnStartTime,
}: PlayerSeatProps) {
  const isFolded = player.folded;
  const isAllIn = player.allIn;
  const isDisconnected = player.disconnected;
  const botType = getBotTypeFromName(player.name || "");
  const botTypeStyle = botType ? BOT_TYPE_STYLES[botType] : null;
  const colors =
    botTypeStyle || AVATAR_COLORS[seatIndex % AVATAR_COLORS.length];
  const initial =
    botTypeStyle?.icon || (player.name || "B").charAt(0).toUpperCase();

  const actionToShow = lastAction || player.lastAction;
  const isRecentAction =
    actionToShow && Date.now() - actionToShow.timestamp < 5000;

  const [timeRemaining, setTimeRemaining] = useState(turnTimeoutMs);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!isActive || !turnStartTime) {
      setTimeRemaining(turnTimeoutMs);
      setProgress(100);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Date.now() - turnStartTime;
      const remaining = Math.max(0, turnTimeoutMs - elapsed);
      setTimeRemaining(remaining);
      setProgress((remaining / turnTimeoutMs) * 100);
    }, 50);
    return () => clearInterval(interval);
  }, [isActive, turnStartTime, turnTimeoutMs]);

  return (
    <motion.div
      animate={{ scale: isActive ? 1.05 : 1 }}
      className={clsx(
        "player-seat relative flex flex-col items-center",
        isFolded && "opacity-40",
        isDisconnected && "opacity-20 grayscale",
        className,
      )}
    >
      {isActive && (
        <motion.div
          className="absolute -inset-4 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(201,162,39,0.35) 0%, transparent 70%)",
          }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      <div className="relative">
        {/* Timer ring */}
        {isActive && (
          <div className="absolute -inset-1 z-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
              <circle
                cx="28"
                cy="28"
                r="25"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="3"
              />
              <circle
                cx="28"
                cy="28"
                r="25"
                fill="none"
                stroke={
                  progress > 30
                    ? "#22c55e"
                    : progress > 10
                      ? "#eab308"
                      : "#ef4444"
                }
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(progress / 100) * 157} 157`}
                className="transition-all duration-100"
              />
            </svg>
          </div>
        )}

        {/* Avatar */}
        <div
          className={clsx(
            "w-12 h-12 rounded-full flex items-center justify-center relative z-10",
            "bg-gradient-to-br shadow-lg border-2",
            colors.bg,
            isActive
              ? "border-yellow-400 ring-2 " + colors.ring
              : "border-white/20",
          )}
        >
          <span className="text-white font-bold text-base drop-shadow">
            {initial}
          </span>
        </div>

        {/* Dealer button - positioned on left when folded to avoid overlap */}
        {isDealer && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={clsx(
              "absolute -bottom-1 z-20 w-8 h-8 rounded-full flex items-center justify-center",
              isFolded ? "-left-1" : "-right-1",
            )}
            style={{
              background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
              border: "2px solid #fef3c7",
              boxShadow: "0 2px 8px rgba(245,158,11,0.5)",
            }}
            title="Dealer"
          >
            <span className="text-amber-900 text-xs font-black">D</span>
          </motion.div>
        )}
      </div>

      {/* Thinking indicator - only show when not all-in (all-in badge takes precedence) */}
      {isActive && !isFolded && !isAllIn && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-8 left-1/2 -translate-x-1/2 z-20"
        >
          <div
            className="text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap"
            style={{
              background: "linear-gradient(135deg, #c9a227, #dbb842)",
              color: "#1a1a2e",
              boxShadow: "0 2px 10px rgba(201,162,39,0.4)",
            }}
          >
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              ⏳
            </motion.span>
            THINKING {(timeRemaining / 1000).toFixed(1)}s
          </div>
        </motion.div>
      )}

      {/* Hole cards */}
      <div className="flex gap-1 mt-2">
        {showCards && player.holeCards && player.holeCards.length > 0 ? (
          player.holeCards.map((card, i) => (
            <PlayingCard
              key={i}
              card={card as Card}
              size="sm"
              animate={false}
            />
          ))
        ) : (
          <>
            <PlayingCard hidden size="sm" animate={false} />
            <PlayingCard hidden size="sm" animate={false} />
          </>
        )}
      </div>

      {/* Name plate */}
      <div
        className="mt-2 px-3 py-2 rounded-xl text-center min-w-[100px] max-w-[130px] relative"
        style={{
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(10,15,30,0.98) 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        <div
          className={clsx(
            "font-semibold text-xs truncate",
            isFolded ? "text-muted-dark" : "text-white",
          )}
          title={player.name || "Player"}
        >
          {player.name || "Player"}
        </div>
        <div className="font-bold text-base" style={{ color: "#c9a227" }}>
          {formatChips(player.chips)}
        </div>
      </div>

      {/* All-in badge - positioned above avatar, distinct from thinking indicator */}
      {isAllIn && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-8 left-1/2 -translate-x-1/2 z-30"
        >
          <span
            className="text-xs font-black px-3.5 py-1.5 rounded-full whitespace-nowrap"
            style={{
              background: "linear-gradient(135deg, #dc2626, #b91c1c)",
              color: "white",
              border: "2px solid #fca5a5",
              boxShadow:
                "0 0 16px rgba(220,38,38,0.6), 0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            ALL IN
          </span>
        </motion.div>
      )}

      {/* Fold overlay - positioned over the avatar area */}
      {isFolded && !isDisconnected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-6 left-1/2 -translate-x-1/2 z-10"
        >
          <span className="text-red-500/60 font-black text-sm rotate-[-12deg] drop-shadow">
            FOLD
          </span>
        </motion.div>
      )}

      {/* Action badge - positioned towards center based on seat position */}
      {isRecentAction && actionToShow && !isFolded && (
        <motion.div
          key={actionToShow.timestamp}
          initial={{ scale: 0, y: -5, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className={clsx(
            "mt-1 z-30",
            seatIndex >= 2 && seatIndex <= 3 && "translate-x-2",
            seatIndex >= 6 && seatIndex <= 7 && "-translate-x-2",
          )}
        >
          <ActionBadge
            action={actionToShow.type}
            amount={actionToShow.amount}
          />
        </motion.div>
      )}
    </motion.div>
  );
});

const ActionBadge = memo(function ActionBadge({
  action,
  amount,
}: {
  action: string;
  amount?: number;
}) {
  const configs: Record<string, { bg: string; text: string }> = {
    fold: { bg: "rgba(127,29,29,0.9)", text: "#fca5a5" },
    check: { bg: "rgba(30,58,138,0.9)", text: "#93c5fd" },
    call: { bg: "rgba(20,83,45,0.9)", text: "#86efac" },
    bet: { bg: "rgba(120,53,15,0.9)", text: "#fcd34d" },
    raise: { bg: "rgba(154,52,18,0.9)", text: "#fdba74" },
    all_in: { bg: "rgba(127,29,29,0.9)", text: "#fca5a5" },
    allin: { bg: "rgba(127,29,29,0.9)", text: "#fca5a5" },
  };
  const c = configs[action.toLowerCase()] || {
    bg: "rgba(30,41,59,0.9)",
    text: "#cbd5e1",
  };
  const showAmount = typeof amount === "number" && amount > 0;

  return (
    <div
      className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide whitespace-nowrap"
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.text}33`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {action.toUpperCase()}
      {showAmount && ` ${formatChips(amount)}`}
    </div>
  );
});

function formatChips(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 10000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString();
}
