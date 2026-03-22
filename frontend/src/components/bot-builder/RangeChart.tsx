import { useState, useCallback } from "react";
import {
  useBotBuilderStore,
  type RangeAction,
} from "../../stores/botBuilderStore";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

const ACTION_COLORS: Record<string, string> = {
  raise: "bg-red-500/70 hover:bg-red-500/90",
  call: "bg-green-500/70 hover:bg-green-500/90",
  fold: "bg-gray-600/70 hover:bg-gray-600/90",
};

const ACTION_LABELS: Record<string, string> = {
  raise: "R",
  call: "C",
  fold: "F",
};

function getHandNotation(row: number, col: number): string {
  if (row === col) return `${RANKS[row]}${RANKS[col]}`;
  if (row < col) return `${RANKS[row]}${RANKS[col]}s`;
  return `${RANKS[col]}${RANKS[row]}o`;
}

function getHandType(row: number, col: number): "pair" | "suited" | "offsuit" {
  if (row === col) return "pair";
  if (row < col) return "suited";
  return "offsuit";
}

export function RangeChart() {
  const { rangeChart, setRangeAction } = useBotBuilderStore();
  const [paintAction, setPaintAction] = useState<RangeAction>("raise");
  const [isPainting, setIsPainting] = useState(false);

  const handleCellClick = useCallback(
    (hand: string) => {
      const current = rangeChart[hand];
      if (current === paintAction) {
        setRangeAction(hand, null);
      } else {
        setRangeAction(hand, paintAction);
      }
    },
    [rangeChart, paintAction, setRangeAction],
  );

  const handleMouseDown = useCallback(
    (hand: string) => {
      setIsPainting(true);
      handleCellClick(hand);
    },
    [handleCellClick],
  );

  const handleMouseEnter = useCallback(
    (hand: string) => {
      if (isPainting) {
        setRangeAction(hand, paintAction);
      }
    },
    [isPainting, paintAction, setRangeAction],
  );

  const filled = Object.values(rangeChart).filter((v) => v !== null).length;
  const raiseCount = Object.values(rangeChart).filter(
    (v) => v === "raise",
  ).length;
  const callCount = Object.values(rangeChart).filter(
    (v) => v === "call",
  ).length;
  const foldCount = Object.values(rangeChart).filter(
    (v) => v === "fold",
  ).length;

  return (
    <div
      className="space-y-4"
      onMouseUp={() => setIsPainting(false)}
      onMouseLeave={() => setIsPainting(false)}
    >
      <div className="flex items-center gap-4 mb-3">
        <span className="text-sm text-[var(--text-secondary)]">
          Paint mode:
        </span>
        {(["raise", "call", "fold"] as const).map((action) => (
          <button
            key={action}
            onClick={() => setPaintAction(action)}
            className={`px-3 py-1 rounded text-xs font-medium transition-all
              ${
                paintAction === action
                  ? `${ACTION_COLORS[action]} text-white ring-2 ring-white/30`
                  : "bg-[var(--surface-light)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
          >
            {action.charAt(0).toUpperCase() + action.slice(1)}
          </button>
        ))}
        <span className="text-xs text-[var(--text-subtle)] ml-auto">
          {filled}/169 hands defined
        </span>
      </div>

      <div
        className="grid gap-[2px] select-none"
        style={{ gridTemplateColumns: `repeat(14, 1fr)` }}
      >
        {/* Header row */}
        <div />
        {RANKS.map((rank) => (
          <div
            key={`header-${rank}`}
            className="text-center text-[10px] font-mono text-[var(--text-muted)] py-0.5"
          >
            {rank}
          </div>
        ))}

        {/* Grid rows */}
        {RANKS.map((_, row) => (
          <>
            <div
              key={`row-label-${row}`}
              className="text-center text-[10px] font-mono text-[var(--text-muted)] flex items-center justify-center"
            >
              {RANKS[row]}
            </div>
            {RANKS.map((_, col) => {
              const hand = getHandNotation(row, col);
              const action = rangeChart[hand];
              const type = getHandType(row, col);
              const bgClass = action
                ? ACTION_COLORS[action]
                : type === "pair"
                  ? "bg-[var(--surface-elevated)] hover:bg-[var(--surface-elevated)]/80"
                  : type === "suited"
                    ? "bg-[var(--surface-light)] hover:bg-[var(--surface-light)]/80"
                    : "bg-[var(--surface)] hover:bg-[var(--surface-light)]/50";

              return (
                <button
                  key={hand}
                  onMouseDown={() => handleMouseDown(hand)}
                  onMouseEnter={() => handleMouseEnter(hand)}
                  className={`aspect-square rounded-sm text-[9px] font-mono flex items-center justify-center
                    cursor-pointer transition-colors ${bgClass}
                    ${action ? "text-white font-bold" : "text-[var(--text-subtle)]"}`}
                  title={`${hand}: ${action || "not set"}`}
                >
                  {action ? ACTION_LABELS[action] : hand.replace(/[so]$/, "")}
                </button>
              );
            })}
          </>
        ))}
      </div>

      <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-500/70" /> Raise:{" "}
          {raiseCount}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-500/70" /> Call:{" "}
          {callCount}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gray-600/70" /> Fold:{" "}
          {foldCount}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[var(--surface-light)]" /> Not
          set: {169 - filled}
        </span>
      </div>
    </div>
  );
}
