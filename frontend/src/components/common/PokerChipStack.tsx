import { motion } from "framer-motion";
import clsx from "clsx";

interface PokerChipStackProps {
  amount: number;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  showValue?: boolean;
  maxChips?: number;
}

const CHIP_DENOMINATIONS = [
  { value: 10000, color: "#FFD700", lineColor: "#B8860B" }, // Gold
  { value: 5000, color: "#9C27B0", lineColor: "#7B1FA2" }, // Purple
  { value: 1000, color: "#212121", lineColor: "#424242" }, // Black
  { value: 500, color: "#1E88E5", lineColor: "#1565C0" }, // Blue
  { value: 100, color: "#43A047", lineColor: "#2E7D32" }, // Green
  { value: 25, color: "#E53935", lineColor: "#C62828" }, // Red
  { value: 5, color: "#FAFAFA", lineColor: "#E0E0E0" }, // White
  { value: 1, color: "#8D6E63", lineColor: "#6D4C41" }, // Brown
];

const SIZES = {
  xs: 20,
  sm: 28,
  md: 40,
  lg: 56,
};

function PokerChip({
  value,
  color,
  lineColor,
  size,
  onClick,
}: {
  value: number;
  color: string;
  lineColor: string;
  size: number;
  onClick?: () => void;
}) {
  const innerSize = size * 0.68;
  const edgeWidth = Math.max(2, Math.round(size * 0.08));
  const accentWidth = Math.max(1, Math.round(size * 0.045));
  const fontSize = Math.max(7, Math.round(size * 0.16));
  const label = formatChipLabel(value);

  return (
    <div
      onClick={onClick}
      className={clsx(
        "relative grid place-items-center rounded-full shadow-[0_6px_16px_rgba(0,0,0,0.35)]",
        onClick && "cursor-pointer",
      )}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.28), transparent 35%), ${color}`,
        border: `${edgeWidth}px solid ${lineColor}`,
      }}
      aria-label={`Poker chip ${label}`}
    >
      <div
        className="absolute rounded-full border"
        style={{
          inset: edgeWidth + accentWidth,
          borderColor: lineColor,
          borderWidth: accentWidth,
        }}
      />
      {Array.from({ length: 8 }).map((_, index) => {
        const angle = index * 45;
        return (
          <div
            key={angle}
            className="absolute rounded-full"
            style={{
              width: edgeWidth * 1.2,
              height: size * 0.18,
              backgroundColor: "#ffffffcc",
              transform: `rotate(${angle}deg) translateY(${-(size / 2) + edgeWidth * 1.9}px)`,
              transformOrigin: "center center",
            }}
          />
        );
      })}
      <div
        className="relative grid place-items-center rounded-full border font-black text-black/80"
        style={{
          width: innerSize,
          height: innerSize,
          backgroundColor: "#ffffffd9",
          borderColor: `${lineColor}66`,
          fontSize,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function PokerChipStack({
  amount,
  size = "md",
  className,
  showValue = true,
  maxChips = 5,
}: PokerChipStackProps) {
  const chipSize = SIZES[size];

  const chips: Array<{
    value: number;
    color: string;
    lineColor: string;
    count: number;
  }> = [];
  let remaining = amount;

  for (const denom of CHIP_DENOMINATIONS) {
    const count = Math.floor(remaining / denom.value);
    if (count > 0) {
      chips.push({ ...denom, count: Math.min(count, 3) });
      remaining %= denom.value;
      if (chips.length >= maxChips) break;
    }
  }

  if (chips.length === 0 && amount > 0) {
    chips.push({ ...CHIP_DENOMINATIONS[CHIP_DENOMINATIONS.length - 1], count: 1 });
  }

  const totalChips = chips.reduce((sum, c) => sum + c.count, 0);
  const stackOffset = size === "xs" ? 2 : size === "sm" ? 3 : 4;

  return (
    <div className={clsx("flex flex-col items-center", className)}>
      <div
        className="relative"
        style={{
          height: chipSize + (totalChips - 1) * stackOffset,
          width: chipSize,
        }}
      >
        {chips.flatMap((chip, chipIndex) => {
          const prevChipsCount = chips
            .slice(0, chipIndex)
            .reduce((sum, c) => sum + c.count, 0);

          return Array.from({ length: chip.count }).map((_, i) => {
            const stackIndex = prevChipsCount + i;
            return (
              <motion.div
                key={`${chip.value}-${i}`}
                initial={{ scale: 0, y: -10 }}
                animate={{ scale: 1, y: 0 }}
                transition={{
                  delay: stackIndex * 0.03,
                  type: "spring",
                  stiffness: 400,
                  damping: 20,
                }}
                className="absolute"
                style={{
                  bottom: stackIndex * stackOffset,
                  left: 0,
                  zIndex: stackIndex,
                }}
              >
                <PokerChip
                  value={chip.value}
                  color={chip.color}
                  lineColor={chip.lineColor}
                  size={chipSize}
                />
              </motion.div>
            );
          });
        })}
      </div>

      {showValue && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-1 text-white font-bold drop-shadow"
          style={{
            fontSize: size === "xs" ? 10 : size === "sm" ? 11 : 13,
          }}
        >
          {formatAmount(amount)}
        </motion.span>
      )}
    </div>
  );
}

export function SingleChip({
  value,
  size = "md",
  onClick,
}: {
  value: number;
  size?: "xs" | "sm" | "md" | "lg";
  onClick?: () => void;
}) {
  const chipSize = SIZES[size];

  const denom =
    CHIP_DENOMINATIONS.find((d) => d.value <= value) ||
    CHIP_DENOMINATIONS[CHIP_DENOMINATIONS.length - 1];

  return (
    <motion.div
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={onClick ? "cursor-pointer" : undefined}
    >
      <PokerChip
        value={value}
        color={denom.color}
        lineColor={denom.lineColor}
        size={chipSize}
        onClick={onClick}
      />
    </motion.div>
  );
}

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString();
}

function formatChipLabel(value: number): string {
  if (value >= 1000) {
    return `${value / 1000}K`;
  }
  return value.toString();
}
