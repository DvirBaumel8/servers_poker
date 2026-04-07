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
import {
  cardToInt,
  eval5ints,
  bestOf7ints,
  holecardRangeIndex,
} from "../../../domain/fastHandEval";

// CAT_MULT mirrors the value in fastHandEval (B5 + 1 = 13^5 + 1) — used to extract
// the hand-category index from a raw score without an extra import.
const CAT_MULT_EQUITY = 371294; // 13^5 + 1

// Per-category approximate probability that the board hand is NOT beaten by one random
// opponent (i.e. opponent also plays the board or has a weaker hand).
// Index = hand category: 0=high_card, 1=pair, 2=two_pair, 3=trips, 4=straight,
//                        5=flush, 6=full_house, 7=quads, 8=straight_flush
//
// NOTE: these are lower than madeHandEquity because a "board plays" two pair
// is easy to beat (any pocket pair on the board's ranks makes a full house), while
// a "board plays" full house can only be beaten by the remaining quads.
const BOARD_WIN_RATE_BY_CAT = [
  0.15, 0.3, 0.4, 0.6, 0.75, 0.8, 0.92, 0.98, 0.99,
];

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
  const suitCounts: Record<string, number> = Object.create(null);
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
 * Returns true when the 5-card board already forms the best possible hand —
 * i.e. neither hole card improves the hero's best 5-card hand.
 *
 * Uses score comparison: if `bestOf7ints(hole + board)` equals `eval5ints(board)`,
 * the hole cards contribute nothing. This is more reliable than checking whether
 * specific card objects appear in the best-hand result, which can give inconsistent
 * answers when hole cards share a rank with board cards (e.g. K♠ on a K♣K♥AAA board).
 *
 * On the river this means the hero can only split or lose, never win outright.
 * Only meaningful when all 5 community cards are dealt.
 */
export function isBoardPlays(
  holeCards: string[],
  communityCards: string[],
): boolean {
  if (communityCards.length < 5) return false;
  const commInts = communityCards.map(cardToInt);
  const boardScore = eval5ints(
    commInts[0],
    commInts[1],
    commInts[2],
    commInts[3],
    commInts[4],
  );
  const heroScore = bestOf7ints([...holeCards.map(cardToInt), ...commInts]);
  return heroScore === boardScore;
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

  // Board-plays guard: when hole cards contribute nothing to the best hand,
  // the hero can only TIE (not win outright). Equity = P(none of the N opponents
  // holds a hand that beats the board) × 0.5 (split pot).
  //
  // The board's hand category is read from its fast-eval score to correctly identify
  // full houses / quads even when inferHandStrength() would misclassify them.
  // BOARD_WIN_RATE_BY_CAT[cat] ≈ probability the board hand beats one random opponent.
  if (communityCards.length === 5 && isBoardPlays(holeCards, communityCards)) {
    const commInts = communityCards.map(cardToInt);
    const boardScore = eval5ints(
      commInts[0],
      commInts[1],
      commInts[2],
      commInts[3],
      commInts[4],
    );
    const boardCat = Math.floor(boardScore / CAT_MULT_EQUITY);
    const boardWinRate = BOARD_WIN_RATE_BY_CAT[boardCat] ?? 0.15;
    // P(no opponent beats the board) = boardWinRate ^ opponents (independence approx)
    // × 0.5 because any surviving opponent TIES (split pot) rather than losing
    return Math.pow(boardWinRate, opponents) * 0.5;
  }

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
 *
 * CRITICAL: Board-awareness. When the board itself contains trips or quads,
 * every player at the table shares that hand — the hero's strength comes only
 * from their hole cards' contribution (kickers, pocket pair upgrade, etc.).
 * Without this check, a player with 8♦4♠ on a QQQ96 board would be rated
 * as "trips" equity (0.70) when they actually win <1% of the time.
 */
function inferHandStrength(
  holeCards: string[],
  communityCards: string[],
): HandStrength {
  const hole = holeCards.map(parseCardString);
  const community = communityCards.map(parseCardString);
  const allCards = [...hole, ...community];

  // Value counts — full board, hole-only, and board-only
  const valueCounts: Record<number, number> = {};
  for (const c of allCards) {
    valueCounts[c.value] = (valueCounts[c.value] || 0) + 1;
  }
  const boardValueCounts: Record<number, number> = {};
  for (const c of community) {
    boardValueCounts[c.value] = (boardValueCounts[c.value] || 0) + 1;
  }
  const holeValueCounts: Record<number, number> = {};
  for (const c of hole) {
    holeValueCounts[c.value] = (holeValueCounts[c.value] || 0) + 1;
  }

  const groups = Object.values(valueCounts).sort((a, b) => b - a);
  const boardMaxGroup = Math.max(0, ...Object.values(boardValueCounts));
  const holeMaxGroup = Math.max(0, ...Object.values(holeValueCounts));

  // Check flush (5+ same suit)
  const suitCounts: Record<string, number> = Object.create(null);
  for (const c of allCards) {
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  }
  const maxSuit = Math.max(...Object.values(suitCounts));

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

  // Classify — checking board-only hands to avoid overrating shared board strength

  if (maxSuit >= 5 && hasStraight) {
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

  if (groups[0] >= 4) {
    // Quads: check if the quad rank is contributed by hole cards
    const quadRank = Number(
      Object.entries(valueCounts).find(([, c]) => c >= 4)?.[0],
    );
    if ((boardValueCounts[quadRank] ?? 0) >= 4) {
      // Board alone has quads — everyone shares them, only kicker matters
      return "high_card";
    }
    return "quads";
  }

  if (groups[0] >= 3 && groups[1] >= 2) {
    // Full house candidate
    if (boardMaxGroup >= 3) {
      // Board has trips (e.g. QQQ on board)
      const tripRank = Number(
        Object.entries(boardValueCounts).find(([, c]) => c >= 3)?.[0],
      );
      if (!holeValueCounts[tripRank]) {
        // Hole cards don't match the trip rank
        if (holeMaxGroup >= 2) {
          // Pocket pair upgrades board trips → genuine full house (e.g. QQQ + 99 in hand)
          return "full_house";
        }
        // Board provides both the trips AND the pair (e.g. QQQKK board) — everyone has it
        return "pair";
      }
    }
    return "full_house";
  }

  if (maxSuit >= 5) return "flush";
  if (hasStraight) return "straight";

  if (groups[0] >= 3) {
    // Trips: check if the trip rank was contributed by hole cards
    const tripRank = Number(
      Object.entries(valueCounts).find(([, c]) => c >= 3)?.[0],
    );
    const boardContrib = boardValueCounts[tripRank] ?? 0;
    if (boardContrib >= 3) {
      // Board alone has the three-of-a-kind (e.g. QQQ on board, hero has 84)
      // Every player at the table has the same trips — only kickers differentiate.
      // Pocket pair in hole → full house (handled above, but guard here too)
      if (holeMaxGroup >= 2) return "full_house";
      // Pure kicker situation — downgrade significantly
      return "high_card";
    }
    if (boardContrib === 2 && (holeValueCounts[tripRank] ?? 0) >= 1) {
      // Board pair + hero has matching card → genuine trips (hero made them)
      return "trips";
    }
    return "trips";
  }

  if (groups[0] >= 2 && groups[1] >= 2) {
    // Two pair — check if BOTH pairs come from the board
    const boardPairCount = Object.values(boardValueCounts).filter(
      (c) => c >= 2,
    ).length;
    if (boardPairCount >= 2 && holeMaxGroup < 2) {
      // Both board pairs, hole cards contribute nothing — everyone has this two pair
      // Competing only on kicker
      return "pair";
    }
    return "two_pair";
  }

  if (groups[0] >= 2) {
    // One pair — check if it comes from the board alone
    const pairRank = Number(
      Object.entries(valueCounts).find(([, c]) => c >= 2)?.[0],
    );
    if ((boardValueCounts[pairRank] ?? 0) >= 2 && !holeValueCounts[pairRank]) {
      // Board pair, hole cards don't match — everyone has this pair, pure kicker game
      return "high_card";
    }
    return "pair";
  }

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
}

/**
 * Monte Carlo equity estimation using a fast integer-based hand evaluator.
 *
 * Deals random opponent hands and remaining community cards across many
 * iterations, then counts wins and ties. Uses partial Fisher-Yates shuffle
 * (only shuffles the cards it needs) and integer-encoded card representation
 * for maximum throughput — typically 15–35ms for 5,000 iterations.
 *
 * @param holeCards - Player's hole cards (e.g. ["A♠", "K♥"])
 * @param communityCards - Community cards dealt so far (0, 3, 4, or 5 cards)
 * @param numOpponents - Number of opponents
 * @param iterations - Number of Monte Carlo iterations (default from tunables)
 * @param seed - PRNG seed for deterministic results
 * @param opponentRangeLUT - Optional Uint8Array(169) preflop range LUT.
 *   When provided, opponent hands are rejection-sampled to only include hands
 *   whose LUT entry is non-zero (i.e. hands the opponent would play).
 *   Uses the same 169-cell encoding as the strategy engine range chart.
 * @returns Estimated equity in [0, 1]
 */
export function estimateEquityMonteCarlo(
  holeCards: string[],
  communityCards: string[],
  numOpponents: number,
  iterations?: number,
  seed?: number,
  opponentRangeLUT?: Uint8Array,
): number {
  if (holeCards.length !== 2) return 0;

  const iters = iterations ?? STRATEGY_TUNABLES.equity.monteCarloIterations;
  const rng = new SeededRandom(seed ?? 42);
  const opponents = Math.max(1, numOpponents);
  const communityNeeded = 5 - communityCards.length;

  // ── Pre-encode known cards as integers ──
  const heroInts = holeCards.map(cardToInt);
  const commInts = communityCards.map(cardToInt);

  // Build remaining deck as an array of card integers (filtered out known cards)
  const knownSet = new Set<number>([...heroInts, ...commInts]);
  const remainingDeck: number[] = [];
  for (let i = 0; i < 52; i++) {
    if (!knownSet.has(i)) remainingDeck.push(i);
  }

  // Working copy — we do partial Fisher-Yates on this array each iteration
  const deck = new Int32Array(remainingDeck);
  const deckLen = deck.length;

  // How many cards we need per iteration
  const cardsNeeded = communityNeeded + opponents * 2;

  let wins = 0;
  let ties = 0;

  // Pre-allocate hand buffers once outside the loop to avoid GC pressure
  const iterComm = new Array<number>(5);
  const heroCards = new Array<number>(7);
  const oppCards = new Array<number>(7);
  const oppBase = communityNeeded; // opponent cards start after community in deck

  for (let iter = 0; iter < iters; iter++) {
    // ── Partial Fisher-Yates: only shuffle first `cardsNeeded` positions ──
    // O(cardsNeeded) instead of O(52), keeping each iteration fast.
    for (let i = 0; i < cardsNeeded; i++) {
      const j = i + Math.floor(rng.next() * (deckLen - i));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }

    // ── Build full 5-card community (known + newly dealt) ──
    let commLen = 0;
    for (let c = 0; c < commInts.length; c++) iterComm[commLen++] = commInts[c];
    for (let c = 0; c < communityNeeded; c++) iterComm[commLen++] = deck[c];

    // ── Hero's 7-card hand ──
    heroCards[0] = heroInts[0];
    heroCards[1] = heroInts[1];
    heroCards[2] = iterComm[0];
    heroCards[3] = iterComm[1];
    heroCards[4] = iterComm[2];
    heroCards[5] = iterComm[3];
    heroCards[6] = iterComm[4];
    const heroScore = bestOf7ints(heroCards);

    // ── Evaluate each opponent ──
    let heroWins = true;
    let heroTies = false;

    for (let o = 0; o < opponents; o++) {
      let oppCard1: number;
      let oppCard2: number;

      if (opponentRangeLUT) {
        // Rejection-sample: only accept hands in the opponent's range (LUT entry ≠ 0).
        // Cap at 20 attempts to avoid long loops against very tight ranges.
        const pos1 = oppBase + o * 2;
        const pos2 = oppBase + o * 2 + 1;
        let attempts = 0;
        do {
          if (attempts > 0) {
            const tail1 = pos1 + Math.floor(rng.next() * (deckLen - pos1));
            const t1 = deck[pos1];
            deck[pos1] = deck[tail1];
            deck[tail1] = t1;
            const tail2 = pos2 + Math.floor(rng.next() * (deckLen - pos2));
            const t2 = deck[pos2];
            deck[pos2] = deck[tail2];
            deck[tail2] = t2;
          }
          oppCard1 = deck[pos1];
          oppCard2 = deck[pos2];
          attempts++;
        } while (
          attempts < 20 &&
          opponentRangeLUT[holecardRangeIndex(oppCard1!, oppCard2!)] === 0
        );
      } else {
        oppCard1 = deck[oppBase + o * 2];
        oppCard2 = deck[oppBase + o * 2 + 1];
      }

      oppCards[0] = oppCard1!;
      oppCards[1] = oppCard2!;
      oppCards[2] = iterComm[0];
      oppCards[3] = iterComm[1];
      oppCards[4] = iterComm[2];
      oppCards[5] = iterComm[3];
      oppCards[6] = iterComm[4];
      const oppScore = bestOf7ints(oppCards);

      if (oppScore > heroScore) {
        heroWins = false;
        heroTies = false;
        break; // Hero already loses
      } else if (oppScore === heroScore) {
        heroWins = false;
        heroTies = true;
        // Keep checking — another opponent might beat the current tie
      }
    }

    if (heroWins) wins++;
    else if (heroTies) ties++;
  }

  return (wins + ties / 2) / iters;
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
