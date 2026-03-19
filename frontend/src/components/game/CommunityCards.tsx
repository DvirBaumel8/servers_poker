import { motion } from "framer-motion";
import clsx from "clsx";
import type { Card as CardType } from "../../types";

interface CommunityCardsProps {
  cards: CardType[];
  stage: string;
  className?: string;
}

export function CommunityCards({ cards, stage, className }: CommunityCardsProps) {
  // Don't show anything during pre-flop or waiting
  if (stage === "pre-flop" || stage === "waiting") {
    return null;
  }
  
  // If we have no cards but should (post-flop), show placeholders
  if (!cards || cards.length === 0) {
    return null;
  }

  // Show cards we have, pad to 5 with placeholders
  const displayCards = [...cards];
  while (displayCards.length < 5) {
    displayCards.push(null as unknown as CardType);
  }

  return (
    <div className={clsx("flex gap-2", className)}>
      {displayCards.map((card, index) => (
        <motion.div
          key={index}
          initial={{ rotateY: 180, scale: 0.8, opacity: 0 }}
          animate={{
            rotateY: card ? 0 : 180,
            scale: card ? 1 : 0.95,
            opacity: 1,
          }}
          transition={{
            duration: 0.4,
            delay: card ? index * 0.1 : 0,
            type: "spring",
            stiffness: 200,
          }}
          style={{ perspective: 1000 }}
        >
          {card ? (
            <PokerCard card={card} />
          ) : (
            <CardPlaceholder />
          )}
        </motion.div>
      ))}
    </div>
  );
}

interface PokerCardProps {
  card: CardType | string;
}

function PokerCard({ card }: PokerCardProps) {
  let rank: string;
  let suit: string;
  
  // Handle case where card might be a string like "K♥" or an object {rank, suit}
  if (typeof card === "string") {
    const chars = [...card];
    suit = chars.pop() || "?";
    rank = chars.join("");
  } else {
    rank = card.rank || "?";
    suit = card.suit || "?";
  }
  
  const isRed = suit === "hearts" || suit === "diamonds" ||
                suit === "♥" || suit === "♦" ||
                suit === "h" || suit === "d";
  const suitSymbol = getSuitSymbol(suit);

  return (
    <div
      className={clsx(
        "w-14 h-20 rounded-lg bg-white shadow-xl",
        "flex flex-col items-center justify-center",
        "border-2 border-gray-200 relative overflow-hidden"
      )}
      style={{
        background: "linear-gradient(135deg, #fff 0%, #f8f8f8 100%)",
        boxShadow: "0 4px 15px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.8)",
      }}
    >
      {/* Top left corner */}
      <div className="absolute top-1 left-1.5 flex flex-col items-center">
        <span className={clsx("font-bold text-sm leading-none", isRed ? "text-red-600" : "text-gray-900")}>
          {rank}
        </span>
        <span className={clsx("text-sm leading-none", isRed ? "text-red-600" : "text-gray-900")}>
          {suitSymbol}
        </span>
      </div>

      {/* Center suit */}
      <span className={clsx("text-3xl", isRed ? "text-red-600" : "text-gray-900")}>
        {suitSymbol}
      </span>

      {/* Bottom right corner (inverted) */}
      <div className="absolute bottom-1 right-1.5 flex flex-col items-center rotate-180">
        <span className={clsx("font-bold text-sm leading-none", isRed ? "text-red-600" : "text-gray-900")}>
          {rank}
        </span>
        <span className={clsx("text-sm leading-none", isRed ? "text-red-600" : "text-gray-900")}>
          {suitSymbol}
        </span>
      </div>
    </div>
  );
}

function CardPlaceholder() {
  return (
    <div
      className={clsx(
        "w-14 h-20 rounded-lg",
        "border-2 border-dashed border-white/20",
        "bg-white/5"
      )}
    />
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
