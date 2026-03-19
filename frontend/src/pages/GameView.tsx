import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Table } from "../components/game/Table";
import { useWebSocket } from "../hooks/useWebSocket";
import clsx from "clsx";

export function GameView() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { connected, error, gameState, gameFinished } = useWebSocket(tableId);

  if (error) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: "linear-gradient(180deg, #0a1628 0%, #0d1f35 50%, #0a1628 100%)" }}
      >
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-white mb-2">Connection Error</h2>
          <p className="text-gray-400">{error}</p>
          <button
            onClick={() => navigate("/tables")}
            className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors"
          >
            Back to Tables
          </button>
        </div>
      </div>
    );
  }

  if (!connected || !gameState) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: "linear-gradient(180deg, #0a1628 0%, #0d1f35 50%, #0a1628 100%)" }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-green-500/30 border-t-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white">Loading table...</h2>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(180deg, #0a1628 0%, #0d1f35 50%, #0a1628 100%)",
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => navigate("/tables")}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm">Back to Tables</span>
        </button>

        <div className="flex items-center gap-4">
          <StatusBadge status={gameState.status} />
          {gameFinished && (
            <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
              <span>🏆</span>
              Winner: {gameFinished.winnerName || "Unknown"}
            </div>
          )}
        </div>
      </div>

      {/* Main table area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center px-4 pt-4 pb-8"
        style={{ minHeight: "calc(100vh - 140px)" }}
      >
        <Table gameState={gameState} />
      </motion.div>

      {/* Bottom info bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-8 bg-black/60 backdrop-blur-md rounded-2xl px-8 py-4 border border-white/10">
            <InfoItem
              label="Blinds"
              value={`${formatAmount(gameState.blinds?.small || 0)}/${formatAmount(gameState.blinds?.big || 0)}`}
            />
            <Divider />
            <InfoItem label="Pot" value={formatAmount(gameState.pot)} highlight />
            <Divider />
            <InfoItem label="Hand" value={`#${gameState.handNumber}`} />
            <Divider />
            <InfoItem
              label="Players"
              value={`${gameState.players.filter((p) => !p.folded && !p.disconnected).length}/${gameState.players.length}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    waiting: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-400", label: "Waiting" },
    playing: { bg: "bg-green-500/10", text: "text-green-400", dot: "bg-green-400", label: "Live" },
    running: { bg: "bg-green-500/10", text: "text-green-400", dot: "bg-green-400", label: "Live" },
    finished: { bg: "bg-gray-500/10", text: "text-gray-400", dot: "bg-gray-400", label: "Finished" },
    paused: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400", label: "Paused" },
  };

  const { bg, text, dot, label } = config[status] || config.waiting;

  return (
    <span className={clsx("flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium", bg, text)}>
      <span className={clsx("w-2 h-2 rounded-full animate-pulse", dot)} />
      {label}
    </span>
  );
}

function InfoItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">{label}</div>
      <div className={clsx("font-bold text-lg", highlight ? "text-yellow-400" : "text-white")}>{value}</div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-8 bg-gray-700" />;
}

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toString();
}
