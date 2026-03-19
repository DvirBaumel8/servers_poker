import { motion } from "framer-motion";
import clsx from "clsx";
import { Card } from "../common/Card";
import type { Player } from "../../types";

interface PlayerSeatProps {
  player: Player;
  isDealer?: boolean;
  isActive?: boolean;
  showCards?: boolean;
  className?: string;
}

export function PlayerSeat({
  player,
  isDealer = false,
  isActive = false,
  showCards = false,
  className,
}: PlayerSeatProps) {
  const isFolded = player.folded;
  const isAllIn = player.allIn;
  const isDisconnected = player.disconnected;

  return (
    <motion.div
      animate={{
        scale: isActive ? 1.05 : 1,
        boxShadow: isActive
          ? "0 0 20px rgba(212, 175, 55, 0.5)"
          : "0 4px 6px rgba(0, 0, 0, 0.3)",
      }}
      className={clsx(
        "relative flex flex-col items-center p-3 rounded-xl",
        "bg-gray-900/80 backdrop-blur-sm border",
        isActive ? "border-poker-gold" : "border-gray-700",
        isFolded && "opacity-50",
        isDisconnected && "opacity-30",
        className
      )}
    >
      {isDealer && (
        <div
          className={clsx(
            "absolute -top-2 -right-2 w-6 h-6 rounded-full",
            "bg-white text-gray-900 text-xs font-bold",
            "flex items-center justify-center shadow-lg"
          )}
        >
          D
        </div>
      )}

      {isAllIn && (
        <div
          className={clsx(
            "absolute -top-2 left-1/2 -translate-x-1/2",
            "bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded"
          )}
        >
          ALL IN
        </div>
      )}

      <div className="flex gap-1 mb-2">
        {player.holeCards && player.holeCards.length > 0 ? (
          player.holeCards.map((card, i) => (
            <Card
              key={i}
              card={card}
              hidden={!showCards && card.rank === "??"}
              size="sm"
            />
          ))
        ) : (
          <>
            <Card hidden size="sm" />
            <Card hidden size="sm" />
          </>
        )}
      </div>

      <div className="text-center">
        <div
          className={clsx(
            "font-semibold text-sm truncate max-w-[80px]",
            isFolded ? "text-gray-500" : "text-white"
          )}
        >
          {player.name}
        </div>
        <div className="text-poker-gold font-bold text-sm">
          {formatChips(player.chips)}
        </div>
        {player.bet > 0 && (
          <div className="text-green-400 text-xs">Bet: {player.bet}</div>
        )}
        {player.position && (
          <div className="text-gray-400 text-xs">{player.position}</div>
        )}
      </div>

      {isFolded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-red-500 font-bold text-lg rotate-[-15deg]">
            FOLD
          </span>
        </div>
      )}
    </motion.div>
  );
}

function formatChips(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toString();
}
