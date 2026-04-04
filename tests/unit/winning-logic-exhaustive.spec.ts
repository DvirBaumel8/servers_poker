/**
 * Exhaustive test suite for WinningLogic (handEvaluator).
 * ~300 unique hand comparison scenarios.
 *
 * Failure messages show: Expected winner | Hand A (rank, tiebreakers) | Hand B | Board
 */
import { describe, it, expect, test } from "vitest";
import {
  bestHand,
  compareHands,
  determineWinners,
  HAND_RANKS,
} from "../../src/domain/handEvaluator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface Card {
  value: number;
  suit: string;
}

const RANK_MAP: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

/** Parse "As" → {value:14,suit:"s"}, "Th" → {value:10,suit:"h"} */
function c(s: string): Card {
  const suit = s.slice(-1).toLowerCase();
  const rankStr = s.slice(0, -1).toUpperCase();
  const value = RANK_MAP[rankStr];
  if (value === undefined)
    throw new Error(`Unknown rank in "${s}": "${rankStr}"`);
  return { value, suit };
}

function cs(...strs: string[]): Card[] {
  return strs.map(c);
}

type Winner = "A" | "B";

function assertWins(
  hA: string[],
  hB: string[],
  comm: string[],
  w: Winner,
  ctx = "",
): void {
  const commCards = cs(...comm);
  const players = [
    { id: "A", holeCards: cs(...hA) },
    { id: "B", holeCards: cs(...hB) },
  ];
  const { winners, hands } = determineWinners(players, commCards);
  const rA = hands.find((h) => h.playerId === "A")!.hand;
  const rB = hands.find((h) => h.playerId === "B")!.hand;
  const msg = `${ctx} | Exp:Player ${w} | A:[${hA}](${rA.name} tb:${rA.tiebreakers}) | B:[${hB}](${rB.name} tb:${rB.tiebreakers}) | Board:[${comm}]`;
  expect(winners, msg).toHaveLength(1);
  expect(winners[0].playerId, msg).toBe(w);
}

function assertSplit(
  hA: string[],
  hB: string[],
  comm: string[],
  ctx = "",
): void {
  const commCards = cs(...comm);
  const players = [
    { id: "A", holeCards: cs(...hA) },
    { id: "B", holeCards: cs(...hB) },
  ];
  const { winners, hands } = determineWinners(players, commCards);
  const rA = hands.find((h) => h.playerId === "A")!.hand;
  const rB = hands.find((h) => h.playerId === "B")!.hand;
  const msg = `${ctx} | Exp:SPLIT | A:[${hA}](${rA.name} tb:${rA.tiebreakers}) | B:[${hB}](${rB.name} tb:${rB.tiebreakers}) | Board:[${comm}]`;
  expect(winners, msg).toHaveLength(2);
  expect(winners.map((w) => w.playerId).sort(), msg).toEqual(["A", "B"]);
}

type TC = [string, string[], string[], string[], "A" | "B" | "split"];

function runCases(cases: TC[]) {
  for (const [desc, hA, hB, comm, expected] of cases) {
    if (expected === "split") assertSplit(hA, hB, comm, desc);
    else assertWins(hA, hB, comm, expected, desc);
  }
}

// ---------------------------------------------------------------------------
// A. Rank Hierarchy Matrix — 45 pairs (all 10 ranks, every higher vs lower)
// ---------------------------------------------------------------------------
describe("A. Rank Hierarchy Matrix", () => {
  const RANK_NAMES = [
    "ROYAL_FLUSH",
    "STRAIGHT_FLUSH",
    "FOUR_OF_A_KIND",
    "FULL_HOUSE",
    "FLUSH",
    "STRAIGHT",
    "THREE_OF_A_KIND",
    "TWO_PAIR",
    "ONE_PAIR",
    "HIGH_CARD",
  ] as const;
  type RN = (typeof RANK_NAMES)[number];

  const canonical: Record<RN, ReturnType<typeof bestHand>> = {
    ROYAL_FLUSH: bestHand(cs("Ah", "Kh"), cs("Qh", "Jh", "Th", "2s", "3d")),
    STRAIGHT_FLUSH: bestHand(cs("9s", "8s"), cs("7s", "6s", "5s", "2h", "3d")),
    FOUR_OF_A_KIND: bestHand(cs("Ah", "Ad"), cs("Ac", "As", "Kh", "2c", "3d")),
    FULL_HOUSE: bestHand(cs("Kh", "Kd"), cs("Kc", "Qh", "Qd", "2c", "3s")),
    FLUSH: bestHand(cs("Ah", "9h"), cs("6h", "3h", "2h", "Ks", "Qd")),
    STRAIGHT: bestHand(cs("Th", "9d"), cs("8c", "7s", "6h", "2c", "4d")),
    THREE_OF_A_KIND: bestHand(cs("7h", "7d"), cs("7c", "Ks", "Qh", "2c", "3d")),
    TWO_PAIR: bestHand(cs("Kh", "Kd"), cs("Qc", "Qs", "Jh", "2c", "3d")),
    ONE_PAIR: bestHand(cs("Ah", "Ad"), cs("Ks", "Qh", "Jd", "2c", "3s")),
    HIGH_CARD: bestHand(cs("Ah", "Kd"), cs("9c", "7s", "5h", "3c", "2d")),
  };

  it.each(Object.entries(HAND_RANKS) as [string, number][])(
    "canonical %s evaluates to correct rank value",
    (name) => {
      if (name in canonical) {
        const hand = canonical[name as RN];
        expect(hand.rank, `${name} canonical`).toBe(
          HAND_RANKS[name as keyof typeof HAND_RANKS],
        );
      }
    },
  );

  const pairs: Array<[RN, RN]> = [];
  for (let i = 0; i < RANK_NAMES.length; i++)
    for (let j = i + 1; j < RANK_NAMES.length; j++)
      pairs.push([RANK_NAMES[i], RANK_NAMES[j]]);

  test.each(pairs)("%s beats %s", (higher, lower) => {
    const h = canonical[higher];
    const l = canonical[lower];
    expect(
      compareHands(h, l),
      `${higher}(rank=${h.rank}) should beat ${lower}(rank=${l.rank})`,
    ).toBeGreaterThan(0);
    expect(
      compareHands(l, h),
      `${lower} should NOT beat ${higher}`,
    ).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// B. Kicker Nightmare — Pair vs Pair (30 tests)
// ---------------------------------------------------------------------------
describe("B. Kicker Nightmare: Pair vs Pair", () => {
  const cases: TC[] = [
    // Different pair ranks — pair rank always decides
    [
      "AA beats KK regardless of kickers",
      ["Ah", "Ad"],
      ["Kh", "Kd"],
      ["Qs", "Jd", "9h", "5c", "2d"],
      "A",
    ],
    [
      "KK beats QQ regardless of kickers",
      ["Kh", "Kd"],
      ["Qh", "Qd"],
      ["As", "Jd", "9h", "5c", "2d"],
      "A",
    ],
    [
      "QQ beats JJ regardless of kickers",
      ["Qh", "Qd"],
      ["Jh", "Jd"],
      ["As", "Kd", "9h", "5c", "2d"],
      "A",
    ],
    [
      "JJ beats TT regardless of kickers",
      ["Jh", "Jd"],
      ["Th", "Td"],
      ["As", "Kd", "9h", "5c", "2d"],
      "A",
    ],
    [
      "TT beats 99 regardless of kickers",
      ["Th", "Td"],
      ["9h", "9d"],
      ["As", "Kd", "8h", "5c", "2d"],
      "A",
    ],
    [
      "99 beats 88 regardless of kickers",
      ["9h", "9d"],
      ["8h", "8d"],
      ["As", "Kd", "7h", "5c", "2d"],
      "A",
    ],
    [
      "88 beats 77 regardless of kickers",
      ["8h", "8d"],
      ["7h", "7d"],
      ["As", "Kd", "6h", "5c", "2d"],
      "A",
    ],
    [
      "77 beats 22 regardless of kickers",
      ["7h", "7d"],
      ["2h", "2d"],
      ["As", "Kd", "6h", "5c", "3c"],
      "A",
    ],
    // Higher pair beats lower pair even when lower pair has better kicker
    [
      "44 beats 33 even when 33 has A kicker",
      ["4h", "4d"],
      ["3h", "3d"],
      ["As", "Ks", "Qd", "Jh", "2c"],
      "A",
    ],
    [
      "22 loses to 33 despite having better community board",
      ["2h", "2d"],
      ["3h", "3d"],
      ["9c", "8s", "7d", "5h", "4c"],
      "B",
    ],
    // Same pair rank — 1st kicker decides
    [
      "AA: K kicker beats Q kicker",
      ["Ah", "Kh"],
      ["As", "Qd"],
      ["Ad", "7c", "5s", "3d", "2h"],
      "A",
    ],
    [
      "AA: Q kicker beats J kicker",
      ["Ah", "Qh"],
      ["As", "Jd"],
      ["Ad", "7c", "5s", "3d", "2h"],
      "A",
    ],
    [
      "AA: J kicker beats T kicker",
      ["Ah", "Jh"],
      ["As", "Td"],
      ["Ad", "7c", "5s", "3d", "2h"],
      "A",
    ],
    [
      "AA: T kicker beats 9 kicker",
      ["Ah", "Th"],
      ["As", "9d"],
      ["Ad", "7c", "5s", "3d", "2h"],
      "A",
    ],
    [
      "KK: A kicker beats Q kicker",
      ["Kh", "Ah"],
      ["Kd", "Qd"],
      ["Ks", "7c", "5s", "3d", "2h"],
      "A",
    ],
    [
      "KK: Q kicker beats J kicker",
      ["Kh", "Qh"],
      ["Kd", "Jd"],
      ["Ks", "7c", "5s", "3d", "2h"],
      "A",
    ],
    // Same pair rank — 2nd kicker decides (1st is tied via board)
    [
      "AA: K tied, Q beats J as 2nd kicker",
      ["Ah", "Qh"],
      ["As", "Jd"],
      ["Ad", "Kc", "5s", "3d", "2h"],
      "A",
    ],
    [
      "KK: A tied, Q beats J as 2nd kicker",
      ["Kh", "Qh"],
      ["Kd", "Jd"],
      ["Ks", "Ac", "5s", "3d", "2h"],
      "A",
    ],
    [
      "KK: A-Q tied, J beats T as 3rd kicker",
      ["Kh", "Jh"],
      ["Kd", "Td"],
      ["Ks", "Ac", "Qc", "3d", "2h"],
      "A",
    ],
    // Same pair rank — 3rd kicker decides
    [
      "JJ: A-K tied, Q beats J as 3rd kicker",
      ["Jh", "Qh"],
      ["Jd", "Ts"],
      ["Js", "As", "Kc", "2d", "3h"],
      "A",
    ],
    // All kickers equal → split
    [
      "AA: identical kickers → split",
      ["Ah", "Jh"],
      ["As", "Jd"],
      ["Ad", "Kc", "Qd", "3h", "2s"],
      "split",
    ],
    [
      "KK: all kickers from board → split",
      ["Kh", "2h"],
      ["Kd", "3d"],
      ["Ks", "Ac", "Qc", "Jd", "Tc"],
      "split",
    ],
    [
      "QQ: A-K-J board kickers → split",
      ["Qh", "5h"],
      ["Qd", "6d"],
      ["Qs", "Ac", "Kc", "Jd", "2s"],
      "split",
    ],
    // Pair from board — both players use board pair, hole cards are kickers
    [
      "Board pair AA: K kicker beats Q",
      ["Kh", "2h"],
      ["Qd", "3d"],
      ["As", "Ad", "7c", "5s", "4d"],
      "A",
    ],
    [
      "Board pair KK: A kicker beats Q",
      ["Ah", "2h"],
      ["Qd", "3d"],
      ["Ks", "Kd", "7c", "5s", "4s"],
      "A",
    ],
    [
      "Board pair QQ: A-K split when same",
      ["Ah", "Kh"],
      ["Ad", "Kd"],
      ["Qs", "Qd", "7c", "5s", "2h"],
      "split",
    ],
    // Pair + potential flush — pair still wins when flush is lower rank
    [
      "Pair over high card even with flush draw",
      ["Ah", "Ad"],
      ["Kh", "Qh"],
      ["Jh", "Th", "5c", "3d", "2s"],
      "A",
    ],
    // Kicker from board vs kicker from hole
    [
      "KK: A from board beats Q from hole as kicker",
      ["Kh", "7h"],
      ["Kd", "Qd"],
      ["Ks", "Ac", "5c", "3d", "2s"],
      "B",
    ],
    // Re-verify pair with 5 kicker candidates — best 3 used
    [
      "JJ: best 3 of 5 kicker cards chosen (A,K,Q)",
      ["Jh", "Ah"],
      ["Jd", "Ad"],
      ["Js", "Ks", "Qd", "Tc", "2s"],
      "split",
    ],
    // Two players, board pairs on board
    [
      "Board has pair, A improves with pocket pair → two pair beats one pair",
      ["Kh", "Kd"],
      ["Ah", "2d"],
      ["Ks", "Qc", "Jd", "5s", "2h"],
      "A",
    ],
  ];

  test.each(cases)("%s", (...args) => runCases([args as TC]));
});

// ---------------------------------------------------------------------------
// C. Kicker Nightmare — Two Pair vs Two Pair (25 tests)
// ---------------------------------------------------------------------------
describe("C. Kicker Nightmare: Two Pair vs Two Pair", () => {
  const cases: TC[] = [
    // Different top pair
    [
      "AA+KK beats KK+QQ (top pair decides)",
      ["Ah", "Ac"],
      ["Qh", "Qd"],
      ["Kh", "Kd", "7c", "2s", "3d"],
      "A",
    ],
    [
      "KK+QQ beats QQ+JJ (top pair decides)",
      ["Kh", "Kd"],
      ["Jh", "Jd"],
      ["Qh", "Qd", "7c", "2s", "3d"],
      "A",
    ],
    [
      "QQ+JJ beats JJ+TT (top pair decides)",
      ["Qh", "Qd"],
      ["Th", "Td"],
      ["Jh", "Jd", "7c", "2s", "3d"],
      "A",
    ],
    [
      "JJ+TT beats TT+99 (top pair decides)",
      ["Jh", "Jd"],
      ["9h", "9d"],
      ["Th", "Td", "7c", "2s", "3d"],
      "A",
    ],
    [
      "AA+22 beats KK+QQ (AA top pair wins)",
      ["Ah", "Ac"],
      ["Kh", "Kd"],
      ["2h", "2d", "Qh", "7s", "3c"],
      "A",
    ],
    // Same top pair, different bottom pair
    [
      "AA+KK beats AA+QQ (bottom pair decides)",
      ["Kh", "Kd"],
      ["Qh", "Qd"],
      ["Ah", "Ac", "7c", "2s", "3d"],
      "A",
    ],
    [
      "AA+QQ beats AA+JJ (bottom pair decides)",
      ["Qh", "Qd"],
      ["Jh", "Jd"],
      ["Ah", "Ac", "7c", "2s", "3d"],
      "A",
    ],
    [
      "AA+JJ beats AA+TT (bottom pair decides)",
      ["Jh", "Jd"],
      ["Th", "Td"],
      ["Ah", "Ac", "7c", "2s", "3d"],
      "A",
    ],
    [
      "KK+QQ beats KK+JJ (bottom pair decides)",
      ["Qh", "Qd"],
      ["Jh", "Jd"],
      ["Kh", "Kd", "7c", "2s", "3d"],
      "A",
    ],
    [
      "KK+33 beats KK+22 (bottom pair decides)",
      ["Kh", "3h"],
      ["Kd", "2d"],
      ["Ks", "3d", "2s", "Ac", "Qc"],
      "A",
    ],
    // Same top pair, same bottom pair — kicker decides
    [
      "AA+KK: Q kicker beats J kicker",
      ["Qh", "2h"],
      ["Jd", "3d"],
      ["Ah", "Ac", "Kh", "Kd", "5s"],
      "A",
    ],
    [
      "AA+KK: J kicker beats T kicker",
      ["Jh", "2h"],
      ["Td", "3d"],
      ["Ah", "Ac", "Kh", "Kd", "5s"],
      "A",
    ],
    [
      "KK+QQ: A kicker beats J kicker",
      ["Ah", "2h"],
      ["Jd", "3d"],
      ["Kh", "Kd", "Qh", "Qd", "5s"],
      "A",
    ],
    // Same everything → split
    [
      "AA+KK+Q kicker: identical → split",
      ["Qh", "2h"],
      ["Qd", "3d"],
      ["Ah", "Ac", "Kh", "Kd", "5s"],
      "split",
    ],
    [
      "KK+QQ: both play board kicker → split",
      ["2h", "3h"],
      ["4d", "5d"],
      ["Kh", "Kd", "Qh", "Qd", "Ac"],
      "split",
    ],
    // Three pairs on board — best two chosen
    [
      "Board has three pairs — best two selected",
      ["7h", "2d"],
      ["3s", "4c"],
      ["Ah", "Ac", "Kh", "Kd", "Qh"],
      "split",
    ],
    // One player makes two pair, other only one pair
    [
      "Two pair beats one pair (same top card)",
      ["Kh", "Qh"],
      ["Kd", "Jd"],
      ["Ks", "Qd", "7c", "2s", "3d"],
      "A",
    ],
    // Board has two pair — kicker from hole
    [
      "Board two pair AA+KK: Q kicker beats J",
      ["Qh", "2h"],
      ["Jd", "3d"],
      ["Ah", "Ac", "Kh", "Kd", "8s"],
      "A",
    ],
    // Split when board has two pair and hole cards can't improve
    [
      "Board AA+KK: both irrelevant low cards → split",
      ["2h", "3d"],
      ["4s", "5c"],
      ["Ah", "Ac", "Kh", "Kd", "Qs"],
      "split",
    ],
    // Top two pair vs same top pair + trips interaction
    [
      "Two pair beats two pair when top differs",
      ["Ah", "Ad"],
      ["Kh", "Kd"],
      ["Qs", "Qd", "Jc", "5s", "2d"],
      "A",
    ],
    // Two pair from different hole/board combos
    [
      "Both make two pair from board+hole combos",
      ["Ah", "Qh"],
      ["Ad", "Jd"],
      ["As", "Kc", "Qd", "7s", "2h"],
      "A",
    ],
    // Bottom pair kicker edge case — tiny ranks
    [
      "22+33 beats 22+33 by kicker (A vs K)",
      ["2h", "3h"],
      ["2d", "3d"],
      ["2s", "3s", "Ac", "Kd", "5h"],
      "split",
    ],
    // Two pair vs one pair — two pair wins
    [
      "Two pair always beats one pair",
      ["Ah", "Kh"],
      ["Ad", "Qd"],
      ["Ac", "Kd", "Qs", "2h", "3c"],
      "A",
    ],
    // Same high pair, B has second pair from board
    [
      "Both make same two pair via board",
      ["8h", "5d"],
      ["8d", "5s"],
      ["8s", "8c", "Ac", "Kd", "Qs"],
      "split",
    ],
    // Kicker tie when both use board for kicker
    [
      "AA+KK board, both hole cards below kicker → split",
      ["3h", "2d"],
      ["4s", "6c"],
      ["Ah", "Ac", "Kh", "Kd", "Qd"],
      "split",
    ],
  ];

  test.each(cases)("%s", (...args) => runCases([args as TC]));
});

// ---------------------------------------------------------------------------
// D. Kicker Nightmare — Full House vs Full House (20 tests)
// ---------------------------------------------------------------------------
describe("D. Kicker Nightmare: Full House vs Full House", () => {
  const cases: TC[] = [
    // Different trips rank (trips rank decides)
    [
      "KKK+QQ beats QQQ+KK",
      ["Kh", "Qh"],
      ["Ac", "Qd"],
      ["Kd", "Ks", "Qc", "Qs", "2d"],
      "A",
    ],
    [
      "QQQ+KK beats JJJ+AA",
      ["Qh", "Kh"],
      ["Jh", "Ac"],
      ["Qd", "Qs", "Jd", "Js", "Kd"],
      "A",
    ],
    [
      "AAA+KK beats KKK+AA",
      ["Ah", "Kh"],
      ["Ac", "Ad"],
      ["As", "Kd", "Ks", "Kc", "2h"],
      "A",
    ],
    [
      "KKK+QQ beats JJJ+AA (trips 13>11)",
      ["Kh", "Ah"],
      ["Jh", "Jd"],
      ["Kd", "Ks", "Js", "Qh", "Qd"],
      "A",
    ],
    [
      "888+77 beats 777+88 (trips 8>7)",
      ["8c", "3h"],
      ["7c", "3d"],
      ["8d", "8h", "7d", "7h", "2s"],
      "A",
    ],
    // Same trips — pair rank decides
    [
      "KKK+QQ beats KKK+JJ",
      ["Qh", "Ah"],
      ["Jd", "2d"],
      ["Kd", "Ks", "Kc", "Js", "Qd"],
      "A",
    ],
    [
      "KKK+JJ beats KKK+TT",
      ["Jh", "Ah"],
      ["Td", "2d"],
      ["Kd", "Ks", "Kc", "Js", "Th"],
      "A",
    ],
    [
      "AAA+KK beats AAA+QQ",
      ["Kh", "2h"],
      ["Qd", "3d"],
      ["As", "Ah", "Ac", "Kd", "Qh"],
      "A",
    ],
    [
      "AAA+QQ beats AAA+JJ",
      ["Qh", "2h"],
      ["Jd", "3d"],
      ["As", "Ah", "Ac", "Qd", "Jh"],
      "A",
    ],
    [
      "777+66 beats 777+55",
      ["7h", "6h"],
      ["7d", "5d"],
      ["7s", "7c", "6d", "5h", "3s"],
      "A",
    ],
    // Same trips + same pair → split
    [
      "KKK+QQ vs KKK+QQ → split",
      ["Kh", "Ah"],
      ["Kd", "2d"],
      ["Ks", "Kc", "Qh", "Qd", "3s"],
      "split",
    ],
    [
      "AAA+KK vs AAA+KK → split",
      ["Ah", "2h"],
      ["Ad", "3d"],
      ["As", "Ac", "Kh", "Kd", "5s"],
      "split",
    ],
    [
      "Both play same board FH → split",
      ["2h", "3d"],
      ["4s", "5c"],
      ["Kh", "Kd", "Ks", "Qh", "Qd"],
      "split",
    ],
    // One player makes FH, other makes flush (FH wins)
    [
      "Full house beats flush",
      ["Kh", "Kd"],
      ["Ah", "Jh"],
      ["Ks", "Qh", "Qd", "7h", "2h"],
      "A",
    ],
    // Full house beats straight
    [
      "Full house beats straight",
      ["Kh", "Kd"],
      ["Ts", "Jd"],
      ["Ks", "Qh", "Qd", "9h", "8c"],
      "A",
    ],
    // Board provides full house + one player improves trips
    [
      "KK on board+hole = FH; QQ board = weaker FH",
      ["Kh", "Kd"],
      ["Qh", "Qd"],
      ["Ks", "Qc", "Jh", "Jd", "Ac"],
      "A",
    ],
    // Full house vs four of a kind (FH loses)
    [
      "Four of a kind beats full house",
      ["Kh", "Kd"],
      ["Ah", "Ad"],
      ["Ks", "Kc", "Ac", "As", "2d"],
      "B",
    ],
    // Both make FH from same board trips
    [
      "Board KKK: A pair beats Q pair",
      ["Ah", "Ad"],
      ["Qh", "Qd"],
      ["Kh", "Kd", "Ks", "2c", "3d"],
      "A",
    ],
    [
      "Board KKK: Q pair beats J pair",
      ["Qh", "Qd"],
      ["Jh", "Jd"],
      ["Kh", "Kd", "Ks", "2c", "3d"],
      "A",
    ],
    // Trips in hole beats trips on board scenario
    [
      "Pocket pair + board pair = FH over board pair FH",
      ["Ah", "Ad"],
      ["Kh", "2d"],
      ["Ac", "As", "Kd", "Ks", "3h"],
      "A",
    ],
  ];

  test.each(cases)("%s", (...args) => runCases([args as TC]));
});

// ---------------------------------------------------------------------------
// E. Kicker Nightmare — High Card (all 5 positions) (20 tests)
// ---------------------------------------------------------------------------
describe("E. Kicker Nightmare: High Card All 5 Positions", () => {
  const cases: TC[] = [
    // Position 1 (highest card) decides
    [
      "HC: A beats K at position 1",
      ["Ah", "2d"],
      ["Kh", "2s"],
      ["Jc", "9d", "7h", "4s", "3c"],
      "A",
    ],
    [
      "HC: K beats Q at position 1",
      ["Kh", "2d"],
      ["Qh", "2s"],
      ["Jc", "9d", "7h", "4s", "3c"],
      "A",
    ],
    [
      "HC: Q beats J at position 1",
      ["Qh", "2d"],
      ["Jh", "2s"],
      ["Tc", "9d", "7h", "4s", "3c"],
      "A",
    ],
    [
      "HC: A beats Q at position 1",
      ["Ah", "2d"],
      ["Qh", "2s"],
      ["Jc", "9d", "7h", "4s", "3c"],
      "A",
    ],
    // Position 2 decides (first card tied)
    [
      "HC: A tied, K beats Q at position 2",
      ["Kh", "2d"],
      ["Qh", "2s"],
      ["Ac", "9d", "7h", "4s", "3c"],
      "A",
    ],
    [
      "HC: A tied, Q beats J at position 2",
      ["Qh", "2d"],
      ["Jh", "2s"],
      ["Ac", "9d", "7h", "4s", "3c"],
      "A",
    ],
    [
      "HC: A tied, J beats T at position 2",
      ["Jh", "2d"],
      ["Th", "2s"],
      ["Ac", "9d", "7h", "4s", "3c"],
      "A",
    ],
    // Position 3 decides (first two tied)
    [
      "HC: A-K tied, Q beats J at position 3",
      ["Qh", "2d"],
      ["Jh", "2s"],
      ["Ac", "Kc", "7h", "4s", "3c"],
      "A",
    ],
    [
      "HC: A-K tied, J beats T at position 3",
      ["Jh", "2d"],
      ["Th", "2s"],
      ["Ac", "Kc", "7h", "4s", "3c"],
      "A",
    ],
    [
      "HC: A-K tied, T beats 9 at position 3",
      ["Th", "2d"],
      ["9h", "2s"],
      ["Ac", "Kc", "7h", "4s", "3c"],
      "A",
    ],
    // Position 4 decides (first three tied)
    [
      "HC: A-K-Q tied, J beats T at position 4",
      ["Jh", "2d"],
      ["Td", "2s"],
      ["Ac", "Kc", "Qc", "4s", "3c"],
      "A",
    ],
    [
      "HC: A-K-Q tied, T beats 9 at position 4",
      ["Th", "2d"],
      ["9d", "2s"],
      ["Ac", "Kc", "Qc", "4s", "3c"],
      "A",
    ],
    [
      "HC: A-K-Q tied, 9 beats 8 at position 4",
      ["9h", "2d"],
      ["8d", "2s"],
      ["Ac", "Kc", "Qc", "4s", "3c"],
      "A",
    ],
    // Position 5 decides (first four tied)
    [
      "HC: A-K-Q-J tied, T beats 9 at position 5",
      ["Th", "3d"],
      ["9d", "3s"],
      ["Ac", "Kc", "Qc", "Jc", "2h"],
      "A",
    ],
    [
      "HC: A-K-Q-J tied, 9 beats 8 at position 5",
      ["9h", "3d"],
      ["8d", "3s"],
      ["Ac", "Kc", "Qc", "Jc", "2h"],
      "A",
    ],
    // All 5 equal → split
    [
      "HC: all 5 cards equal → split",
      ["2h", "3d"],
      ["4s", "6c"],
      ["Ah", "Kc", "Qd", "Jh", "Tc"],
      "split",
    ],
    [
      "HC: both play identical board → split",
      ["2h", "3d"],
      ["4s", "5c"],
      ["Ac", "Kd", "Qh", "Js", "Td"],
      "split",
    ],
    // High card vs pair (pair wins)
    [
      "ONE_PAIR beats HIGH_CARD",
      ["Ah", "Ad"],
      ["Kh", "Qd"],
      ["Jc", "Tc", "5h", "3s", "2d"],
      "A",
    ],
    // High card: best 5 of 7 chosen
    [
      "HC: uses best 5 of 7 cards",
      ["Ah", "Kh"],
      ["Ac", "Kd"],
      ["Qh", "Jd", "Tc", "2s", "3d"],
      "split",
    ],
    // A-K-Q-J-T high card (broadway) ties with same
    [
      "HC: A-K-Q-J-T broadway split",
      ["Ah", "Kh"],
      ["Ac", "Kd"],
      ["Qd", "Jc", "Th", "2s", "3d"],
      "split",
    ],
  ];

  test.each(cases)("%s", (...args) => runCases([args as TC]));
});

// ---------------------------------------------------------------------------
// F. Kicker Nightmare — Three of a Kind (15 tests)
// ---------------------------------------------------------------------------
describe("F. Kicker Nightmare: Three of a Kind", () => {
  const cases: TC[] = [
    // Different trips rank
    [
      "KKK beats QQQ",
      ["Kh", "Kd"],
      ["Qh", "Qd"],
      ["Kc", "Qc", "Js", "7s", "2d"],
      "A",
    ],
    [
      "AAA beats KKK",
      ["Ah", "Ad"],
      ["Kh", "Kd"],
      ["Ac", "Kc", "Js", "7s", "2d"],
      "A",
    ],
    [
      "QQQ beats JJJ",
      ["Qh", "Qd"],
      ["Jh", "Jd"],
      ["Qc", "Jc", "Ts", "7s", "2d"],
      "A",
    ],
    // Same trips — 1st kicker decides
    [
      "777: A kicker beats K kicker",
      ["7h", "Ah"],
      ["7d", "Kd"],
      ["7c", "7s", "Qs", "3d", "2h"],
      "A",
    ],
    [
      "777: K kicker beats Q kicker",
      ["7h", "Kh"],
      ["7d", "Qd"],
      ["7c", "7s", "Js", "3d", "2h"],
      "A",
    ],
    [
      "777: A-K tied by board, Q beats J",
      ["7h", "Qh"],
      ["7d", "Jd"],
      ["7c", "7s", "As", "2h", "3d"],
      "A",
    ],
    // Same trips — 2nd kicker decides
    [
      "777: A tied, K beats Q as 2nd kicker",
      ["7h", "Kh"],
      ["7d", "Qd"],
      ["7c", "7s", "As", "3d", "2h"],
      "A",
    ],
    [
      "777: A tied, Q beats J as 2nd kicker",
      ["7h", "Qh"],
      ["7d", "Jd"],
      ["7c", "7s", "As", "3d", "2h"],
      "A",
    ],
    // Same trips + same kickers → split
    [
      "777: A-K kickers equal → split",
      ["7h", "Ah"],
      ["7s", "Ad"],
      ["7c", "7d", "Kh", "Kd", "2s"],
      "split",
    ],
    [
      "777: both play board kickers → split",
      ["7h", "2h"],
      ["7d", "3d"],
      ["7c", "7s", "Ac", "Kd", "Qs"],
      "split",
    ],
    // Trips from board vs trips from hole
    [
      "Pocket pair + board card = trips beats high card",
      ["Kh", "Kd"],
      ["Ah", "Qd"],
      ["Kc", "Js", "9h", "5d", "2s"],
      "A",
    ],
    // Three of a kind beats two pair
    [
      "Trips beats two pair",
      ["Kh", "Kd"],
      ["Ah", "Ad"],
      ["Kc", "Qh", "Qs", "5d", "2s"],
      "A",
    ],
    // Best 5 includes highest kickers from 7 cards
    [
      "777: best 2 kickers from 5 remaining",
      ["7h", "Ah"],
      ["7d", "Kd"],
      ["7c", "Qs", "Jh", "5s", "2d"],
      "A",
    ],
    // Low trips vs high two pair (trips wins)
    [
      "222 trips beats AA+KK two pair",
      ["2h", "2d"],
      ["Ah", "Ad"],
      ["2c", "Kh", "Kd", "5s", "3c"],
      "A",
    ],
    // Trips equal, kickers from board
    [
      "Board 777: A beats K as kicker via hole",
      ["Ah", "5h"],
      ["Kd", "5d"],
      ["7h", "7d", "7c", "Qs", "Jh"],
      "A",
    ],
  ];

  test.each(cases)("%s", (...args) => runCases([args as TC]));
});

// ---------------------------------------------------------------------------
// G. Board Interaction — 7-Card Best-5 Selection (40 tests)
// ---------------------------------------------------------------------------
describe("G. Board Interaction: 7-Card Logic", () => {
  describe("G1. 0 hole cards used (board plays entirely)", () => {
    const cases: TC[] = [
      // Board has Royal Flush — both players' cards irrelevant
      [
        "Board RF: both players play board → split",
        ["2s", "3d"],
        ["4s", "5d"],
        ["Ah", "Kh", "Qh", "Jh", "Th"],
        "split",
      ],
      // Board has Straight Flush
      [
        "Board SF 9h: both play board SF → split",
        ["2s", "3d"],
        ["As", "Kd"],
        ["9h", "8h", "7h", "6h", "5h"],
        "split",
      ],
      // Board has quads + kicker — both play it
      [
        "Board KKKK+A: both players split",
        ["2h", "3d"],
        ["4s", "5d"],
        ["Kh", "Kd", "Ks", "Kc", "Ac"],
        "split",
      ],
      // Board has Full House
      [
        "Board FH KKK+QQ: both play board → split",
        ["2h", "3d"],
        ["4s", "5d"],
        ["Kh", "Kd", "Ks", "Qh", "Qd"],
        "split",
      ],
      // Board has Ace-high flush
      [
        "Board A-high flush: both play board → split",
        ["2s", "3d"],
        ["4s", "5d"],
        ["Ah", "Kh", "9h", "6h", "3h"],
        "split",
      ],
      // Board has broadway straight
      [
        "Board broadway straight: both play → split",
        ["2s", "3d"],
        ["4s", "6d"],
        ["Ac", "Kd", "Qh", "Js", "Tc"],
        "split",
      ],
      // Board has wheel straight
      [
        "Board wheel straight: both play → split",
        ["Jh", "Td"],
        ["9s", "8d"],
        ["Ac", "2d", "3h", "4s", "5c"],
        "split",
      ],
      // Board has two pair — kicker from hole doesn't help
      [
        "Board AA+KK: both hole cards low → split",
        ["2h", "3d"],
        ["4s", "5d"],
        ["Ah", "Ad", "Kh", "Kd", "Qc"],
        "split",
      ],
      // Board has one pair — best 5 includes only 1 board pair
      [
        "Board AA: best kickers from board beat worse hole",
        ["Qh", "Jd"],
        ["3s", "2d"],
        ["Ah", "Ad", "Kh", "Ks", "Tc"],
        "A",
      ],
    ];
    test.each(cases)("%s", (...args) => runCases([args as TC]));
  });

  describe("G2. Exactly 1 hole card contributes to best hand", () => {
    const cases: TC[] = [
      // Player A uses 1 hole card to make Royal Flush
      [
        "1 hole card makes RF: Th+4hearts board",
        ["Th", "5s"],
        ["9h", "5d"],
        ["Ah", "Kh", "Qh", "Jh", "2d"],
        "A",
      ],
      // Player uses 1 hole card to complete flush
      [
        "1 hole card completes flush (5th suit)",
        ["Ah", "5s"],
        ["Kd", "5c"],
        ["9h", "7h", "4h", "3h", "Kc"],
        "A",
      ],
      // Player uses 1 hole card to complete straight
      [
        "1 hole card completes straight (5th card)",
        ["Th", "5s"],
        ["2d", "5c"],
        ["9c", "8d", "7h", "6s", "Kc"],
        "A",
      ],
      // Player uses 1 hole card as top kicker for pair
      [
        "1 hole card is top kicker for board pair",
        ["Ah", "5s"],
        ["Kd", "5c"],
        ["Qh", "Qd", "Jc", "9h", "2d"],
        "A",
      ],
      // Better flush using 1 hole card
      [
        "Board flush: A in hole beats K in hole",
        ["Ah", "3s"],
        ["Kd", "4s"],
        ["9h", "7h", "4h", "3h", "2h"],
        "A",
      ],
      // Straight flush from 1 hole card
      [
        "1 hole card makes SF: 6h on 4-heart board",
        ["6h", "2s"],
        ["Ah", "2d"],
        ["5h", "4h", "3h", "2h", "Kc"],
        "A",
      ],
      // Using 1 hole card to make trips from board pair
      [
        "1 hole card trips board pair: 3 K's vs pair",
        ["Kh", "5s"],
        ["Ah", "5c"],
        ["Kd", "Kc", "Qh", "9d", "2s"],
        "A",
      ],
    ];
    test.each(cases)("%s", (...args) => runCases([args as TC]));
  });

  describe("G3. Both hole cards needed for best hand", () => {
    const cases: TC[] = [
      // Both hole cards are top 2 kickers
      [
        "Both hole cards top 2 kickers in HC",
        ["Ah", "Kh"],
        ["Qd", "Jd"],
        ["9c", "7s", "5h", "3c", "2d"],
        "A",
      ],
      // Pocket pair uses both hole cards
      [
        "Pocket pair AA uses both hole cards",
        ["Ah", "Ad"],
        ["Kh", "Qd"],
        ["Jc", "9s", "7h", "3c", "2d"],
        "A",
      ],
      // Both hole cards needed for flush
      [
        "Both hole cards needed for flush (2+3 suit)",
        ["Ah", "Kh"],
        ["Qd", "Jd"],
        ["Th", "9h", "2h", "3s", "4c"],
        "A",
      ],
      // Both hole cards needed for straight
      [
        "Both hole cards complete straight",
        ["Kh", "Qd"],
        ["Ah", "2d"],
        ["Jc", "Ts", "9h", "3c", "4d"],
        "A",
      ],
      // Both hole cards make two pair with board
      [
        "Both hole cards each pair with board",
        ["Kh", "Qh"],
        ["Ah", "Jd"],
        ["Kd", "Qd", "7c", "5s", "2h"],
        "A",
      ],
      // Pocket pair + board pair = full house
      [
        "Pocket pair + board pair = full house",
        ["Kh", "Kd"],
        ["Ah", "2d"],
        ["Kc", "Qh", "Qd", "5s", "3c"],
        "A",
      ],
      // Both hole cards used in quads (2 in hole + 2 on board)
      [
        "2 in hole + 2 on board = quads",
        ["Kh", "Kd"],
        ["Ah", "Ad"],
        ["Kc", "Ks", "Qh", "5s", "3c"],
        "A",
      ],
    ];
    test.each(cases)("%s", (...args) => runCases([args as TC]));
  });

  describe("G4. Board with 4-of-a-kind or Full House", () => {
    const cases: TC[] = [
      // Board has quads — kicker from hole
      [
        "Board KKKK: A kicker beats Q kicker",
        ["Ah", "5d"],
        ["Qh", "5s"],
        ["Kh", "Kd", "Ks", "Kc", "9c"],
        "A",
      ],
      [
        "Board KKKK: both same kicker from board → split",
        ["2h", "3d"],
        ["4s", "5d"],
        ["Kh", "Kd", "Ks", "Kc", "Ac"],
        "split",
      ],
      // Board has full house — best hand for both players
      [
        "Board FH KKK+QQ: A hole doesn't help → split",
        ["Ah", "2d"],
        ["Jh", "3s"],
        ["Kh", "Kd", "Ks", "Qh", "Qd"],
        "split",
      ],
      // One player improves board FH
      [
        "Board KKK+QQ: player with KK makes quads",
        ["Kc", "Ah"],
        ["Jh", "Jd"],
        ["Kh", "Kd", "Qh", "Qd", "5s"],
        "A",
      ],
      // Both make same FH from board trips
      [
        "Board KKK: pair comparison (A pair beats Q)",
        ["Ah", "Ad"],
        ["Qh", "Qd"],
        ["Kh", "Kd", "Ks", "5s", "2c"],
        "A",
      ],
    ];
    test.each(cases)("%s", (...args) => runCases([args as TC]));
  });
});

// ---------------------------------------------------------------------------
// H. Wheel Straight vs High Straights (20 tests)
// ---------------------------------------------------------------------------
describe("H. Wheel Straight & Straight Edge Cases", () => {
  const cases: TC[] = [
    // Wheel straight A-2-3-4-5 = 5-high (tiebreaker = 5)
    [
      "Wheel A-2-3-4-5 = 5-high straight",
      ["Ah", "2d"],
      ["Kh", "Qd"],
      ["3c", "4s", "5h", "Jd", "9c"],
      "A",
    ],
    // 6-high beats wheel
    [
      "6-high beats wheel (A-2-3-4-5)",
      ["6h", "7d"],
      ["Ah", "2d"],
      ["3c", "4s", "5h", "Ks", "Qc"],
      "A",
    ],
    // Broadway A-K-Q-J-T = 14-high (tiebreaker = 14... but stored as A)
    [
      "Broadway A-K-Q-J-T is 14-high straight",
      ["Ah", "Kd"],
      ["Qh", "Jd"],
      ["Qc", "Js", "Tc", "9h", "2c"],
      "A",
    ],
    // Broadway beats 9-high straight
    [
      "Broadway beats 9-high straight",
      ["Ah", "Kd"],
      ["9h", "8d"],
      ["Qc", "Js", "Tc", "7h", "6c"],
      "A",
    ],
    // Near-wheel: A-2-3-4-6 is NOT a straight
    [
      "A-2-3-4-6 is NOT a straight (gap at 5)",
      ["6d", "2h"],
      ["Kh", "Qd"],
      ["3c", "4h", "As", "Js", "8c"],
      "B",
    ],
    // Near-broadway: A-K-Q-J-9 is NOT a straight
    [
      "A-K-Q-J-9 is NOT a straight (gap at T)",
      ["Ah", "Kd"],
      ["Qh", "Jd"],
      ["9c", "8s", "7h", "6d", "2c"],
      "A",
    ],
    // Wheel in 7-card hand (hidden)
    [
      "Wheel hidden in 7 cards with better board",
      ["Ah", "2h"],
      ["Kd", "Qs"],
      ["3c", "4s", "5h", "Jd", "9c"],
      "A",
    ],
    // A acts as both high card and low card (not wrap-around)
    [
      "A can be low in wheel but not wrap Q-K-A-2-3",
      ["2h", "3d"],
      ["Qh", "Kd"],
      ["Ac", "Jd", "Th", "9s", "8c"],
      "B",
    ],
    // 5-straight consecutive comparisons
    [
      "8-high beats 7-high straight",
      ["8h", "4d"],
      ["7h", "3d"],
      ["5c", "6s", "7d", "Jd", "2c"],
      "A",
    ],
    [
      "T-high beats 9-high straight",
      ["Th", "6d"],
      ["9h", "5d"],
      ["7c", "8s", "9d", "Jd", "2c"],
      "A",
    ],
    [
      "J-high beats T-high straight",
      ["Jh", "7d"],
      ["Th", "6d"],
      ["8c", "9s", "Td", "Kd", "2c"],
      "A",
    ],
    [
      "Q-high beats J-high straight",
      ["Qh", "8d"],
      ["Jh", "7d"],
      ["9c", "Ts", "Jd", "Kd", "2c"],
      "A",
    ],
    [
      "K-high beats Q-high straight",
      ["Kh", "9d"],
      ["Qh", "8d"],
      ["Tc", "Js", "Qd", "Ad", "2c"],
      "A",
    ],
    // Equal straights → split
    [
      "Same straight → split",
      ["Th", "9h"],
      ["Td", "9d"],
      ["8c", "7s", "6h", "2d", "3c"],
      "split",
    ],
    [
      "Both play board straight → split",
      ["2h", "3d"],
      ["4s", "5c"],
      ["6h", "7d", "8c", "9s", "Th"],
      "split",
    ],
    // Straight vs non-straight
    [
      "Straight beats high card",
      ["Ah", "Kd"],
      ["Qh", "Jd"],
      ["2c", "3s", "4h", "5d", "9c"],
      "A",
    ],
    // Wheel is weaker than any other straight
    [
      "Wheel loses to any 6-high straight",
      ["Ah", "2d"],
      ["6h", "7d"],
      ["3c", "4s", "5h", "8d", "Jc"],
      "B",
    ],
    // Duplicate straights in 7 cards
    [
      "Best straight chosen from 7 cards",
      ["Qh", "Jd"],
      ["Ah", "Kh"],
      ["Td", "9s", "8c", "7h", "6d"],
      "A",
    ],
    // Straight using only board cards (split)
    [
      "Both players use only board straight → split",
      ["Ah", "Kd"],
      ["2h", "3d"],
      ["5c", "6s", "7h", "8d", "9c"],
      "split",
    ],
    // Straight vs flush (flush wins)
    [
      "Flush beats straight",
      ["Ah", "9h"],
      ["Kd", "Qd"],
      ["6h", "4h", "2h", "5d", "7c"],
      "A",
    ],
  ];

  test.each(cases)("%s", (...args) => runCases([args as TC]));
});

// ---------------------------------------------------------------------------
// I. Flush Over Flush (25 tests)
// ---------------------------------------------------------------------------
describe("I. Flush Over Flush", () => {
  const cases: TC[] = [
    // Ace-high flush beats King-high flush
    [
      "A-high flush beats K-high flush",
      ["Ah", "9h"],
      ["Kh", "9d"],
      ["5h", "3h", "2h", "Kd", "Qd"],
      "A",
    ],
    [
      "A-high flush beats Q-high flush",
      ["Ah", "7h"],
      ["Qh", "7d"],
      ["5h", "3h", "2h", "Kd", "Jd"],
      "A",
    ],
    [
      "K-high beats Q-high flush",
      ["Kh", "9h"],
      ["Qh", "9d"],
      ["5h", "3h", "2h", "Ad", "Jd"],
      "A",
    ],
    [
      "Q-high beats J-high flush",
      ["Qh", "9h"],
      ["Jh", "9d"],
      ["5h", "3h", "2h", "Ad", "Kd"],
      "A",
    ],
    // Same high, 2nd card decides
    [
      "A-K tied, Q beats J at position 3",
      ["Qh", "2h"],
      ["Jh", "2d"],
      ["Ah", "Kh", "3h", "Jd", "Kd"],
      "A",
    ],
    [
      "A-K tied, J beats T at position 3",
      ["Jh", "2h"],
      ["Th", "2d"],
      ["Ah", "Kh", "3h", "Qd", "Kd"],
      "A",
    ],
    // Same top 4, 5th card decides
    [
      "A-K-Q-J tied, T beats 9 at position 5",
      ["Th", "2d"],
      ["9h", "2s"],
      ["Ah", "Kh", "Qh", "Jh", "5d"],
      "A",
    ],
    [
      "A-K-Q-J tied, 9 beats 8 at position 5",
      ["9h", "2d"],
      ["8h", "2s"],
      ["Ah", "Kh", "Qh", "Jh", "5d"],
      "A",
    ],
    // Same flush → split
    [
      "Identical A-high flush → split",
      ["2s", "3d"],
      ["4c", "5d"],
      ["Ah", "Kh", "9h", "6h", "3h"],
      "split",
    ],
    [
      "Both play board flush → split",
      ["2s", "3d"],
      ["4c", "5d"],
      ["Ah", "Kh", "Qh", "Jh", "Th"],
      "split",
    ],
    // 6 available suit cards — best 5 chosen
    [
      "6 hearts available: best 5 chosen",
      ["Ah", "Kh"],
      ["Qh", "Jh"],
      ["9h", "7h", "5h", "2s", "3d"],
      "A",
    ],
    [
      "6 hearts: A,K,9,7,5 beats A,K,Q,J vs A,K,9,7,5",
      ["Jh", "8h"],
      ["2h", "3d"],
      ["Ah", "Kh", "9h", "7h", "5h"],
      "A",
    ],
    // Flush vs non-flush
    [
      "Flush beats straight",
      ["Ah", "9h"],
      ["Kd", "Qd"],
      ["5h", "3h", "2h", "Jc", "Tc"],
      "A",
    ],
    [
      "Flush beats trips",
      ["Ah", "9h"],
      ["7d", "7c"],
      ["5h", "3h", "2h", "7h", "Kd"],
      "A",
    ],
    // Flush where board has 5 of same suit
    [
      "Board has 5-card flush: both play it → split",
      ["2d", "3c"],
      ["4d", "5c"],
      ["Ah", "Kh", "9h", "7h", "5h"],
      "split",
    ],
    // Flush with 7 cards, non-flush cards ignored
    [
      "Best flush ignores off-suit aces",
      ["Ah", "3h"],
      ["Kh", "4h"],
      ["9h", "7h", "5h", "Ac", "Kd"],
      "A",
    ],
    // Different suit, same values (both flush but different suits = split by values)
    [
      "Same flush values different suits → split",
      ["2s", "4d"],
      ["3c", "5d"],
      ["Ah", "Kh", "Qh", "9h", "6h"],
      "split",
    ],
    // Flush vs full house (FH wins)
    [
      "Full house beats flush",
      ["Kh", "Kd"],
      ["Ah", "9h"],
      ["Kc", "Qh", "Qd", "7h", "3h"],
      "A",
    ],
    // Flush vs flush with all 5 board cards
    [
      "Board flush best 5 vs hole flush",
      ["6h", "7h"],
      ["2s", "3d"],
      ["Ah", "Kh", "Qh", "Jh", "9h"],
      "split",
    ],
    // Flush improvements
    [
      "9-high flush loses to A-high flush",
      ["9h", "8h"],
      ["Ah", "2h"],
      ["5h", "4h", "3h", "Kd", "Qd"],
      "B",
    ],
    // Test that non-flush combination can beat flush? (No — flush always > straight/trips)
    [
      "Flush beats full house? No: FH > flush",
      ["Kh", "Kd"],
      ["Ah", "Jh"],
      ["Kc", "Qd", "Qh", "7h", "5h"],
      "A",
    ],
    // Flush ties with exactly same 5 cards on board
    [
      "Board flush A-K-Q-J-9: hole irrelevant → split",
      ["2d", "3c"],
      ["4s", "6c"],
      ["Ah", "Kh", "Qh", "Jh", "9h"],
      "split",
    ],
    // Flush: position 4 decides
    [
      "A-K-Q tied, J beats 9 at position 4 of flush",
      ["Jh", "2d"],
      ["9h", "2s"],
      ["Ah", "Kh", "Qh", "4h", "2c"],
      "A",
    ],
    // Flush vs SF (SF wins)
    [
      "Straight flush beats regular flush",
      ["6h", "7h"],
      ["Ah", "9h"],
      ["5h", "4h", "3h", "Kd", "Qd"],
      "A",
    ],
    // Same rank flush different kicker positions
    [
      "A-K-Q-J-T (broadway) flush vs A-K-Q-J-9 flush",
      ["Th", "2d"],
      ["9h", "2s"],
      ["Ah", "Kh", "Qh", "Jh", "5d"],
      "A",
    ],
  ];

  test.each(cases)("%s", (...args) => runCases([args as TC]));
});

// ---------------------------------------------------------------------------
// J. Straight Flush Edge Cases (15 tests)
// ---------------------------------------------------------------------------
describe("J. Straight Flush Edge Cases", () => {
  const cases: TC[] = [
    // Steel wheel A-2-3-4-5 suited
    [
      "Steel wheel A-2-3-4-5 suited = SF",
      ["Ah", "2h"],
      ["Kh", "Qd"],
      ["3h", "4h", "5h", "Jd", "9c"],
      "A",
    ],
    // 6-high SF beats steel wheel
    [
      "6-high SF beats 5-high SF (steel wheel)",
      ["6h", "7d"],
      ["Ah", "2d"],
      ["3h", "4h", "5h", "Kd", "Jc"],
      "A",
    ],
    // 9-high SF beats 8-high SF
    [
      "9-high SF beats 8-high SF",
      ["9h", "5d"],
      ["8h", "4d"],
      ["5h", "6h", "7h", "8h", "Kd"],
      "A",
    ],
    // Royal Flush beats straight flush
    [
      "Royal Flush beats any straight flush",
      ["Ah", "Kh"],
      ["Ks", "Qs"],
      ["Qh", "Jh", "Th", "9s", "8s"],
      "A",
    ],
    // Straight flush beats regular flush
    [
      "SF beats regular flush",
      ["6h", "7h"],
      ["Ah", "9h"],
      ["5h", "4h", "3h", "Kd", "Qd"],
      "A",
    ],
    // Straight flush beats straight
    [
      "SF beats regular straight",
      ["6h", "7h"],
      ["Ah", "Kd"],
      ["5h", "4h", "3h", "2c", "Qd"],
      "A",
    ],
    // Straight flush beats four of a kind? No — quads beat SF
    [
      "Four of a kind beats straight flush",
      ["Kh", "Kd"],
      ["9h", "8h"],
      ["Kc", "Ks", "7h", "6h", "5h"],
      "B",
    ],
    // Two players with different SF
    [
      "Q-high SF beats J-high SF",
      ["Qh", "8h"],
      ["Jh", "7h"],
      ["9h", "Th", "Jh", "Kd", "2c"],
      "A",
    ],
    // Both players have same SF → split
    [
      "Same SF from board → split",
      ["2s", "3d"],
      ["4c", "5d"],
      ["9h", "8h", "7h", "6h", "5h"],
      "split",
    ],
    // SF vs quads (quads win)
    [
      "Quads beat straight flush",
      ["Ah", "Ad"],
      ["9h", "8h"],
      ["Ac", "As", "7h", "6h", "5h"],
      "B",
    ],
    // 7-card SF detection
    [
      "SF detected from 7-card hand",
      ["Th", "9h"],
      ["Ah", "Kd"],
      ["8h", "7h", "6h", "2c", "3d"],
      "A",
    ],
    // Near-SF: 4 of one suit + 1 different
    [
      "Near-SF is just flush, not SF",
      ["Ah", "9h"],
      ["8h", "7h"],
      ["6h", "5h", "4c", "3d", "2s"],
      "B",
    ],
    // Royal Flush from 7 cards
    [
      "Royal Flush found in 7 cards",
      ["Ah", "Kh"],
      ["Ks", "Kd"],
      ["Qh", "Jh", "Th", "2s", "3d"],
      "A",
    ],
    // Steel wheel vs wheel straight (SF vs regular)
    [
      "Steel wheel SF beats wheel straight",
      ["Ah", "2h"],
      ["Ac", "2d"],
      ["3h", "4h", "5h", "3d", "4d"],
      "A",
    ],
    // SF comparison: higher high card wins
    [
      "T-high SF beats 6-high SF",
      ["Th", "9h"],
      ["6h", "7h"],
      ["8h", "7h", "6h", "5h", "4h"],
      "A",
    ],
  ];

  test.each(cases)("%s", (...args) => runCases([args as TC]));
});

// ---------------------------------------------------------------------------
// K. Multi-Player Showdowns (3+ players) (20 tests)
// ---------------------------------------------------------------------------
describe("K. Multi-Player Showdowns", () => {
  it("three players — best hand wins", () => {
    const players = [
      { id: "A", holeCards: cs("Ah", "Ad") },
      { id: "B", holeCards: cs("Kh", "Kd") },
      { id: "C", holeCards: cs("Qh", "Qd") },
    ];
    const comm = cs("Jc", "Tc", "9h", "5s", "2d");
    const { winners } = determineWinners(players, comm);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe("A");
  });

  it("three players — split between two, third loses", () => {
    const players = [
      { id: "A", holeCards: cs("Ah", "Kh") },
      { id: "B", holeCards: cs("As", "Ks") },
      { id: "C", holeCards: cs("Qh", "Jd") },
    ];
    const comm = cs("Qc", "Jc", "Th", "2s", "3d");
    const { winners } = determineWinners(players, comm);
    expect(winners).toHaveLength(2);
    expect(winners.map((w) => w.playerId).sort()).toEqual(["A", "B"]);
  });

  it("three-way split — all play board hand", () => {
    const players = [
      { id: "A", holeCards: cs("2s", "3d") },
      { id: "B", holeCards: cs("4s", "5d") },
      { id: "C", holeCards: cs("6s", "7d") },
    ];
    const comm = cs("Ah", "Kh", "Qh", "Jh", "Th");
    const { winners } = determineWinners(players, comm);
    expect(winners).toHaveLength(3);
  });

  it("four players — single winner", () => {
    const players = [
      { id: "A", holeCards: cs("Ah", "Ad") },
      { id: "B", holeCards: cs("Kh", "Kd") },
      { id: "C", holeCards: cs("Qh", "Qd") },
      { id: "D", holeCards: cs("Jh", "Jd") },
    ];
    const comm = cs("9h", "7d", "5s", "3c", "2d");
    const { winners } = determineWinners(players, comm);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe("A");
  });

  it("four players — two way split", () => {
    const players = [
      { id: "A", holeCards: cs("Ah", "Kh") },
      { id: "B", holeCards: cs("As", "Ks") },
      { id: "C", holeCards: cs("Qh", "Jd") },
      { id: "D", holeCards: cs("2h", "3d") },
    ];
    const comm = cs("Ac", "Kd", "Qd", "Jh", "9c");
    const { winners } = determineWinners(players, comm);
    expect(winners).toHaveLength(2);
    expect(winners.map((w) => w.playerId).sort()).toEqual(["A", "B"]);
  });

  it("hands object contains all players", () => {
    const players = [
      { id: "A", holeCards: cs("Ah", "Ad") },
      { id: "B", holeCards: cs("Kh", "Kd") },
      { id: "C", holeCards: cs("2h", "3d") },
    ];
    const { hands } = determineWinners(
      players,
      cs("Qc", "Jd", "Th", "5s", "2c"),
    );
    expect(hands).toHaveLength(3);
    expect(hands.map((h) => h.playerId).sort()).toEqual(["A", "B", "C"]);
  });

  it("each hand has rank and name", () => {
    const players = [
      { id: "A", holeCards: cs("Ah", "Ad") },
      { id: "B", holeCards: cs("Kh", "Qd") },
    ];
    const { hands } = determineWinners(
      players,
      cs("Kd", "Qh", "Jc", "Tc", "2s"),
    );
    for (const h of hands) {
      expect(h.hand.rank).toBeGreaterThanOrEqual(0);
      expect(h.hand.name).toBeTruthy();
      expect(Array.isArray(h.hand.tiebreakers)).toBe(true);
    }
  });

  it("best hand includes winning cards array", () => {
    const hole = cs("Ah", "Kh");
    const comm = cs("Qh", "Jh", "Th", "2s", "3d");
    const result = bestHand(hole, comm);
    expect(result.cards).toHaveLength(5);
    expect(result.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
  });

  it("three players — trips vs two pair vs pair", () => {
    const players = [
      { id: "trips", holeCards: cs("7h", "7d") },
      { id: "twopair", holeCards: cs("Kh", "Qd") },
      { id: "pair", holeCards: cs("Ah", "2d") },
    ];
    const comm = cs("7c", "Ks", "Qh", "Jd", "4c");
    const { winners } = determineWinners(players, comm);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe("trips");
  });

  it("5 players — quads vs full house vs flush vs straight vs trips", () => {
    const players = [
      { id: "quads", holeCards: cs("Ah", "Ad") },
      { id: "fullhouse", holeCards: cs("Kh", "Kd") },
      { id: "flush", holeCards: cs("9h", "8h") },
      { id: "straight", holeCards: cs("Ts", "Jd") },
      { id: "trips", holeCards: cs("Qh", "Qd") },
    ];
    const comm = cs("Ac", "As", "Kc", "Qc", "2h");
    const { winners } = determineWinners(players, comm);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe("quads");
  });

  it("compareHands returns 0 for identical hands", () => {
    const h1 = bestHand(cs("Ah", "Kh"), cs("Qh", "Jh", "Th", "2s", "3d"));
    const h2 = bestHand(cs("Ah", "Kh"), cs("Qh", "Jh", "Th", "2s", "3d"));
    expect(compareHands(h1, h2)).toBe(0);
  });

  it("compareHands is antisymmetric", () => {
    const higher = bestHand(cs("Ah", "Ad"), cs("Kh", "Kd", "Qc", "5s", "2d"));
    const lower = bestHand(cs("Kh", "Kd"), cs("Qh", "Qd", "Jc", "5s", "2d"));
    expect(Math.sign(compareHands(higher, lower))).toBe(1);
    expect(Math.sign(compareHands(lower, higher))).toBe(-1);
  });

  it("compareHands: full house vs flush", () => {
    const fh = bestHand(cs("Kh", "Kd"), cs("Kc", "Qh", "Qd", "2c", "3s"));
    const flush = bestHand(cs("Ah", "9h"), cs("6h", "3h", "2h", "Ks", "Qd"));
    expect(compareHands(fh, flush)).toBeGreaterThan(0);
  });

  it("compareHands: equal straights", () => {
    const s1 = bestHand(cs("Th", "9h"), cs("8c", "7s", "6d", "2h", "3c"));
    const s2 = bestHand(cs("Td", "9d"), cs("8c", "7s", "6d", "2h", "3c"));
    expect(compareHands(s1, s2)).toBe(0);
  });

  it("5-way tie — all play same board", () => {
    const players = [
      { id: "p1", holeCards: cs("2s", "3d") },
      { id: "p2", holeCards: cs("4s", "5d") },
      { id: "p3", holeCards: cs("6s", "7d") },
      { id: "p4", holeCards: cs("8s", "9d") },
      { id: "p5", holeCards: cs("Tc", "Jd") },
    ];
    const comm = cs("Ah", "Kh", "Qh", "Jh", "Th");
    const { winners } = determineWinners(players, comm);
    expect(winners).toHaveLength(5);
  });

  it("compareHands: two pair vs one pair", () => {
    const tp = bestHand(cs("Kh", "Kd"), cs("Qc", "Qs", "Jh", "2c", "3d"));
    const op = bestHand(cs("Ah", "Ad"), cs("Ks", "Qh", "Jd", "2c", "3s"));
    expect(compareHands(tp, op)).toBeGreaterThan(0);
  });

  it("compareHands: quads vs full house", () => {
    const q = bestHand(cs("Ah", "Ad"), cs("Ac", "As", "Kh", "2c", "3d"));
    const f = bestHand(cs("Kh", "Kd"), cs("Kc", "Qh", "Qd", "2c", "3s"));
    expect(compareHands(q, f)).toBeGreaterThan(0);
  });

  it("wheel straight tiebreaker is 5", () => {
    const wheel = bestHand(cs("Ah", "2d"), cs("3c", "4s", "5h", "Kd", "Qc"));
    expect(wheel.rank).toBe(HAND_RANKS.STRAIGHT);
    expect(wheel.tiebreakers[0]).toBe(5);
  });

  it("broadway straight tiebreaker is 14", () => {
    const broadway = bestHand(cs("Ah", "Kd"), cs("Qc", "Js", "Th", "2d", "3c"));
    expect(broadway.rank).toBe(HAND_RANKS.STRAIGHT);
    expect(broadway.tiebreakers[0]).toBe(14);
  });

  it("wheel loses to any other straight", () => {
    const wheel = bestHand(cs("Ah", "2d"), cs("3c", "4s", "5h", "Kd", "Qc"));
    const sixhigh = bestHand(cs("6h", "2s"), cs("3c", "4s", "5h", "Kd", "Qc"));
    expect(compareHands(wheel, sixhigh)).toBeLessThan(0);
  });
});
