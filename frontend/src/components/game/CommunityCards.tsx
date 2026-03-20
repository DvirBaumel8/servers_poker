import { motion } from "framer-motion";
import clsx from "clsx";
import type { Card as CardType } from "../../types";

interface CommunityCardsProps {
  cards: CardType[];
  stage: string;
  className?: string;
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

const SUIT_COLORS: Record<string, string> = {
  hearts: "#dc2626",
  diamonds: "#2563eb",
  clubs: "#16a34a",
  spades: "#1e293b",
  "♥": "#dc2626",
  "♦": "#2563eb",
  "♣": "#16a34a",
  "♠": "#1e293b",
};

export function CommunityCards({
  cards,
  stage,
  className,
}: CommunityCardsProps) {
  if (stage === "pre-flop" || stage === "waiting") {
    return null;
  }

  if (!cards || cards.length === 0) {
    return null;
  }

  const displayCards = [...cards];
  while (displayCards.length < 5) {
    displayCards.push(null as unknown as CardType);
  }

  return (
    <div className={clsx("flex gap-2 items-center", className)}>
      {displayCards.map((card, index) => (
        <motion.div
          key={index}
          initial={{ rotateY: 90, scale: 0.7, opacity: 0 }}
          animate={{
            rotateY: card ? 0 : 90,
            scale: card ? 1 : 0.9,
            opacity: 1,
          }}
          transition={{
            duration: 0.5,
            delay: card ? index * 0.12 : 0,
            type: "spring",
            stiffness: 200,
            damping: 20,
          }}
          style={{ perspective: 800 }}
        >
          {card ? <BoardCard card={card} /> : <CardSlot />}
        </motion.div>
      ))}
    </div>
  );
}

function BoardCard({ card }: { card: CardType | string }) {
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

  const suitSymbol = SUIT_SYMBOLS[suit] || suit;
  const suitColor = SUIT_COLORS[suit] || "#1e293b";

  return (
    <div
      className="w-[52px] h-[74px] rounded-lg relative overflow-hidden select-none"
      style={{
        background:
          "linear-gradient(160deg, #ffffff 0%, #f8f9fa 30%, #f1f3f5 100%)",
        border: "1.5px solid #ced4da",
        boxShadow:
          "0 6px 20px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.95)",
      }}
    >
      <div className="absolute top-[3px] left-[5px] flex flex-col items-center leading-none">
        <span className="font-black text-[13px]" style={{ color: suitColor }}>
          {rank}
        </span>
        <span className="text-[12px] -mt-px" style={{ color: suitColor }}>
          {suitSymbol}
        </span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center pt-1">
        <span
          className="text-[28px] drop-shadow-sm"
          style={{ color: suitColor }}
        >
          {suitSymbol}
        </span>
      </div>

      <div className="absolute bottom-[3px] right-[5px] flex flex-col items-center leading-none rotate-180">
        <span className="font-black text-[13px]" style={{ color: suitColor }}>
          {rank}
        </span>
        <span className="text-[12px] -mt-px" style={{ color: suitColor }}>
          {suitSymbol}
        </span>
      </div>
    </div>
  );
}

function CardSlot() {
  return (
    <div
      className="w-[52px] h-[74px] rounded-lg"
      style={{
        border: "2px dashed rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
      }}
    />
  );
}
