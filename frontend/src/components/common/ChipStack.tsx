import { motion } from "framer-motion";
import clsx from "clsx";

interface ChipStackProps {
  amount: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const CHIP_COLORS = [
  { value: 10000, color: "bg-yellow-400", border: "border-yellow-600" },
  { value: 5000, color: "bg-purple-500", border: "border-purple-700" },
  { value: 1000, color: "bg-gray-800", border: "border-gray-600" },
  { value: 500, color: "bg-blue-500", border: "border-blue-700" },
  { value: 100, color: "bg-green-500", border: "border-green-700" },
  { value: 25, color: "bg-red-500", border: "border-red-700" },
  { value: 5, color: "bg-white", border: "border-gray-300" },
];

const SIZES = {
  sm: { chip: "w-6 h-6", text: "text-xs" },
  md: { chip: "w-8 h-8", text: "text-sm" },
  lg: { chip: "w-12 h-12", text: "text-base" },
};

export function ChipStack({ amount, size = "md", className }: ChipStackProps) {
  const { chip: chipSize } = SIZES[size];

  const chips = [];
  let remaining = amount;

  for (const { value, color, border } of CHIP_COLORS) {
    const count = Math.floor(remaining / value);
    if (count > 0) {
      chips.push({ value, color, border, count: Math.min(count, 5) });
      remaining -= count * value;
    }
  }

  return (
    <div className={clsx("flex flex-col items-center", className)}>
      <div className="relative flex flex-col-reverse">
        {chips.slice(0, 4).map((chip, i) =>
          Array.from({ length: chip.count }).map((_, j) => (
            <motion.div
              key={`${chip.value}-${j}`}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: -i * 4, opacity: 1 }}
              transition={{ delay: (i * chip.count + j) * 0.02 }}
              className={clsx(
                "rounded-full border-2 shadow-md",
                chipSize,
                chip.color,
                chip.border,
                "absolute"
              )}
              style={{ bottom: (i * chip.count + j) * 4 }}
            />
          ))
        )}
      </div>
      <span className="mt-2 text-white font-bold text-sm">
        {formatChips(amount)}
      </span>
    </div>
  );
}

function formatChips(amount: number): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return amount.toString();
}
