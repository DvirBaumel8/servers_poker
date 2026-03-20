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
        "bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden",
        className,
      )}
    >
      <table className="w-full">
        <thead>
          <tr className="bg-gray-900/50">
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
              Rank
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
              Bot
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
              Chips
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {entries.map((entry, index) => (
            <tr
              key={entry.botId}
              className={clsx(
                "hover:bg-gray-700/50 transition-colors",
                entry.busted && "opacity-50",
              )}
            >
              <td className="px-4 py-3">
                <span
                  className={clsx(
                    "font-bold",
                    index === 0 && "text-yellow-400",
                    index === 1 && "text-gray-300",
                    index === 2 && "text-amber-600",
                    index > 2 && "text-gray-400",
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
                  <span className="text-red-400 text-sm">Busted</span>
                ) : (
                  <span className="text-green-400 text-sm">Active</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
