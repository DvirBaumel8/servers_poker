import { motion } from "framer-motion";
import clsx from "clsx";
import type { Card as CardType } from "../../types";

interface CardProps {
  card?: CardType;
  hidden?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  animate?: boolean;
}

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
  "♥": "♥",
  "♦": "♦",
  "♣": "♣",
  "♠": "♠",
};

const SUIT_COLORS: Record<string, { main: string; glow: string }> = {
  hearts: { main: "#dc2626", glow: "rgba(220,38,38,0.3)" },
  diamonds: { main: "#2563eb", glow: "rgba(37,99,235,0.3)" },
  clubs: { main: "#16a34a", glow: "rgba(22,163,74,0.3)" },
  spades: { main: "#1e293b", glow: "rgba(30,41,59,0.3)" },
  "♥": { main: "#dc2626", glow: "rgba(220,38,38,0.3)" },
  "♦": { main: "#2563eb", glow: "rgba(37,99,235,0.3)" },
  "♣": { main: "#16a34a", glow: "rgba(22,163,74,0.3)" },
  "♠": { main: "#1e293b", glow: "rgba(30,41,59,0.3)" },
};

const SIZES = {
  sm: {
    w: "w-10",
    h: "h-14",
    rank: "text-xs",
    suit: "text-sm",
    center: "text-lg",
  },
  md: {
    w: "w-14",
    h: "h-20",
    rank: "text-sm",
    suit: "text-sm",
    center: "text-2xl",
  },
  lg: {
    w: "w-20",
    h: "h-28",
    rank: "text-lg",
    suit: "text-base",
    center: "text-4xl",
  },
};

export function Card({
  card,
  hidden = false,
  size = "md",
  className,
  animate = true,
}: CardProps) {
  const s = SIZES[size];

  if (hidden || !card) {
    return (
      <motion.div
        initial={animate ? { rotateY: 90, scale: 0.8 } : false}
        animate={{ rotateY: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={clsx(
          s.w,
          s.h,
          "rounded-lg relative overflow-hidden",
          className,
        )}
        style={{
          background:
            "linear-gradient(145deg, #1e3a5f 0%, #0f2440 50%, #1e3a5f 100%)",
          border: "2px solid rgba(201, 162, 39, 0.4)",
          boxShadow:
            "0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        <div
          className="absolute inset-[3px] rounded-md"
          style={{
            border: "1px solid rgba(201, 162, 39, 0.15)",
            background:
              "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(201,162,39,0.04) 3px, rgba(201,162,39,0.04) 6px)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-yellow-500/20 text-2xl font-bold">♠</span>
        </div>
      </motion.div>
    );
  }

  const suitKey = card.suit || "♠";
  const suitSymbol = SUIT_SYMBOLS[suitKey] || suitKey;
  const colors = SUIT_COLORS[suitKey] || SUIT_COLORS["♠"];

  return (
    <motion.div
      initial={animate ? { rotateY: 90, scale: 0.8 } : false}
      animate={{ rotateY: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={clsx(
        s.w,
        s.h,
        "rounded-lg relative overflow-hidden",
        className,
      )}
      style={{
        background:
          "linear-gradient(160deg, #ffffff 0%, #f3f4f6 40%, #e5e7eb 100%)",
        border: "1px solid #d1d5db",
        boxShadow:
          "0 4px 12px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.9)",
      }}
    >
      <div className="absolute top-1 left-1.5 flex flex-col items-center leading-none">
        <span
          className={clsx("font-black", s.rank)}
          style={{ color: colors.main }}
        >
          {card.rank}
        </span>
        <span className={clsx(s.suit)} style={{ color: colors.main }}>
          {suitSymbol}
        </span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={clsx(s.center, "font-bold")}
          style={{ color: colors.main }}
        >
          {suitSymbol}
        </span>
      </div>

      <div className="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180">
        <span
          className={clsx("font-black", s.rank)}
          style={{ color: colors.main }}
        >
          {card.rank}
        </span>
        <span className={clsx(s.suit)} style={{ color: colors.main }}>
          {suitSymbol}
        </span>
      </div>
    </motion.div>
  );
}
