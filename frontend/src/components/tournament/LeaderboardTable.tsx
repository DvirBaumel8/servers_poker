import clsx from "clsx";
import type { TournamentEntry } from "../../types";

interface LeaderboardTableProps {
  entries: TournamentEntry[];
  className?: string;
}

export function LeaderboardTable({
  entries,
  className,
}: LeaderboardTableProps) {
  return (
    <div
      className={clsx(
        "overflow-hidden rounded-3xl border border-white/8 bg-[linear-gradient(180deg,rgba(24,35,52,0.82),rgba(12,18,30,0.9))] shadow-panel",
        className,
      )}
    >
      <table className="w-full">
        <thead>
          <tr className="bg-black/10">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Rank
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Bot
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Chips
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/6">
          {entries.map((entry, index) => (
            <tr
              key={entry.botId}
              className={clsx(
                "transition-colors hover:bg-white/[0.03]",
                entry.busted && "opacity-50",
              )}
            >
              <td className="px-4 py-3">
                <span
                  className={clsx(
                    "font-bold",
                    index === 0 && "text-yellow-400",
                    index === 1 && "text-muted-light",
                    index === 2 && "text-amber-600",
                    index > 2 && "text-slate-400",
                  )}
                >
                  #{entry.position}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-white font-medium">{entry.botName}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-poker-gold font-bold">
                  {entry.chips.toLocaleString()}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                {entry.busted ? (
                  <span className="text-sm text-red-300">Busted</span>
                ) : (
                  <span className="text-sm text-emerald-300">Active</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
