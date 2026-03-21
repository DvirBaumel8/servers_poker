import { memo } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import * as Cards from "@letele/playing-cards";
import type { Card as CardType } from "../../types";
import type { FC, SVGProps } from "react";

interface PlayingCardProps {
  card?: CardType;
  hidden?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  animate?: boolean;
}

type CardComponent = FC<SVGProps<SVGSVGElement>>;

const SIZES = {
  xs: { width: 32, height: 45 },    // Slightly larger for hole cards
  sm: { width: 44, height: 62 },    // Better for mini displays
  md: { width: 60, height: 84 },    // Good for community cards
  lg: { width: 80, height: 112 },   // Large display
  xl: { width: 100, height: 140 },  // Extra large
  "2xl": { width: 120, height: 168 }, // Hero display
};

const RANK_MAP: Record<string, string> = {
  A: "a",
  a: "a",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  T: "10",
  t: "10",
  J: "j",
  j: "j",
  Q: "q",
  q: "q",
  K: "k",
  k: "k",
};

const SUIT_MAP: Record<string, string> = {
  hearts: "H",
  Hearts: "H",
  HEARTS: "H",
  "♥": "H",
  h: "H",
  H: "H",
  diamonds: "D",
  Diamonds: "D",
  DIAMONDS: "D",
  "♦": "D",
  d: "D",
  D: "D",
  clubs: "C",
  Clubs: "C",
  CLUBS: "C",
  "♣": "C",
  c: "C",
  C: "C",
  spades: "S",
  Spades: "S",
  SPADES: "S",
  "♠": "S",
  s: "S",
  S: "S",
};

const CardsMap = Cards as unknown as Record<string, CardComponent>;

function getCardComponent(card: CardType): CardComponent | null {
  if (!card || !card.suit || !card.rank) return null;
  
  const suit = SUIT_MAP[card.suit];
  const rankInput = card.rank?.toString() || "";
  const rank = RANK_MAP[rankInput] || RANK_MAP[rankInput.toUpperCase()] || rankInput.toLowerCase();

  if (!suit || !rank) {
    console.warn("PlayingCard: Could not map card", { card, suit, rank });
    return null;
  }

  const cardName = `${suit}${rank}`;
  const component = CardsMap[cardName];
  
  if (!component) {
    console.warn("PlayingCard: No component found for", cardName, { card });
  }
  
  return component || null;
}

export const PlayingCard = memo(function PlayingCard({
  card,
  hidden = false,
  size = "md",
  className,
  animate = true,
}: PlayingCardProps) {
  const dimensions = SIZES[size];

  const containerStyles = {
    width: dimensions.width,
    height: dimensions.height,
  };

  if (hidden || !card) {
    const BackCard = CardsMap["B1"];
    return (
      <motion.div
        initial={animate ? { rotateY: 90, scale: 0.8 } : false}
        animate={{ rotateY: 0, scale: 1 }}
        whileHover={{ scale: 1.05, y: -4 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={clsx(
          "playing-card inline-block rounded-lg overflow-hidden cursor-pointer",
          "shadow-[0_4px_12px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.5)]",
          "transition-shadow duration-200",
          className
        )}
        style={containerStyles}
      >
        {BackCard && <BackCard style={{ width: "100%", height: "100%" }} />}
      </motion.div>
    );
  }

  const CardSvg = getCardComponent(card);

  if (!CardSvg) {
    return (
      <motion.div
        initial={animate ? { rotateY: 90, scale: 0.8 } : false}
        animate={{ rotateY: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={clsx(
          "playing-card inline-flex items-center justify-center rounded-lg bg-gray-200 border border-gray-300",
          className,
        )}
        style={containerStyles}
      >
        <span className="text-xs text-gray-500">?</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={animate ? { rotateY: 90, scale: 0.8 } : false}
      animate={{ rotateY: 0, scale: 1 }}
      whileHover={{ scale: 1.05, y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={clsx(
        "playing-card inline-block rounded-lg overflow-hidden cursor-pointer",
        "shadow-[0_4px_12px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.5)]",
        "transition-shadow duration-200",
        className
      )}
      style={containerStyles}
    >
      <CardSvg style={{ width: "100%", height: "100%" }} />
    </motion.div>
  );
});

export const MiniPlayingCard = memo(function MiniPlayingCard({
  card,
  hidden = false,
}: {
  card?: CardType;
  hidden?: boolean;
}) {
  return <PlayingCard card={card} hidden={hidden} size="xs" animate={false} />;
});
