import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import type { ProvablyFairData } from "../../types";
import { COPY_FEEDBACK_MS } from "../../utils/timing";

interface ProvablyFairInfoProps {
  data: ProvablyFairData;
  handNumber?: number;
}

export function ProvablyFairInfo({ data }: ProvablyFairInfoProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
  };

  const verifyLocally = () => {
    const verificationData = {
      serverSeed: data.serverSeed,
      serverSeedHash: data.serverSeedHash,
      clientSeed: data.clientSeed,
      nonce: data.nonce,
      deckOrder: data.deckOrder,
    };
    copyToClipboard(JSON.stringify(verificationData, null, 2), "verification");
  };

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors w-full"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse provably fair details" : "Expand provably fair details"}
      >
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span className="flex items-center gap-1">
          <span className="text-green-400">✓</span>
          Provably Fair
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 text-xs">
              <SeedRow
                label="Server Seed Hash"
                value={data.serverSeedHash}
                onCopy={() => copyToClipboard(data.serverSeedHash, "hash")}
                copied={copied === "hash"}
              />
              <SeedRow
                label="Server Seed"
                value={data.serverSeed}
                onCopy={() => copyToClipboard(data.serverSeed, "seed")}
                copied={copied === "seed"}
              />
              <SeedRow
                label="Client Seed"
                value={data.clientSeed}
                onCopy={() => copyToClipboard(data.clientSeed, "client")}
                copied={copied === "client"}
              />
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-dark">Nonce (Hand #)</span>
                <span className="text-muted-light font-mono">{data.nonce}</span>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={verifyLocally}
                  className="flex-1 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded text-xs font-medium transition-colors"
                  aria-label="Copy verification data to clipboard"
                >
                  {copied === "verification"
                    ? "Copied!"
                    : "Copy Verification Data"}
                </button>
                <a
                  href="/api/v1/games/provably-fair/info"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded text-xs font-medium transition-colors text-center"
                >
                  How It Works
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SeedRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1 group">
      <span className="text-muted-dark">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-muted-light font-mono truncate max-w-[140px]">
          {value.slice(0, 12)}...{value.slice(-8)}
        </span>
        <button
          onClick={onCopy}
          className="text-muted-dark hover:text-white transition-colors"
          aria-label={`Copy ${label} to clipboard`}
        >
          {copied ? (
            <svg
              className="w-4 h-4 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
