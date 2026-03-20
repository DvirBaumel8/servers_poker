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

const AVATAR_IMAGES = [
  "🦁", "🐯", "🦊", "🐺", "🦅", "🦈", "🐉", "🦄", "🐘",
];

const AVATAR_BG_COLORS = [
  "from-orange-500 to-orange-700",
  "from-blue-500 to-blue-700",
  "from-purple-500 to-purple-700",
  "from-green-500 to-green-700",
  "from-pink-500 to-pink-700",
  "from-cyan-500 to-cyan-700",
  "from-red-500 to-red-700",
  "from-indigo-500 to-indigo-700",
  "from-yellow-500 to-yellow-700",
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
  const avatarEmoji = AVATAR_IMAGES[seatIndex % AVATAR_IMAGES.length];
  const avatarBg = AVATAR_BG_COLORS[seatIndex % AVATAR_BG_COLORS.length];
  
  const actionToShow = lastAction || player.lastAction;
  const isRecentAction = actionToShow && (Date.now() - actionToShow.timestamp < 5000);

  // Timer state for active player
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
      animate={{
        scale: isActive ? 1.05 : 1,
      }}
      className={clsx(
        "relative flex flex-col items-center",
        isFolded && "opacity-50",
        isDisconnected && "opacity-30 grayscale",
        className
      )}
    >
      {/* Active player glow */}
      {isActive && (
        <motion.div
          className="absolute -inset-3 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,200,0,0.4) 0%, transparent 70%)",
          }}
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Avatar container */}
      <div className="relative">
        {/* Level badge */}
        <div className="absolute -top-1 -left-1 z-10 w-6 h-6 rounded-full bg-gradient-to-b from-gray-700 to-gray-900 border-2 border-gray-500 flex items-center justify-center shadow-lg">
          <span className="text-white text-[10px] font-bold">{(seatIndex + 1) * 10}</span>
        </div>

        {/* Timer ring for active player */}
        {isActive && (
          <div className="absolute -inset-1 z-5">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
              {/* Background circle */}
              <circle
                cx="32"
                cy="32"
                r="29"
                fill="none"
                stroke="rgba(0,0,0,0.3)"
                strokeWidth="4"
              />
              {/* Progress circle */}
              <circle
                cx="32"
                cy="32"
                r="29"
                fill="none"
                stroke={progress > 30 ? "#22c55e" : progress > 10 ? "#eab308" : "#ef4444"}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${(progress / 100) * 182} 182`}
                className="transition-all duration-100"
              />
            </svg>
          </div>
        )}

        {/* Avatar */}
        <div
          className={clsx(
            "w-14 h-14 rounded-full flex items-center justify-center text-2xl",
            "bg-gradient-to-b shadow-lg border-2",
            avatarBg,
            isActive ? "border-yellow-400 ring-2 ring-yellow-400/50" : "border-white/30"
          )}
        >
          {avatarEmoji}
        </div>

        {/* Dealer button */}
        {isDealer && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -bottom-1 -right-1 z-10 w-6 h-6 rounded-full bg-gradient-to-b from-yellow-300 to-yellow-500 border-2 border-white shadow-lg flex items-center justify-center"
          >
            <span className="text-yellow-900 text-xs font-black">D</span>
          </motion.div>
        )}
      </div>

      {/* "THINKING" indicator for active player */}
      {isActive && !isFolded && !isAllIn && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-6 left-1/2 -translate-x-1/2 z-20"
        >
          <div className="bg-gradient-to-r from-yellow-500 to-amber-500 text-black text-[9px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1">
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              ⏳
            </motion.span>
            <span>THINKING</span>
            <span className="font-mono text-[8px]">
              {(timeRemaining / 1000).toFixed(1)}s
            </span>
          </div>
        </motion.div>
      )}

      {/* Cards */}
      <div className="flex gap-0.5 mt-1 -mb-1">
        {showCards && player.holeCards && player.holeCards.length > 0 ? (
          player.holeCards.map((card, i) => (
            <MiniCard key={i} card={card} />
          ))
        ) : (
          <>
            <MiniCardBack />
            <MiniCardBack />
          </>
        )}
      </div>

      {/* Name and chips plate */}
      <div
        className={clsx(
          "mt-1 px-3 py-1.5 rounded-lg text-center min-w-[90px]",
          "bg-gradient-to-b from-gray-800 to-gray-900",
          "border border-gray-600/50 shadow-xl"
        )}
      >
        <div
          className={clsx(
            "font-semibold text-xs truncate max-w-[85px]",
            isFolded ? "text-gray-500" : "text-white"
          )}
        >
          {player.name || "Player"}
        </div>
        <div className="text-yellow-400 font-bold text-sm">
          {formatChips(player.chips)}
        </div>
      </div>

      {/* All-in badge */}
      {isAllIn && (
        <motion.div
          initial={{ scale: 0, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-red-600 to-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-red-400"
        >
          ALL IN
        </motion.div>
      )}

      {/* Fold overlay */}
      {isFolded && !isDisconnected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-8 left-1/2 -translate-x-1/2"
        >
          <span className="text-red-500/70 font-black text-lg rotate-[-12deg] drop-shadow-lg">
            FOLD
          </span>
        </motion.div>
      )}

      {/* Last action badge - positioned below name plate */}
      {isRecentAction && actionToShow && !isFolded && (
        <motion.div
          key={actionToShow.timestamp}
          initial={{ scale: 0, y: -5, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="mt-1 z-30"
        >
          <ActionBadge action={actionToShow.type} amount={actionToShow.amount} />
        </motion.div>
      )}
    </motion.div>
  );
}

function ActionBadge({ action, amount }: { action: string; amount?: number }) {
  const config = getActionConfig(action);
  const showAmount = typeof amount === "number" && amount > 0;
  
  return (
    <motion.div
      initial={{ scale: 0.8 }}
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 0.3 }}
      className={clsx(
        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide",
        "shadow-lg border whitespace-nowrap",
        config.bg,
        config.text,
        config.border
      )}
    >
      <span className="mr-1">{config.icon}</span>
      {action.toUpperCase()}
      {showAmount && ` ${formatChips(amount)}`}
    </motion.div>
  );
}

function getActionConfig(action: string): { 
  icon: string; 
  bg: string; 
  text: string; 
  border: string;
} {
  const actionLower = action.toLowerCase();
  const configs: Record<string, { icon: string; bg: string; text: string; border: string }> = {
    fold: { 
      icon: "✗", 
      bg: "bg-red-900/90", 
      text: "text-red-300", 
      border: "border-red-700" 
    },
    check: { 
      icon: "✓", 
      bg: "bg-blue-900/90", 
      text: "text-blue-300", 
      border: "border-blue-700" 
    },
    call: { 
      icon: "📞", 
      bg: "bg-green-900/90", 
      text: "text-green-300", 
      border: "border-green-700" 
    },
    bet: { 
      icon: "💰", 
      bg: "bg-yellow-900/90", 
      text: "text-yellow-300", 
      border: "border-yellow-700" 
    },
    raise: { 
      icon: "⬆", 
      bg: "bg-orange-900/90", 
      text: "text-orange-300", 
      border: "border-orange-700" 
    },
    all_in: { 
      icon: "🔥", 
      bg: "bg-red-800/90", 
      text: "text-red-200", 
      border: "border-red-600" 
    },
    allin: { 
      icon: "🔥", 
      bg: "bg-red-800/90", 
      text: "text-red-200", 
      border: "border-red-600" 
    },
  };

  return configs[actionLower] || { 
    icon: "•", 
    bg: "bg-gray-800/90", 
    text: "text-gray-300", 
    border: "border-gray-600" 
  };
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
  
  const isRed = suit === "hearts" || suit === "diamonds" || 
                suit === "♥" || suit === "♦";
  
  const suitSymbol = getSuitSymbol(suit);
  
  return (
    <div
      className={clsx(
        "w-7 h-10 rounded-sm bg-white shadow-md",
        "flex flex-col items-center justify-center",
        "border border-gray-300 text-[9px] font-bold"
      )}
    >
      <span className={isRed ? "text-red-500" : "text-gray-900"}>
        {rank}
      </span>
      <span className={clsx("text-[10px]", isRed ? "text-red-500" : "text-gray-900")}>
        {suitSymbol}
      </span>
    </div>
  );
}

function MiniCardBack() {
  return (
    <div
      className={clsx(
        "w-7 h-10 rounded-sm shadow-md",
        "bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800",
        "border border-blue-400",
        "flex items-center justify-center"
      )}
    >
      <div className="w-4 h-6 rounded-sm border border-blue-400/50 bg-blue-500/30" />
    </div>
  );
}

function getSuitSymbol(suit: string): string {
  const symbols: Record<string, string> = {
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
    spades: "♠",
    "♥": "♥",
    "♦": "♦",
    "♣": "♣",
    "♠": "♠",
  };
  return symbols[suit] || suit;
}

function formatChips(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 10000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString();
}
