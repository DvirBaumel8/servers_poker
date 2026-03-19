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
};

const SUIT_COLORS: Record<string, string> = {
  hearts: "text-red-500",
  diamonds: "text-red-500",
  clubs: "text-gray-900",
  spades: "text-gray-900",
};

const SIZES = {
  sm: "w-10 h-14 text-sm",
  md: "w-14 h-20 text-base",
  lg: "w-20 h-28 text-xl",
};

export function Card({
  card,
  hidden = false,
  size = "md",
  className,
  animate = true,
}: CardProps) {
  const sizeClass = SIZES[size];

  if (hidden || !card) {
    return (
      <motion.div
        initial={animate ? { scale: 0, rotateY: 180 } : false}
        animate={{ scale: 1, rotateY: 0 }}
        className={clsx(
          "rounded-lg shadow-lg flex items-center justify-center",
          "bg-gradient-to-br from-blue-800 to-blue-950",
          "border border-blue-600",
          sizeClass,
          className
        )}
      >
        <div className="text-blue-400 opacity-30 text-4xl">♠</div>
      </motion.div>
    );
  }

  const suitSymbol = SUIT_SYMBOLS[card.suit] || card.suit;
  const suitColor = SUIT_COLORS[card.suit] || "text-gray-900";

  return (
    <motion.div
      initial={animate ? { scale: 0, rotateY: 180 } : false}
      animate={{ scale: 1, rotateY: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={clsx(
        "rounded-lg shadow-lg bg-white",
        "border border-gray-200",
        "flex flex-col items-center justify-center",
        sizeClass,
        className
      )}
    >
      <span className={clsx("font-bold", suitColor)}>{card.rank}</span>
      <span className={clsx("text-2xl", suitColor)}>{suitSymbol}</span>
    </motion.div>
  );
}
