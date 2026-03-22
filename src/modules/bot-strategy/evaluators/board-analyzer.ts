/**
 * BoardAnalyzer: Computes board-related condition fields from community cards.
 *
 * Analyzes board texture: dry, wet, monotone, paired.
 */

import type { BoardTexture } from "../../../domain/bot-strategy/strategy.types";
import { parseCardString, type ParsedCard } from "./hand-analyzer";

export interface BoardAnalysis {
  boardTexture: BoardTexture | null;
  communityCardCount: number;
}

/**
 * Reexport parseCardString for use in the module.
 * This is also exported from hand-analyzer but needed independently.
 */
export { parseCardString } from "./hand-analyzer";

export function analyzeBoard(communityCards: string[]): BoardAnalysis {
  if (communityCards.length === 0) {
    return { boardTexture: null, communityCardCount: 0 };
  }

  const cards = communityCards.map(parseCardString);

  return {
    boardTexture: classifyBoardTexture(cards),
    communityCardCount: cards.length,
  };
}

function classifyBoardTexture(cards: ParsedCard[]): BoardTexture {
  if (cards.length < 3) return "dry";

  const suitCounts: Record<string, number> = {};
  for (const card of cards) {
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  }
  const maxSuitCount = Math.max(...Object.values(suitCounts));

  // Monotone: all (or almost all on turn/river) cards same suit
  if (maxSuitCount >= 3 && maxSuitCount >= cards.length - 1) {
    return "monotone";
  }

  const valueCounts: Record<number, number> = {};
  for (const card of cards) {
    valueCounts[card.value] = (valueCounts[card.value] || 0) + 1;
  }
  const hasPair = Object.values(valueCounts).some((c) => c >= 2);

  if (hasPair) {
    return "paired";
  }

  const values = [...new Set(cards.map((c) => c.value))].sort((a, b) => a - b);
  const connectivity = computeConnectivity(values);
  const flushDrawPossible = maxSuitCount >= 2;

  // Wet: high connectivity (cards are close in value) or flush draw possible
  if (connectivity >= 2 || (flushDrawPossible && connectivity >= 1)) {
    return "wet";
  }

  return "dry";
}

/**
 * How many straight draws are possible on this board.
 * Counts adjacent/near-adjacent value pairs.
 */
function computeConnectivity(sortedValues: number[]): number {
  let connections = 0;
  for (let i = 0; i < sortedValues.length - 1; i++) {
    const gap = sortedValues[i + 1] - sortedValues[i];
    if (gap <= 2) connections++;
  }

  // Ace-low connectivity (A-2, A-3)
  if (sortedValues.includes(14) && sortedValues.some((v) => v <= 3)) {
    connections++;
  }

  return connections;
}
