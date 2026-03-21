import { motion } from "framer-motion";
import clsx from "clsx";
import { PlayingCard } from "../common/PlayingCard";
import type { Card as CardType } from "../../types";

interface CommunityCardsProps {
  cards: CardType[];
  stage: string;
  className?: string;
}

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
          {card ? (
            <PlayingCard card={card} size="sm" animate={false} />
          ) : (
            <CardSlot />
          )}
        </motion.div>
      ))}
    </div>
  );
}

function CardSlot() {
  return (
    <div
      className="rounded-lg"
      style={{
        width: 40,
        height: 56,
        border: "2px dashed rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
      }}
    />
  );
}
