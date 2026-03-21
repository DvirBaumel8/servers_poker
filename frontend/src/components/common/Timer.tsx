import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { TIMER_INTERVAL_MS } from "../../utils/timing";

interface TimerProps {
  duration: number;
  onExpire?: () => void;
  paused?: boolean;
  className?: string;
}

export function Timer({
  duration,
  onExpire,
  paused = false,
  className,
}: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    setTimeLeft(duration);
  }, [duration]);

  useEffect(() => {
    if (paused || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          onExpire?.();
          return 0;
        }
        return t - 1;
      });
    }, TIMER_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [paused, timeLeft, onExpire]);

  const progress = timeLeft / duration;
  const isLow = progress < 0.3;
  const isCritical = progress < 0.1;

  return (
    <div className={clsx("timer-countdown relative w-16 h-16", className)}>
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="4"
        />
        <motion.circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke={isCritical ? "#ef4444" : isLow ? "#f59e0b" : "#22c55e"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 28}
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - progress) }}
          transition={{ duration: 0.5 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={clsx(
            "font-bold text-lg",
            isCritical
              ? "text-red-500"
              : isLow
                ? "text-yellow-500"
                : "text-white",
          )}
        >
          {timeLeft}
        </span>
      </div>
    </div>
  );
}
