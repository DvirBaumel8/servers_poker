/**
 * EquityService: Win probability estimation and Expected Value (EV) calculations.
 *
 * Two estimation methods:
 *
 * 1. **Heuristic (Rule of 2 and 4)** — Fast, O(1) equity from outs counting.
 *    Used by the personality evaluator on every bot action.
 *    - Preflop: Lookup table by hole card category, multi-way discounted.
 *    - Postflop: Made hand equity + draw equity via outs × multiplier.
 *    - Rule of 2 and 4: On the flop (2 cards to come), multiply outs by 4.
 *      On the turn (1 card to come), multiply outs by 2. Cap at 60%.
 *
 * 2. **Monte Carlo** — Accurate equity via random opponent hands + pokersolver.
 *    Optional, deterministic with seeded PRNG. Used for Pro tier or analysis.
 *
 * Pure module — no NestJS DI, works in Worker Threads.
 */

import type {
  HandStrength,
  HoleCardRank,
} from "../../../domain/bot-strategy/strategy.types";
import { STRATEGY_TUNABLES } from "../strategy-tunables";
import { parseCardString, classifyHoleCards } from "./hand-analyzer";

// ─── Memoization ─────────────────────────────────────────────────────────────

const EQUITY_MEMO = new Map<string, number>();
const EQUITY_MEMO_MAX = 256;

function equityMemoKey(
  holeCards: string[],
  communityCards: string[],
  n: number,
): string {
  return `${holeCards[0]}${holeCards[1]}:${communityCards.join(",")}:${n}`;
}

/** Clear the equity memo cache. Call at the end of each hand. */
export function clearEquityMemo(): void {
  EQUITY_MEMO.clear();
}

// ─── Outs Counting ───────────────────────────────────────────────────────────

export interface OutsResult {
  flushOuts: number;
  straightOuts: number;
  overCardOuts: number;
  totalOuts: number;
}

/**
 * Count drawing outs from hole cards and community cards.
 *
 * Outs are unseen cards that improve the hand to a likely winner:
 * - Flush draw (4 suited): 13 - seen suited cards = ~9 outs
 * - Open-ended straight draw (4 consecutive): 8 outs (4 on each end)
 * - Gutshot straight draw (4 within span of 5): 4 outs
 * - Overcards above highest board card: ~3 outs each (pair outs)
 *
 * When flush and straight draws overlap, deduct combo overlap to avoid
 * double-counting cards that complete both draws.
 */
export function countOuts(
  holeCards: string[],
  communityCards: string[],
): OutsResult {
  if (communityCards.length === 0 || communityCards.length >= 5) {
    return { flushOuts: 0, straightOuts: 0, overCardOuts: 0, totalOuts: 0 };
  }

  const hole = holeCards.map(parseCardString);
  const community = communityCards.map(parseCardString);
  const allCards = [...hole, ...community];
  const cfg = STRATEGY_TUNABLES.equity.outs;

  let flushOuts = 0;
  let straightOuts = 0;
  let overCardOuts = 0;

  // ── Flush outs ──
  const suitCounts: Record<string, number> = {};
  for (const card of allCards) {
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  }
  for (const [suit, count] of Object.entries(suitCounts)) {
    if (count === 4 && hole.some((h) => h.suit === suit)) {
      // 13 cards of suit minus 4 already seen = 9
      flushOuts = cfg.flushDraw;
      break;
    }
  }

  // ── Straight outs ──
  const uniqueValues = [...new Set(allCards.map((c) => c.value))].sort(
    (a, b) => a - b,
  );
  const holeValues = new Set(hole.map((h) => h.value));

  // Include Ace-low
  if (uniqueValues.includes(14)) {
    uniqueValues.unshift(1);
  }

  let isOpenEnded = false;
  let isGutshot = false;

  // Open-ended: 4 consecutive with hole card participation
  for (let i = 0; i <= uniqueValues.length - 4; i++) {
    const window = uniqueValues.slice(i, i + 4);
    if (window[3] - window[0] === 3) {
      const hasHoleCard = window.some(
        (v) => holeValues.has(v) || (v === 1 && holeValues.has(14)),
      );
      if (hasHoleCard) {
        isOpenEnded = true;
        break;
      }
    }
  }

  // Gutshot: 4 values within span of 5 (one gap)
  if (!isOpenEnded) {
    for (let i = 0; i <= uniqueValues.length - 4; i++) {
      const window = uniqueValues.slice(i, i + 4);
      if (window[3] - window[0] === 4) {
        const hasHoleCard = window.some(
          (v) => holeValues.has(v) || (v === 1 && holeValues.has(14)),
        );
        if (hasHoleCard) {
          isGutshot = true;
          break;
        }
      }
    }
  }

  if (isOpenEnded) {
    straightOuts = cfg.openEndedStraightDraw;
  } else if (isGutshot) {
    straightOuts = cfg.gutshot;
  }

  // ── Overcard outs ──
  if (community.length > 0) {
    const highestBoardValue = Math.max(...community.map((c) => c.value));
    for (const h of hole) {
      if (h.value > highestBoardValue) {
        overCardOuts += cfg.overCards;
      }
    }
  }

  // Deduct combo overlap when both flush and straight draws exist
  let totalOuts = flushOuts + straightOuts + overCardOuts;
  if (flushOuts > 0 && straightOuts > 0) {
    totalOuts -= cfg.comboDrawOverlap;
  }

  return {
    flushOuts,
    straightOuts,
    overCardOuts,
    totalOuts: Math.max(0, totalOuts),
  };
}

// ─── Heuristic Equity (Rule of 2 and 4) ─────────────────────────────────────

/**
 * Fast equity estimation using outs counting and the Rule of 2 and 4.
 *
 * @param holeCards - Player's hole cards (e.g. ["A♠", "K♥"])
 * @param communityCards - Community cards dealt so far (0, 3, 4, or 5 cards)
 * @param numOpponents - Number of active opponents (excluding hero)
 * @returns Estimated win probability in [0, 1]
 */
export function estimateEquityHeuristic(
  holeCards: string[],
  communityCards: string[],
  numOpponents: number,
): number {
  if (holeCards.length !== 2) return 0;

  const key = equityMemoKey(holeCards, communityCards, numOpponents);
  const cached = EQUITY_MEMO.get(key);
  if (cached !== undefined) return cached;

  const opponents = Math.max(1, numOpponents);
  let equity: number;

  if (communityCards.length === 0) {
    equity = estimatePreflopEquity(holeCards, opponents);
  } else {
    equity = estimatePostflopEquity(holeCards, communityCards, opponents);
  }

  equity = Math.max(0, Math.min(1, equity));

  // Store in memo (bounded LRU)
  if (EQUITY_MEMO.size >= EQUITY_MEMO_MAX) {
    const firstKey = EQUITY_MEMO.keys().next().value;
    if (firstKey !== undefined) EQUITY_MEMO.delete(firstKey);
  }
  EQUITY_MEMO.set(key, equity);

  return equity;
}

/**
 * Preflop equity from lookup table, discounted for multi-way pots.
 * Uses classifyHoleCards() to determine hand category, then looks up
 * base equity from tunables. Multi-way discount: equity^numOpponents.
 */
function estimatePreflopEquity(holeCards: string[], opponents: number): number {
  const hole = holeCards.map(parseCardString);
  const rank: HoleCardRank = classifyHoleCards(hole);
  const cfg = STRATEGY_TUNABLES.equity;
  const baseEquity = cfg.preflopEquity[rank] ?? 0.3;

  // Multi-way discount: equity decreases exponentially with more opponents
  return Math.pow(baseEquity, opponents);
}

/**
 * Postflop equity combining made hand strength and draw potential.
 *
 * Made hand equity: Lookup from hand strength (pair, flush, etc.)
 * Draw equity: outs × 4 on flop (2 cards to come), outs × 2 on turn (1 card), capped at 60%.
 * Combined: P(win) = P(made) + P(draw) - P(made) × P(draw)  (inclusion-exclusion)
 * Multi-way discount: equity^(base + scale × opponents / 8)
 */
function estimatePostflopEquity(
  holeCards: string[],
  communityCards: string[],
  opponents: number,
): number {
  const cfg = STRATEGY_TUNABLES.equity;

  // Made hand equity from hand strength
  const handStrength = inferHandStrength(holeCards, communityCards);
  const madeEquity = cfg.madeHandEquity[handStrength] ?? 0.15;

  // Draw equity via outs counting + Rule of 2/4
  let drawEquity = 0;
  if (communityCards.length < 5) {
    const outs = countOuts(holeCards, communityCards);
    if (outs.totalOuts > 0) {
      const multiplier = communityCards.length === 3 ? 4 : 2; // Flop: ×4, Turn: ×2
      drawEquity = Math.min(0.6, (outs.totalOuts * multiplier) / 100);
    }
  }

  // Inclusion-exclusion: avoid double-counting when made hand is also a draw
  const rawEquity = madeEquity + drawEquity - madeEquity * drawEquity;

  // Multi-way discount
  const exponent =
    cfg.multiWayDiscountBase + (cfg.multiWayDiscountScale * opponents) / 8;
  return Math.pow(rawEquity, exponent);
}

/**
 * Infer hand strength category from hole cards and community cards.
 * Lightweight inline evaluation — does not use the full HandEvaluator
 * to avoid circular dependency. Checks for common patterns.
 */
function inferHandStrength(
  holeCards: string[],
  communityCards: string[],
): HandStrength {
  const hole = holeCards.map(parseCardString);
  const community = communityCards.map(parseCardString);
  const allCards = [...hole, ...community];

  // Check flush (5+ same suit)
  const suitCounts: Record<string, number> = {};
  for (const c of allCards) {
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  }
  const maxSuit = Math.max(...Object.values(suitCounts));

  // Check value groups
  const valueCounts: Record<number, number> = {};
  for (const c of allCards) {
    valueCounts[c.value] = (valueCounts[c.value] || 0) + 1;
  }
  const groups = Object.values(valueCounts).sort((a, b) => b - a);

  // Check straight
  const uniqueVals = [...new Set(allCards.map((c) => c.value))].sort(
    (a, b) => a - b,
  );
  if (uniqueVals.includes(14)) uniqueVals.unshift(1); // Ace-low
  let hasStraight = false;
  for (let i = 0; i <= uniqueVals.length - 5; i++) {
    if (uniqueVals[i + 4] - uniqueVals[i] === 4) {
      hasStraight = true;
      break;
    }
  }

  // Classify
  if (maxSuit >= 5 && hasStraight) {
    // Check if it's royal (A-high straight flush)
    const flushSuit = Object.entries(suitCounts).find(([, c]) => c >= 5)?.[0];
    const flushCards = allCards
      .filter((c) => c.suit === flushSuit)
      .map((c) => c.value);
    const flushUnique = [...new Set(flushCards)].sort((a, b) => a - b);
    for (let i = 0; i <= flushUnique.length - 5; i++) {
      if (flushUnique[i + 4] - flushUnique[i] === 4) {
        return flushUnique[i + 4] === 14 ? "royal_flush" : "straight_flush";
      }
    }
  }
  if (groups[0] >= 4) return "quads";
  if (groups[0] >= 3 && groups[1] >= 2) return "full_house";
  if (maxSuit >= 5) return "flush";
  if (hasStraight) return "straight";
  if (groups[0] >= 3) return "trips";
  if (groups[0] >= 2 && groups[1] >= 2) return "two_pair";
  if (groups[0] >= 2) return "pair";
  return "high_card";
}

// ─── Monte Carlo Equity ──────────────────────────────────────────────────────

/** Seeded PRNG (same LCG as personality evaluator). */
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  /** Fisher-Yates shuffle of an array in-place. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

/**
 * Monte Carlo equity estimation using pokersolver for hand evaluation.
 *
 * Deals random opponent hands and remaining community cards across many
 * iterations, then counts wins and ties.
 *
 * @param holeCards - Player's hole cards
 * @param communityCards - Community cards dealt so far
 * @param numOpponents - Number of opponents
 * @param iterations - Number of Monte Carlo iterations (default from tunables)
 * @param seed - PRNG seed for deterministic results
 * @returns Estimated equity in [0, 1]
 */
export function estimateEquityMonteCarlo(
  holeCards: string[],
  communityCards: string[],
  numOpponents: number,
  iterations?: number,
  seed?: number,
): number {
  if (holeCards.length !== 2) return 0;

  const iters = iterations ?? STRATEGY_TUNABLES.equity.monteCarloIterations;
  const rng = new SeededRandom(seed ?? 42);
  const opponents = Math.max(1, numOpponents);

  // Build full deck, remove known cards
  const fullDeck: string[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      fullDeck.push(`${rank}${suit}`);
    }
  }

  const knownCards = new Set([...holeCards, ...communityCards]);
  const remainingDeck = fullDeck.filter((c) => !knownCards.has(c));
  const communityNeeded = 5 - communityCards.length;

  // Lazy-load pokersolver to avoid import overhead on heuristic path
  let Hand: {
    solve: (cards: string[]) => { rank: number };
    winners: (hands: Array<{ rank: number }>) => Array<{ rank: number }>;
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pokersolver = require("pokersolver");
    Hand = pokersolver.Hand;
  } catch {
    // If pokersolver not available, fall back to heuristic
    return estimateEquityHeuristic(holeCards, communityCards, numOpponents);
  }

  let wins = 0;
  let ties = 0;

  for (let i = 0; i < iters; i++) {
    const deck = [...remainingDeck];
    rng.shuffle(deck);

    let idx = 0;

    // Deal remaining community cards
    const fullCommunity = [...communityCards];
    for (let c = 0; c < communityNeeded; c++) {
      fullCommunity.push(deck[idx++]);
    }

    // Deal opponent hands
    const opponentHands: string[][] = [];
    for (let o = 0; o < opponents; o++) {
      opponentHands.push([deck[idx++], deck[idx++]]);
    }

    // Convert to pokersolver format: "As", "Kh", "Td", "2c"
    const heroSolverCards = [...holeCards, ...fullCommunity].map(toPokersolver);
    const heroHand = Hand.solve(heroSolverCards);

    const allHands = [heroHand];
    for (const oppHole of opponentHands) {
      const oppCards = [...oppHole, ...fullCommunity].map(toPokersolver);
      allHands.push(Hand.solve(oppCards));
    }

    const winners = Hand.winners(allHands);
    if (winners.length === 1 && winners[0] === heroHand) {
      wins++;
    } else if (winners.includes(heroHand)) {
      ties++;
    }
  }

  return (wins + ties / 2) / iters;
}

/**
 * Convert card from internal format ("A♠", "10♥") to pokersolver format ("As", "Th").
 */
function toPokersolver(card: string): string {
  const chars = [...card];
  const suitChar = chars.pop() || "";
  let rank = chars.join("");

  // Pokersolver uses "T" for 10
  if (rank === "10") rank = "T";

  const suitMap: Record<string, string> = {
    "♠": "s",
    "♥": "h",
    "♦": "d",
    "♣": "c",
  };
  return `${rank}${suitMap[suitChar] || suitChar}`;
}

// ─── EV Calculations ─────────────────────────────────────────────────────────

/**
 * Expected Value of calling a bet.
 *
 * EV = equity × (pot + toCall) - (1 - equity) × toCall
 *    = equity × pot - (1 - 2 × equity) × toCall
 *
 * Positive EV means calling is profitable in the long run.
 *
 * @param equity - Win probability [0, 1]
 * @param pot - Current pot size (before calling)
 * @param toCall - Amount required to call
 * @returns Expected value of calling (can be negative)
 */
export function computeCallEV(
  equity: number,
  pot: number,
  toCall: number,
): number {
  return equity * (pot + toCall) - (1 - equity) * toCall;
}

/**
 * Determine if calling is +EV with a safety buffer.
 *
 * The safety buffer (default 5%) accounts for rake and implied odds uncertainty.
 * A call is profitable when equity exceeds pot odds by at least the buffer:
 *   equity > potOdds + safetyBuffer
 *
 * @param equity - Win probability [0, 1]
 * @param potOdds - toCall / (pot + toCall), in [0, 1]
 * @param safetyBuffer - Extra margin required (default from tunables)
 * @returns true if calling is profitable
 */
export function isProfitableCall(
  equity: number,
  potOdds: number,
  safetyBuffer?: number,
): boolean {
  const buffer = safetyBuffer ?? STRATEGY_TUNABLES.equity.safetyBuffer;
  return equity > potOdds + buffer;
}
