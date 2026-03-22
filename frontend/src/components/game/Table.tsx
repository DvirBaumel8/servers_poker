import { motion } from "framer-motion";
import clsx from "clsx";
import { useMemo } from "react";
import { PlayerSeat } from "./PlayerSeat";
import { CommunityCards } from "./CommunityCards";
import { WinnerAnimation } from "./WinnerAnimation";
import { PokerChipStack } from "../common/PokerChipStack";
import type { GameState, HandResult } from "../../types";

interface TableProps {
  gameState: GameState;
  className?: string;
  playerActions?: Record<
    string,
    { type: string; amount?: number; timestamp: number }
  >;
  turnStartTime?: number;
  turnTimeoutMs?: number;
  handResult?: HandResult | null;
  onHandResultComplete?: () => void;
  playerNames?: Record<string, string>;
}

const SEAT_POSITIONS_9 = [
  { top: "80%", left: "50%" }, // Bottom center (hero position) - pushed down
  { top: "72%", left: "16%" }, // Bottom left - adjusted
  { top: "48%", left: "4%" }, // Left middle - moved out more
  { top: "18%", left: "10%" }, // Top left - moved up and out
  { top: "6%", left: "35%" }, // Top left-center - pushed up
  { top: "6%", left: "65%" }, // Top right-center - pushed up
  { top: "18%", left: "90%" }, // Top right - moved up and out
  { top: "48%", left: "96%" }, // Right middle - moved out more
  { top: "72%", left: "84%" }, // Bottom right - adjusted
];

const BET_POSITIONS_9 = [
  { top: "66%", left: "50%" }, // Bottom center
  { top: "62%", left: "28%" }, // Bottom left
  { top: "48%", left: "18%" }, // Left middle
  { top: "32%", left: "22%" }, // Top left
  { top: "24%", left: "40%" }, // Top left-center
  { top: "24%", left: "60%" }, // Top right-center
  { top: "32%", left: "78%" }, // Top right
  { top: "48%", left: "82%" }, // Right middle
  { top: "62%", left: "72%" }, // Bottom right
];

export function Table({
  gameState,
  className,
  playerActions = {},
  turnStartTime,
  turnTimeoutMs = 10000,
  handResult,
  onHandResultComplete,
  playerNames = {},
}: TableProps) {
  const { players, communityCards, pot, stage, handNumber, status, blinds } =
    gameState;

  const getPositions = () => {
    const count = Math.max(players.length, 2);
    if (count <= 2) {
      return {
        seats: [
          { top: "82%", left: "50%" }, // Bottom player - clear of center content
          { top: "3%", left: "50%" }, // Top player
        ],
        bets: [
          { top: "68%", left: "50%" }, // Bottom player's bet - between player and pot
          { top: "20%", left: "50%" }, // Top player's bet
        ],
      };
    }
    if (count <= 4) {
      return {
        seats: [
          { top: "78%", left: "50%" }, // Bottom center - pushed down for clearance
          { top: "50%", left: "8%" }, // Left - moved out more
          { top: "8%", left: "50%" }, // Top center - pushed up for clearance
          { top: "50%", left: "92%" }, // Right - moved out more
        ],
        bets: [
          { top: "62%", left: "50%" },
          { top: "50%", left: "22%" },
          { top: "25%", left: "50%" },
          { top: "50%", left: "78%" },
        ],
      };
    }
    if (count <= 6) {
      return {
        seats: [
          { top: "78%", left: "50%" }, // Bottom center
          { top: "65%", left: "10%" }, // Bottom left - moved out
          { top: "25%", left: "10%" }, // Top left - moved out
          { top: "8%", left: "50%" }, // Top center
          { top: "25%", left: "90%" }, // Top right - moved out
          { top: "65%", left: "90%" }, // Bottom right - moved out
        ],
        bets: [
          { top: "62%", left: "50%" },
          { top: "55%", left: "24%" },
          { top: "35%", left: "24%" },
          { top: "25%", left: "50%" },
          { top: "35%", left: "76%" },
          { top: "55%", left: "76%" },
        ],
      };
    }
    return { seats: SEAT_POSITIONS_9, bets: BET_POSITIONS_9 };
  };

  const { seats, bets } = getPositions();

  // Find winner position for chip animation
  const winnerPosition = useMemo(() => {
    if (!handResult || !handResult.winners.length) return null;
    const winnerId = handResult.winners[0].botId;
    const winnerIndex = players.findIndex((p) => p.id === winnerId);
    if (winnerIndex === -1) return null;
    return seats[winnerIndex % seats.length];
  }, [handResult, players, seats]);

  return (
    <div
      className={clsx(
        "poker-table relative w-full max-w-5xl aspect-[16/10]",
        className,
      )}
    >
      {/* Winner animation overlay */}
      <WinnerAnimation
        result={handResult || null}
        winnerPosition={winnerPosition}
        onComplete={onHandResultComplete || (() => {})}
        playerNames={playerNames}
      />

      {/* Wood rail */}
      <div
        className="absolute inset-[2%] rounded-[50%]"
        style={{
          background:
            "linear-gradient(180deg, #6b3a1f 0%, #4a2812 30%, #3a1f0d 70%, #2d180a 100%)",
          boxShadow: `
            0 0 0 3px #1a0f06,
            0 0 0 5px rgba(107,58,31,0.3),
            0 20px 60px rgba(0, 0, 0, 0.7),
            inset 0 2px 4px rgba(255,255,255,0.1)
          `,
        }}
      >
        {/* Felt surface */}
        <div
          className="absolute inset-[5%] rounded-[50%]"
          style={{
            background:
              "radial-gradient(ellipse at 50% 35%, #1b6b44 0%, #145536 30%, #0e4129 60%, #092e1e 100%)",
            boxShadow:
              "inset 0 0 60px rgba(0,0,0,0.4), inset 0 -10px 30px rgba(0,0,0,0.2), 0 0 0 2px #0a2e1e",
          }}
        >
          {/* Subtle felt texture */}
          <div
            className="absolute inset-0 rounded-[50%] opacity-[0.08]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }}
          />

          {/* Inner rail line */}
          <div
            className="absolute inset-[1%] rounded-[50%]"
            style={{
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          />
        </div>
      </div>

      {/* Center content - z-index 10 to stay below players but above table */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
        {/* Community cards - centered in the middle of the table */}
        <div className="absolute top-[38%]">
          <CommunityCards cards={communityCards} stage={stage} />
        </div>

        {/* Hand info - always visible below cards */}
        {handNumber > 0 && status !== "waiting" && (
          <div className="absolute top-[52%] text-white/50 text-sm font-medium tracking-wide">
            Hand #{handNumber} • {formatStage(stage)}
          </div>
        )}

        {/* Pot display - prominent center display */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-[56%] flex flex-col items-center"
        >
          <div
            className="rounded-2xl px-6 py-3 backdrop-blur-xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(20,30,20,0.8) 100%)",
              border: "2px solid rgba(201,162,39,0.4)",
              boxShadow:
                "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            <div className="text-center text-[11px] uppercase tracking-[0.25em] text-amber-200/70 mb-1">
              Pot
            </div>
            <div className="flex items-center justify-center gap-2">
              <PokerChipStack amount={pot} size="sm" showValue={false} />
              <span
                className="text-2xl font-bold"
                style={{
                  color: "#c9a227",
                  textShadow: "0 2px 4px rgba(0,0,0,0.5)",
                }}
              >
                {formatAmount(pot)}
              </span>
            </div>
          </div>
        </motion.div>

        {status === "waiting" && players.length < 2 && (
          <div className="absolute top-[50%] text-white/50 text-lg">
            Waiting for players...
          </div>
        )}

        {/* Blinds indicator - top left of table */}
        {blinds && (blinds.small > 0 || blinds.big > 0) && (
          <div className="absolute top-[12%] left-[12%]">
            <div
              className="rounded-xl px-3.5 py-2 backdrop-blur-sm"
              style={{
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-0.5">
                Blinds
              </div>
              <div className="text-base font-semibold text-white">
                {formatAmount(blinds.small)}/{formatAmount(blinds.big)}
              </div>
            </div>
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
              className="absolute z-30"
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
                lastAction={playerActions[player.id]}
                turnStartTime={isActive ? turnStartTime : undefined}
                turnTimeoutMs={turnTimeoutMs}
              />
            </div>

            {/* Bet amount */}
            {player.bet > 0 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bet-display absolute z-15 flex items-center gap-1"
                style={{
                  top: betPos.top,
                  left: betPos.left,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="rounded-2xl border border-white/8 bg-black/35 px-3 py-2 backdrop-blur-xl">
                  <PokerChipStack
                    amount={player.bet}
                    size="xs"
                    showValue={false}
                  />
                  <div className="mt-1 text-center text-xs font-semibold text-white">
                    {formatAmount(player.bet)}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        );
      })}
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
