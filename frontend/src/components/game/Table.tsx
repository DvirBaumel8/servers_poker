import { motion } from "framer-motion";
import clsx from "clsx";
import { PlayerSeat } from "./PlayerSeat";
import { CommunityCards } from "./CommunityCards";
import type { GameState } from "../../types";

interface TableProps {
  gameState: GameState;
  className?: string;
}

const SEAT_POSITIONS_9 = [
  { top: "72%", left: "50%" },      // Bottom center (hero position)
  { top: "68%", left: "18%" },      // Bottom left
  { top: "45%", left: "5%" },       // Left middle
  { top: "20%", left: "12%" },      // Top left
  { top: "12%", left: "35%" },      // Top left-center
  { top: "12%", left: "65%" },      // Top right-center
  { top: "20%", left: "88%" },      // Top right
  { top: "45%", left: "95%" },      // Right middle
  { top: "68%", left: "82%" },      // Bottom right
];

const BET_POSITIONS_9 = [
  { top: "68%", left: "50%" },
  { top: "65%", left: "28%" },
  { top: "50%", left: "20%" },
  { top: "35%", left: "25%" },
  { top: "28%", left: "40%" },
  { top: "28%", left: "60%" },
  { top: "35%", left: "75%" },
  { top: "50%", left: "80%" },
  { top: "65%", left: "72%" },
];

export function Table({ gameState, className }: TableProps) {
  const { players, communityCards, pot, stage, handNumber, status } = gameState;

  const getPositions = () => {
    const count = Math.max(players.length, 2);
    if (count <= 2) {
      return {
        seats: [
          { top: "85%", left: "50%" },  // Bottom - moved further down
          { top: "8%", left: "50%" },   // Top - moved further up
        ],
        bets: [
          { top: "70%", left: "50%" },
          { top: "25%", left: "50%" },
        ],
      };
    }
    if (count <= 6) {
      return {
        seats: [
          { top: "72%", left: "50%" },
          { top: "60%", left: "12%" },
          { top: "25%", left: "12%" },
          { top: "15%", left: "50%" },
          { top: "25%", left: "88%" },
          { top: "60%", left: "88%" },
        ],
        bets: [
          { top: "56%", left: "50%" },
          { top: "50%", left: "25%" },
          { top: "35%", left: "25%" },
          { top: "30%", left: "50%" },
          { top: "35%", left: "75%" },
          { top: "50%", left: "75%" },
        ],
      };
    }
    return { seats: SEAT_POSITIONS_9, bets: BET_POSITIONS_9 };
  };

  const { seats, bets } = getPositions();

  return (
    <div className={clsx("relative w-full max-w-5xl aspect-[16/10]", className)}>
      {/* Outer table shadow */}
      <div
        className="absolute inset-[3%] rounded-[50%]"
        style={{
          background: "linear-gradient(180deg, #0d3320 0%, #0a2518 100%)",
          boxShadow: `
            0 0 0 8px #5c3a21,
            0 0 0 12px #3d2614,
            0 0 0 14px #2a1a0e,
            0 15px 40px rgba(0, 0, 0, 0.6)
          `,
        }}
      >
        {/* Inner felt */}
        <div
          className="absolute inset-[3%] rounded-[50%]"
          style={{
            background: `
              radial-gradient(ellipse at 50% 30%, #1a5d3a 0%, #0f4528 40%, #0a3520 100%)
            `,
            boxShadow: "inset 0 0 80px rgba(0, 0, 0, 0.5)",
          }}
        >
          {/* Felt texture overlay */}
          <div
            className="absolute inset-0 rounded-[50%] opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }}
          />
        </div>
      </div>

      {/* Center content - higher z-index to show above bet chips */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
        {/* Game type / branding - positioned at top of center area */}
        <div className="text-white/15 text-xl font-bold tracking-widest absolute top-[25%]">
          NL HOLD'EM
        </div>

        {/* Community cards - centered */}
        <div className="mt-4">
          <CommunityCards cards={communityCards} stage={stage} />
        </div>

        {/* Pot display */}
        {pot > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="mt-3 flex flex-col items-center"
          >
            <div className="flex items-center gap-1 mb-1">
              <ChipStack size="sm" />
            </div>
            <div className="bg-black/60 px-4 py-1 rounded-full backdrop-blur-sm">
              <span className="text-gray-400 text-xs mr-1">Total Pot</span>
              <span className="text-yellow-400 font-bold">{formatAmount(pot)}</span>
            </div>
          </motion.div>
        )}

        {/* Hand info - positioned below pot */}
        {handNumber > 0 && status !== "waiting" && (
          <div className="mt-2 text-white/40 text-sm">
            Hand #{handNumber} • {formatStage(stage)}
          </div>
        )}

        {status === "waiting" && players.length < 2 && (
          <div className="text-white/50 text-lg mt-4">
            Waiting for players...
          </div>
        )}
      </div>

      {/* Players */}
      {players.map((player, index) => {
        const seatPos = seats[index % seats.length];
        const betPos = bets[index % bets.length];
        const isDealer = index === gameState.dealerPosition;
        const isActive = player.id === gameState.currentPlayerId;

        return (
          <div key={player.id || index}>
            {/* Player seat */}
            <div
              className="absolute z-20"
              style={{
                top: seatPos.top,
                left: seatPos.left,
                transform: "translate(-50%, -50%)",
              }}
            >
              <PlayerSeat
                player={player}
                isDealer={isDealer}
                isActive={isActive}
                showCards={stage === "showdown" || status === "finished"}
                seatIndex={index}
              />
            </div>

            {/* Bet amount */}
            {player.bet > 0 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute z-15 flex items-center gap-1"
                style={{
                  top: betPos.top,
                  left: betPos.left,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <ChipStack size="xs" />
                <span className="text-white text-sm font-semibold bg-black/40 px-2 py-0.5 rounded">
                  {formatAmount(player.bet)}
                </span>
              </motion.div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChipStack({ size = "sm" }: { size?: "xs" | "sm" | "md" }) {
  const sizeClasses = {
    xs: "w-4 h-4",
    sm: "w-5 h-5",
    md: "w-6 h-6",
  };

  return (
    <div className="flex -space-x-1">
      <div className={clsx("rounded-full bg-gradient-to-b from-red-400 to-red-600 border border-red-300 shadow", sizeClasses[size])} />
      <div className={clsx("rounded-full bg-gradient-to-b from-blue-400 to-blue-600 border border-blue-300 shadow", sizeClasses[size])} />
      <div className={clsx("rounded-full bg-gradient-to-b from-green-400 to-green-600 border border-green-300 shadow", sizeClasses[size])} />
    </div>
  );
}

function formatStage(stage: string): string {
  const stages: Record<string, string> = {
    "pre-flop": "Pre-Flop",
    flop: "Flop",
    turn: "Turn",
    river: "River",
    showdown: "Showdown",
    waiting: "Waiting",
  };
  return stages[stage] || stage;
}

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 10000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString();
}
