import { motion } from "framer-motion";
import clsx from "clsx";
import { useEffect, useState } from "react";
import type { Player } from "../../types";

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

export function PlayerSeat({
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
  const colors = AVATAR_COLORS[seatIndex % AVATAR_COLORS.length];
  const initial = (player.name || "B").charAt(0).toUpperCase();

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
        "relative flex flex-col items-center",
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
          <div className="absolute -inset-1.5 z-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 68 68">
              <circle
                cx="34"
                cy="34"
                r="31"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="3"
              />
              <circle
                cx="34"
                cy="34"
                r="31"
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
                strokeDasharray={`${(progress / 100) * 195} 195`}
                className="transition-all duration-100"
              />
            </svg>
          </div>
        )}

        {/* Avatar */}
        <div
          className={clsx(
            "w-14 h-14 rounded-full flex items-center justify-center relative z-10",
            "bg-gradient-to-br shadow-lg border-2",
            colors.bg,
            isActive
              ? "border-yellow-400 ring-2 " + colors.ring
              : "border-white/20",
          )}
        >
          <span className="text-white font-bold text-lg drop-shadow">
            {initial}
          </span>
        </div>

        {/* Dealer button */}
        {isDealer && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -bottom-0.5 -right-0.5 z-20 w-6 h-6 rounded-full flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
              border: "2px solid #fef3c7",
              boxShadow: "0 2px 8px rgba(245,158,11,0.5)",
            }}
          >
            <span className="text-amber-900 text-[10px] font-black">D</span>
          </motion.div>
        )}
      </div>

      {/* Thinking indicator */}
      {isActive && !isFolded && !isAllIn && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-6 left-1/2 -translate-x-1/2 z-20"
        >
          <div
            className="text-[9px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap"
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
      <div className="flex gap-0.5 mt-1.5 -mb-0.5">
        {showCards && player.holeCards && player.holeCards.length > 0 ? (
          player.holeCards.map((card, i) => <MiniCard key={i} card={card} />)
        ) : (
          <>
            <MiniCardBack />
            <MiniCardBack />
          </>
        )}
      </div>

      {/* Name plate */}
      <div
        className="mt-1 px-3 py-1.5 rounded-lg text-center min-w-[95px] relative"
        style={{
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(10,15,30,0.98) 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        <div
          className={clsx(
            "font-semibold text-[11px] truncate max-w-[85px]",
            isFolded ? "text-gray-500" : "text-white",
          )}
        >
          {player.name || "Player"}
        </div>
        <div className="font-bold text-sm" style={{ color: "#c9a227" }}>
          {formatChips(player.chips)}
        </div>
      </div>

      {/* All-in badge */}
      {isAllIn && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-2 left-1/2 -translate-x-1/2 z-20"
        >
          <span
            className="text-[10px] font-black px-2.5 py-0.5 rounded-full"
            style={{
              background: "linear-gradient(135deg, #dc2626, #b91c1c)",
              color: "white",
              border: "1px solid #fca5a5",
              boxShadow: "0 0 12px rgba(220,38,38,0.5)",
            }}
          >
            ALL IN
          </span>
        </motion.div>
      )}

      {/* Fold overlay */}
      {isFolded && !isDisconnected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-8 left-1/2 -translate-x-1/2"
        >
          <span className="text-red-500/60 font-black text-sm rotate-[-12deg] drop-shadow">
            FOLD
          </span>
        </motion.div>
      )}

      {/* Action badge */}
      {isRecentAction && actionToShow && !isFolded && (
        <motion.div
          key={actionToShow.timestamp}
          initial={{ scale: 0, y: -5, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="mt-1 z-30"
        >
          <ActionBadge
            action={actionToShow.type}
            amount={actionToShow.amount}
          />
        </motion.div>
      )}
    </motion.div>
  );
}

function ActionBadge({ action, amount }: { action: string; amount?: number }) {
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
      className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
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
}

function MiniCard({ card }: { card: { rank: string; suit: string } | string }) {
  let rank: string;
  let suit: string;
  if (typeof card === "string") {
    const chars = [...card];
    suit = chars.pop() || "?";
    rank = chars.join("");
  } else {
    rank = card.rank || "?";
    suit = card.suit || "?";
  }

  const suitSymbols: Record<string, string> = {
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
    spades: "♠",
    "♥": "♥",
    "♦": "♦",
    "♣": "♣",
    "♠": "♠",
  };
  const suitColors: Record<string, string> = {
    hearts: "#dc2626",
    diamonds: "#2563eb",
    clubs: "#16a34a",
    spades: "#1e293b",
    "♥": "#dc2626",
    "♦": "#2563eb",
    "♣": "#16a34a",
    "♠": "#1e293b",
  };
  const sym = suitSymbols[suit] || suit;
  const col = suitColors[suit] || "#1e293b";

  return (
    <div
      className="w-7 h-10 rounded-sm flex flex-col items-center justify-center"
      style={{
        background: "linear-gradient(160deg, #fff 0%, #f3f4f6 100%)",
        border: "1px solid #d1d5db",
        boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
      }}
    >
      <span
        className="font-black text-[9px] leading-none"
        style={{ color: col }}
      >
        {rank}
      </span>
      <span className="text-[10px] leading-none" style={{ color: col }}>
        {sym}
      </span>
    </div>
  );
}

function MiniCardBack() {
  return (
    <div
      className="w-7 h-10 rounded-sm flex items-center justify-center"
      style={{
        background:
          "linear-gradient(135deg, #1e3a5f 0%, #0f2440 50%, #1e3a5f 100%)",
        border: "1.5px solid rgba(201,162,39,0.3)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
      }}
    >
      <div
        className="w-3.5 h-5 rounded-sm"
        style={{
          border: "1px solid rgba(201,162,39,0.15)",
          background:
            "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(201,162,39,0.04) 2px, rgba(201,162,39,0.04) 4px)",
        }}
      />
    </div>
  );
}

function formatChips(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 10000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString();
}
