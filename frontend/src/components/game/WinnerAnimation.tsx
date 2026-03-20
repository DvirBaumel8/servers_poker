import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import type { HandResult } from "../../types";

interface WinnerAnimationProps {
  result: HandResult | null;
  winnerPosition: { top: string; left: string } | null;
  onComplete: () => void;
  playerNames?: Record<string, string>;
}

export function WinnerAnimation({
  result,
  winnerPosition,
  onComplete,
  playerNames = {},
}: WinnerAnimationProps) {
  const [phase, setPhase] = useState<"chips" | "info" | "done">("chips");
  const [chipsVisible, setChipsVisible] = useState(true);

  useEffect(() => {
    if (!result) return;

    setPhase("chips");
    setChipsVisible(true);

    const chipTimer = setTimeout(() => {
      setChipsVisible(false);
      setPhase("info");
    }, 1200);

    const completeTimer = setTimeout(() => {
      setPhase("done");
      onComplete();
    }, 4000);

    return () => {
      clearTimeout(chipTimer);
      clearTimeout(completeTimer);
    };
  }, [result, onComplete]);

  if (!result || phase === "done") return null;

  const winner = result.winners[0];
  const winnerName =
    playerNames[winner?.botId] || winner?.botId?.slice(0, 8) || "Winner";

  return (
    <AnimatePresence>
      {/* Flying chips animation */}
      {chipsVisible && winnerPosition && (
        <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <FlyingChip
              key={i}
              delay={i * 0.05}
              targetPosition={winnerPosition}
              color={["red", "blue", "green", "yellow", "purple"][i % 5]}
            />
          ))}
        </div>
      )}

      {/* Winner banner on table */}
      {phase === "info" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", damping: 15 }}
          className="absolute top-[50%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none"
        >
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute -inset-4 bg-yellow-500/20 rounded-full blur-xl" />

            {/* Main content */}
            <div className="relative bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-lg rounded-2xl border border-yellow-500/50 shadow-2xl shadow-yellow-500/20 px-8 py-5">
              {/* Trophy and hand number */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="flex items-center justify-center gap-3 mb-3"
              >
                <motion.span
                  animate={{ rotate: [-5, 5, -5] }}
                  transition={{ repeat: 3, duration: 0.3 }}
                  className="text-4xl"
                >
                  🏆
                </motion.span>
                <span className="text-white/60 text-sm font-medium">
                  Hand #{result.handNumber}
                </span>
              </motion.div>

              {/* Winner name */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-center"
              >
                <div className="text-white text-xl font-bold mb-1">
                  {winnerName}
                </div>
                <div className="text-yellow-400/80 text-sm font-medium">
                  {winner?.handName || "Winner"}
                </div>
              </motion.div>

              {/* Amount won */}
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: "spring" }}
                className="mt-3 flex items-center justify-center gap-2"
              >
                <ChipIcon />
                <span className="text-green-400 text-2xl font-black">
                  +{formatAmount(winner?.amount || result.pot)}
                </span>
              </motion.div>

              {/* Multiple winners indicator */}
              {result.winners.length > 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="mt-2 text-center text-gray-400 text-xs"
                >
                  Split pot with {result.winners.length} players
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FlyingChip({
  delay,
  targetPosition,
  color,
}: {
  delay: number;
  targetPosition: { top: string; left: string };
  color: string;
}) {
  const colors: Record<string, string> = {
    red: "from-red-400 to-red-600 border-red-300",
    blue: "from-blue-400 to-blue-600 border-blue-300",
    green: "from-green-400 to-green-600 border-green-300",
    yellow: "from-yellow-400 to-yellow-600 border-yellow-300",
    purple: "from-purple-400 to-purple-600 border-purple-300",
  };

  const randomOffset = {
    x: (Math.random() - 0.5) * 40,
    y: (Math.random() - 0.5) * 40,
  };

  return (
    <motion.div
      initial={{
        top: "50%",
        left: "50%",
        x: "-50%",
        y: "-50%",
        scale: 1,
        opacity: 1,
      }}
      animate={{
        top: targetPosition.top,
        left: targetPosition.left,
        x: randomOffset.x,
        y: randomOffset.y,
        scale: [1, 1.2, 0.8],
        opacity: [1, 1, 0],
      }}
      transition={{
        duration: 0.8,
        delay,
        ease: [0.2, 0.8, 0.4, 1],
      }}
      className="absolute"
    >
      <div
        className={`w-5 h-5 rounded-full bg-gradient-to-b border shadow-lg ${colors[color]}`}
        style={{
          boxShadow: `0 2px 8px rgba(0,0,0,0.3), 0 0 12px ${color === "yellow" ? "#fbbf24" : color === "green" ? "#22c55e" : "#ef4444"}40`,
        }}
      />
    </motion.div>
  );
}

function ChipIcon() {
  return (
    <div className="flex -space-x-1">
      <div className="w-5 h-5 rounded-full bg-gradient-to-b from-yellow-400 to-yellow-600 border border-yellow-300 shadow-lg" />
      <div className="w-5 h-5 rounded-full bg-gradient-to-b from-green-400 to-green-600 border border-green-300 shadow-lg" />
    </div>
  );
}

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 10000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString();
}
