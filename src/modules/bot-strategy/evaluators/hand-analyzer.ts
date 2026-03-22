/**
 * HandAnalyzer: Computes hand-related condition fields from game state.
 *
 * Takes the bot payload (hole cards, community cards, best hand) and computes:
 * - handStrength, pairType, hasFlushDraw, hasStraightDraw, holeCardRank
 */

import type {
  HandStrength,
  PairType,
  HoleCardRank,
} from "../../../domain/bot-strategy/strategy.types";
import { RANK_VALUES } from "../../../domain/deck";

const HAND_NAME_TO_STRENGTH: Record<string, HandStrength> = {
  HIGH_CARD: "high_card",
  ONE_PAIR: "pair",
  TWO_PAIR: "two_pair",
  THREE_OF_A_KIND: "trips",
  STRAIGHT: "straight",
  FLUSH: "flush",
  FULL_HOUSE: "full_house",
  FOUR_OF_A_KIND: "quads",
  STRAIGHT_FLUSH: "straight_flush",
  ROYAL_FLUSH: "royal_flush",
};

export interface ParsedCard {
  rank: string;
  suit: string;
  value: number;
}

export interface HandAnalysis {
  handStrength: HandStrength;
  pairType: PairType | null;
  hasFlushDraw: boolean;
  hasStraightDraw: boolean;
  holeCardRank: HoleCardRank;
}

export function parseCardString(cardStr: string): ParsedCard {
  const chars = [...cardStr];
  const suit = chars.pop() || "?";
  const rank = chars.join("");
  return { rank, suit, value: RANK_VALUES[rank] || 0 };
}

export function analyzeHand(
  holeCards: string[],
  communityCards: string[],
  bestHandName?: string,
): HandAnalysis {
  const hole = holeCards.map(parseCardString);
  const community = communityCards.map(parseCardString);
  const allCards = [...hole, ...community];

  return {
    handStrength: computeHandStrength(bestHandName, hole, community),
    pairType: computePairType(hole, community, bestHandName),
    hasFlushDraw: detectFlushDraw(hole, allCards),
    hasStraightDraw: detectStraightDraw(hole, allCards),
    holeCardRank: classifyHoleCards(hole),
  };
}

function computeHandStrength(
  bestHandName: string | undefined,
  hole: ParsedCard[],
  community: ParsedCard[],
): HandStrength {
  if (bestHandName && HAND_NAME_TO_STRENGTH[bestHandName]) {
    return HAND_NAME_TO_STRENGTH[bestHandName];
  }

  if (community.length === 0) {
    if (hole.length === 2 && hole[0].value === hole[1].value) {
      return "pair";
    }
    return "high_card";
  }

  return "high_card";
}

function computePairType(
  hole: ParsedCard[],
  community: ParsedCard[],
  bestHandName?: string,
): PairType | null {
  if (community.length === 0) {
    if (hole.length === 2 && hole[0].value === hole[1].value) {
      return "pocket_pair";
    }
    return null;
  }

  if (!bestHandName || bestHandName === "HIGH_CARD") {
    return null;
  }

  if (bestHandName !== "ONE_PAIR") {
    return null;
  }

  if (hole.length === 2 && hole[0].value === hole[1].value) {
    const boardValues = community.map((c) => c.value).sort((a, b) => b - a);
    if (hole[0].value > boardValues[0]) {
      return "overpair";
    }
    return "pocket_pair";
  }

  const boardValues = community.map((c) => c.value).sort((a, b) => b - a);
  for (const hc of hole) {
    if (community.some((bc) => bc.value === hc.value)) {
      if (hc.value === boardValues[0]) return "top_pair";
      if (boardValues.length >= 2 && hc.value === boardValues[1])
        return "middle_pair";
      return "low_pair";
    }
  }

  return null;
}

function detectFlushDraw(hole: ParsedCard[], allCards: ParsedCard[]): boolean {
  if (allCards.length < 4) return false;

  const suitCounts: Record<string, number> = {};
  for (const card of allCards) {
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  }

  for (const [suit, count] of Object.entries(suitCounts)) {
    if (count === 4 && hole.some((h) => h.suit === suit)) {
      return true;
    }
  }

  return false;
}

function detectStraightDraw(
  hole: ParsedCard[],
  allCards: ParsedCard[],
): boolean {
  if (allCards.length < 4) return false;

  const uniqueValues = [...new Set(allCards.map((c) => c.value))].sort(
    (a, b) => a - b,
  );
  const holeValues = new Set(hole.map((h) => h.value));

  // Also consider Ace as 1 for wheel draws
  if (uniqueValues.includes(14)) {
    uniqueValues.unshift(1);
  }

  // Open-ended straight draw: 4 consecutive values where at least one is a hole card
  for (let i = 0; i <= uniqueValues.length - 4; i++) {
    const window = uniqueValues.slice(i, i + 4);
    if (window[3] - window[0] === 3) {
      const hasHoleCard = window.some(
        (v) => holeValues.has(v) || (v === 1 && holeValues.has(14)),
      );
      if (hasHoleCard) return true;
    }
  }

  // Gutshot: 4 values within a span of 5 where one gap exists
  for (let i = 0; i <= uniqueValues.length - 4; i++) {
    const window = uniqueValues.slice(i, i + 4);
    if (window[3] - window[0] === 4) {
      const hasHoleCard = window.some(
        (v) => holeValues.has(v) || (v === 1 && holeValues.has(14)),
      );
      if (hasHoleCard) return true;
    }
  }

  return false;
}

/**
 * Classify starting hand strength.
 * Premium: AA, KK, QQ, AKs
 * Strong: JJ-99, AK, AQs, AJs, KQs
 * Playable: 88-22, suited connectors (T9s-54s), suited aces, KQo, QJo, JTo
 * Weak: everything else
 */
export function classifyHoleCards(hole: ParsedCard[]): HoleCardRank {
  if (hole.length !== 2) return "weak";

  const [c1, c2] =
    hole[0].value >= hole[1].value ? [hole[0], hole[1]] : [hole[1], hole[0]];
  const suited = c1.suit === c2.suit;
  const pair = c1.value === c2.value;
  const gap = c1.value - c2.value;

  if (pair) {
    if (c1.value >= 12) return "premium"; // QQ+
    if (c1.value >= 9) return "strong"; // 99-JJ
    return "playable"; // 22-88
  }

  if (c1.value === 14 && c2.value === 13) {
    return suited ? "premium" : "strong"; // AKs = premium, AKo = strong
  }

  if (c1.value === 14) {
    if (suited && c2.value >= 11) return "strong"; // AQs, AJs
    if (suited) return "playable"; // suited aces
    if (c2.value >= 12) return "strong"; // AQo
    return "playable";
  }

  if (c1.value === 13 && c2.value === 12) {
    return suited ? "strong" : "playable"; // KQs = strong, KQo = playable
  }

  if (suited && gap === 1 && c1.value >= 5) return "playable"; // suited connectors T9s-54s

  if (suited && gap <= 2 && c1.value >= 9) return "playable"; // suited one-gappers

  if (!suited && c1.value >= 11 && c2.value >= 10 && gap === 1)
    return "playable"; // QJo, JTo

  return "weak";
}
