import { motion } from "framer-motion";
import clsx from "clsx";
import { Card } from "../common/Card";
import { ChipStack } from "../common/ChipStack";
import { PlayerSeat } from "./PlayerSeat";
import type { GameState } from "../../types";

interface TableProps {
  gameState: GameState;
  className?: string;
}

const SEAT_POSITIONS = [
  { top: "85%", left: "50%", transform: "translate(-50%, -50%)" },
  { top: "70%", left: "15%", transform: "translate(-50%, -50%)" },
  { top: "30%", left: "5%", transform: "translate(-50%, -50%)" },
  { top: "5%", left: "25%", transform: "translate(-50%, -50%)" },
  { top: "5%", left: "50%", transform: "translate(-50%, -50%)" },
  { top: "5%", left: "75%", transform: "translate(-50%, -50%)" },
  { top: "30%", left: "95%", transform: "translate(-50%, -50%)" },
  { top: "70%", left: "85%", transform: "translate(-50%, -50%)" },
  { top: "50%", left: "95%", transform: "translate(-50%, -50%)" },
];

export function Table({ gameState, className }: TableProps) {
  const { players, communityCards, pot, stage, handNumber } = gameState;

  return (
    <div className={clsx("relative w-full max-w-4xl aspect-[16/10]", className)}>
      <div
        className={clsx(
          "absolute inset-0 rounded-[50%] felt-texture",
          "border-8 border-amber-900 shadow-2xl"
        )}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {handNumber > 0 && (
          <div className="text-white/50 text-sm mb-2">
            Hand #{handNumber} - {stage.toUpperCase()}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {communityCards.length === 0 ? (
            <div className="text-white/30 text-sm">
              {stage === "preflop" ? "Waiting for flop..." : ""}
            </div>
          ) : (
            communityCards.map((card, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, y: -50 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card card={card} size="lg" />
              </motion.div>
            ))
          )}
        </div>

        {pot > 0 && <ChipStack amount={pot} size="md" />}
      </div>

      {players.map((player, index) => {
        const position = SEAT_POSITIONS[index % SEAT_POSITIONS.length];
        const isDealer = index === gameState.dealerPosition;
        const isActive = player.id === gameState.currentPlayerId;

        return (
          <div
            key={player.id}
            className="absolute"
            style={{
              top: position.top,
              left: position.left,
              transform: position.transform,
            }}
          >
            <PlayerSeat
              player={player}
              isDealer={isDealer}
              isActive={isActive}
              showCards={stage === "showdown"}
            />
          </div>
        );
      })}
    </div>
  );
}
