import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import type { Tournament } from "../../types";

interface TournamentCardProps {
  tournament: Tournament;
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  registering: "bg-green-500",
  running: "bg-blue-500",
  final_table: "bg-purple-500",
  finished: "bg-gray-500",
  cancelled: "bg-red-500",
};

export function TournamentCard({ tournament, className }: TournamentCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={clsx(
        "bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700",
        "p-6 hover:border-poker-gold transition-colors",
        className
      )}
    >
      <Link to={`/tournaments/${tournament.id}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">{tournament.name}</h3>
            <span className="text-sm text-gray-400 capitalize">
              {tournament.type}
            </span>
          </div>
          <span
            className={clsx(
              "px-3 py-1 rounded-full text-xs font-medium text-white",
              STATUS_COLORS[tournament.status]
            )}
          >
            {tournament.status.replace("_", " ").toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Buy-in</span>
            <p className="text-poker-gold font-bold">
              {tournament.buyIn.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Starting Stack</span>
            <p className="text-white font-medium">
              {tournament.startingChips.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Players</span>
            <p className="text-white font-medium">
              {tournament.entriesCount} / {tournament.maxPlayers}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Table Size</span>
            <p className="text-white font-medium">
              {tournament.playersPerTable}-max
            </p>
          </div>
        </div>

        {tournament.scheduledStartAt && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <span className="text-gray-400 text-sm">Starts</span>
            <p className="text-white">
              {new Date(tournament.scheduledStartAt).toLocaleString()}
            </p>
          </div>
        )}
      </Link>
    </motion.div>
  );
}
