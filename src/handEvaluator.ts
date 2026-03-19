export const HAND_RANKS = {
  ROYAL_FLUSH: 9,
  STRAIGHT_FLUSH: 8,
  FOUR_OF_A_KIND: 7,
  FULL_HOUSE: 6,
  FLUSH: 5,
  STRAIGHT: 4,
  THREE_OF_A_KIND: 3,
  TWO_PAIR: 2,
  ONE_PAIR: 1,
  HIGH_CARD: 0,
};

export const HAND_NAMES = Object.fromEntries(
  Object.entries(HAND_RANKS).map(([k, v]) => [v, k]),
);

interface Card {
  value: number;
  suit: string;
}

interface HandResult {
  rank: number;
  tiebreakers: number[];
  name: string;
  cards?: Card[];
}

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function evaluateFiveCards(cards: Card[]): HandResult {
  const values = cards.map((c) => c.value).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  let isStraight = false;
  let straightHigh = values[0];

  const uniqueVals = [...new Set(values)].sort((a, b) => b - a);
  if (uniqueVals.length === 5) {
    if (uniqueVals[0] - uniqueVals[4] === 4) {
      isStraight = true;
      straightHigh = uniqueVals[0];
    }
    if (uniqueVals[0] === 14 && uniqueVals[1] === 5 && uniqueVals[4] === 2) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  const counts: { [key: number]: number } = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([val, cnt]) => ({ val: Number(val), cnt }))
    .sort((a, b) => b.cnt - a.cnt || b.val - a.val);

  const [g0, g1, g2, g3] = groups;

  if (isFlush && isStraight) {
    return {
      rank:
        straightHigh === 14
          ? HAND_RANKS.ROYAL_FLUSH
          : HAND_RANKS.STRAIGHT_FLUSH,
      tiebreakers: [straightHigh],
      name: straightHigh === 14 ? "ROYAL_FLUSH" : "STRAIGHT_FLUSH",
    };
  }
  if (g0.cnt === 4) {
    return {
      rank: HAND_RANKS.FOUR_OF_A_KIND,
      tiebreakers: [g0.val, g1?.val].filter((v) => v !== undefined) as number[],
      name: "FOUR_OF_A_KIND",
    };
  }
  if (g0.cnt === 3 && g1?.cnt === 2) {
    return {
      rank: HAND_RANKS.FULL_HOUSE,
      tiebreakers: [g0.val, g1.val],
      name: "FULL_HOUSE",
    };
  }
  if (isFlush) {
    return { rank: HAND_RANKS.FLUSH, tiebreakers: values, name: "FLUSH" };
  }
  if (isStraight) {
    return {
      rank: HAND_RANKS.STRAIGHT,
      tiebreakers: [straightHigh],
      name: "STRAIGHT",
    };
  }
  if (g0.cnt === 3) {
    return {
      rank: HAND_RANKS.THREE_OF_A_KIND,
      tiebreakers: [g0.val, g1?.val, g2?.val].filter(
        (v) => v !== undefined,
      ) as number[],
      name: "THREE_OF_A_KIND",
    };
  }
  if (g0.cnt === 2 && g1?.cnt === 2) {
    return {
      rank: HAND_RANKS.TWO_PAIR,
      tiebreakers: [g0.val, g1.val, g2?.val].filter(
        (v) => v !== undefined,
      ) as number[],
      name: "TWO_PAIR",
    };
  }
  if (g0.cnt === 2) {
    return {
      rank: HAND_RANKS.ONE_PAIR,
      tiebreakers: [g0.val, g1?.val, g2?.val, g3?.val].filter(
        (v) => v !== undefined,
      ) as number[],
      name: "ONE_PAIR",
    };
  }
  return { rank: HAND_RANKS.HIGH_CARD, tiebreakers: values, name: "HIGH_CARD" };
}

export function bestHand(
  holeCards: Card[],
  communityCards: Card[],
): HandResult {
  const all = [...holeCards, ...communityCards];
  const combos = getCombinations(all, 5);
  let best: HandResult | null = null;
  let bestCards: Card[] | null = null;

  for (const combo of combos) {
    const result = evaluateFiveCards(combo);
    if (!best || compareHands(result, best) > 0) {
      best = result;
      bestCards = combo;
    }
  }

  return { ...best!, cards: bestCards! };
}

export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (
    let i = 0;
    i < Math.max(a.tiebreakers.length, b.tiebreakers.length);
    i++
  ) {
    const diff = (a.tiebreakers[i] || 0) - (b.tiebreakers[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

interface Player {
  id: string;
  holeCards: Card[];
}

export function determineWinners(players: Player[], communityCards: Card[]) {
  const hands = players.map((p) => ({
    playerId: p.id,
    hand: bestHand(p.holeCards, communityCards),
  }));

  let best = hands[0];
  for (const h of hands) {
    if (compareHands(h.hand, best.hand) > 0) best = h;
  }

  const winners = hands.filter((h) => compareHands(h.hand, best.hand) === 0);
  return { winners, hands };
}
