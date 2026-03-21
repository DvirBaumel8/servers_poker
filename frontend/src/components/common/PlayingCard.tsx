import { motion } from "framer-motion";
import clsx from "clsx";
import * as Cards from "@letele/playing-cards";
import type { Card as CardType } from "../../types";
import type { FC, SVGProps } from "react";

interface PlayingCardProps {
  card?: CardType;
  hidden?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  animate?: boolean;
}

type CardComponent = FC<SVGProps<SVGSVGElement>>;

const SIZES = {
  xs: { width: 28, height: 40 },
  sm: { width: 40, height: 56 },
  md: { width: 56, height: 80 },
  lg: { width: 80, height: 112 },
};

const RANK_MAP: Record<string, string> = {
  A: "a",
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
  J: "j",
  Q: "q",
  K: "k",
};

const SUIT_MAP: Record<string, string> = {
  hearts: "H",
  "♥": "H",
  h: "H",
  H: "H",
  diamonds: "D",
  "♦": "D",
  d: "D",
  D: "D",
  clubs: "C",
  "♣": "C",
  c: "C",
  C: "C",
  spades: "S",
  "♠": "S",
  s: "S",
  S: "S",
};

const CardsMap = Cards as unknown as Record<string, CardComponent>;

function getCardComponent(card: CardType): CardComponent | null {
  const suit = SUIT_MAP[card.suit];
  const rank = RANK_MAP[card.rank?.toUpperCase()] || card.rank?.toLowerCase();

  if (!suit || !rank) return null;

  const cardName = `${suit}${rank}`;
  return CardsMap[cardName] || null;
}

export function PlayingCard({
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
    filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))",
  };

  if (hidden || !card) {
    const BackCard = CardsMap["B1"];
    return (
      <motion.div
        initial={animate ? { rotateY: 90, scale: 0.8 } : false}
        animate={{ rotateY: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={clsx("inline-block rounded-lg overflow-hidden", className)}
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
          "inline-flex items-center justify-center rounded-lg bg-gray-200 border border-gray-300",
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
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={clsx("inline-block rounded-lg overflow-hidden", className)}
      style={containerStyles}
    >
      <CardSvg style={{ width: "100%", height: "100%" }} />
    </motion.div>
  );
}

export function MiniPlayingCard({
  card,
  hidden = false,
}: {
  card?: CardType;
  hidden?: boolean;
}) {
  return <PlayingCard card={card} hidden={hidden} size="xs" animate={false} />;
}
