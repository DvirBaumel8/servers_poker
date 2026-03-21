import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { HandResult } from "../../types";
import { ProvablyFairInfo } from "./ProvablyFairInfo";

interface HandResultToastProps {
  result: HandResult | null;
  onDismiss: () => void;
  playerNames?: Record<string, string>;
}

export function HandResultToast({
  result,
  onDismiss,
  playerNames = {},
}: HandResultToastProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    },
    [onDismiss],
  );

  useEffect(() => {
    if (result) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [result, handleKeyDown]);

  if (!result) return null;

  const getPlayerName = (botId: string) => {
    return playerNames[botId] || "Player";
  };

  return (
    <AnimatePresence>
      {/* Backdrop overlay to reduce visual clutter */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onDismiss}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, y: -50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.9 }}
        className="fixed top-20 left-1/2 -translate-x-1/2 z-50"
      >
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 backdrop-blur-lg rounded-2xl border border-yellow-500/30 shadow-2xl shadow-yellow-500/10 p-6 min-w-[320px] max-w-[400px]">
          {/* Trophy header */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-3xl">🏆</span>
            <h3 className="text-xl font-bold text-white">
              Hand #{result.handNumber}
            </h3>
          </div>

          {/* Winners list */}
          <div className="space-y-3">
            {result.winners.map((winner, idx) => (
              <motion.div
                key={winner.botId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="flex items-center justify-between bg-black/30 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-black font-bold">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="text-white font-semibold">
                      {getPlayerName(winner.botId)}
                    </div>
                    <div className="text-muted text-sm">{winner.handName}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-bold text-lg">
                    +{formatAmount(winner.amount)}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Total pot */}
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-muted">Total Pot</span>
            <span className="text-yellow-400 font-bold text-lg">
              {formatAmount(result.pot)}
            </span>
          </div>

          {/* Provably Fair Info */}
          {result.provablyFair && (
            <ProvablyFairInfo
              data={result.provablyFair}
              handNumber={result.handNumber}
            />
          )}

          {/* Dismiss button */}
          <button
            onClick={onDismiss}
            className="mt-4 w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
            aria-label="Dismiss hand result and continue"
          >
            Continue
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 10000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString();
}
