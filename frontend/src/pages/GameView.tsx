import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Table } from "../components/game/Table";
import { useWebSocket } from "../hooks/useWebSocket";

export function GameView() {
  const { tableId } = useParams<{ tableId: string }>();
  const { connected, error, gameState } = useWebSocket(tableId);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Connection Error
          </h2>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!connected || !gameState) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-poker-gold mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-white">Connecting to table...</h2>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center"
    >
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-bold text-white">
          Table {tableId?.substring(0, 8)}
        </h1>
        <p className="text-gray-400">
          {gameState.status === "running" ? "Game in progress" : "Waiting for players"}
        </p>
      </div>

      <div className="flex items-center justify-center w-full">
        <Table gameState={gameState} />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 text-center">
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Blinds</div>
          <div className="text-white font-bold">
            {gameState.blinds.small} / {gameState.blinds.big}
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Pot</div>
          <div className="text-poker-gold font-bold">
            {gameState.pot.toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Hand</div>
          <div className="text-white font-bold">#{gameState.handNumber}</div>
        </div>
      </div>
    </motion.div>
  );
}
