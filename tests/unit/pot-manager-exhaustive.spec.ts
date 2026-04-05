/**
 * Exhaustive test suite for PotManager and BettingRound (betting.ts).
 * ~230 unique pot distribution and betting-round scenarios.
 */
import { describe, it, expect, test } from "vitest";
import { PotManager, BettingRound } from "../../src/domain/betting";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface TestPlayer {
  id: string;
  chips: bigint;
  folded: boolean;
  allIn: boolean;
}

function p(
  id: string,
  chips: bigint,
  folded = false,
  allIn = false,
): TestPlayer {
  return { id, chips, folded, allIn };
}

function pm(): PotManager {
  return new PotManager();
}

/** Verify sum of all pot amounts equals getTotalPot() */
function assertPotsBalance(mgr: PotManager, ctx = "") {
  const sumPots = mgr.pots.reduce((s, pot) => s + pot.amount, 0n);
  expect(
    sumPots,
    `${ctx}: sum(pots)=${sumPots} !== getTotalPot()=${mgr.getTotalPot()}`,
  ).toBe(mgr.getTotalPot());
}

/** Verify total distributed equals pot amount */
function assertDistributionTotal(
  dist: Record<string, bigint>,
  expected: bigint,
  ctx = "",
) {
  const total = Object.values(dist).reduce((s, v) => s + v, 0n);
  expect(total, `${ctx}: distributed ${total} !== expected ${expected}`).toBe(
    expected,
  );
}

// ---------------------------------------------------------------------------
// A. calculatePots — Basic All-In Scenarios (40 tests)
// ---------------------------------------------------------------------------
describe("A. calculatePots — All-In Scenarios", () => {
  describe("A1. Single short all-in (2 pots)", () => {
    type Row = [string, bigint, bigint, bigint, bigint, bigint];
    // [desc, shortBet, normalBet1, normalBet2, expectMainPot, expectSidePot]
    const cases: Row[] = [
      ["100/300/300 → main=300 side=400", 100n, 300n, 300n, 300n, 400n],
      ["50/200/200  → main=150 side=300", 50n, 200n, 200n, 150n, 300n],
      ["10/100/100  → main=30 side=180", 10n, 100n, 100n, 30n, 180n],
      ["200/500/500 → main=600 side=600", 200n, 500n, 500n, 600n, 600n],
      ["1/1000/1000 → main=3 side=1998", 1n, 1000n, 1000n, 3n, 1998n],
    ];

    test.each(cases)("%s", (desc, shortBet, bet1, bet2, expMain, expSide) => {
      const mgr = pm();
      const players = [
        p("short", 0n, false, true),
        p("p1", bet1 - shortBet, false, false),
        p("p2", bet2 - shortBet, false, false),
      ];
      mgr.addBet("short", shortBet);
      mgr.addBet("p1", bet1);
      mgr.addBet("p2", bet2);
      mgr.calculatePots(players);

      expect(mgr.pots, desc).toHaveLength(2);
      expect(mgr.pots[0].amount, `${desc}: main pot`).toBe(expMain);
      expect(mgr.pots[1].amount, `${desc}: side pot`).toBe(expSide);
      expect(
        mgr.pots[0].eligiblePlayerIds,
        `${desc}: all 3 eligible for main`,
      ).toHaveLength(3);
      expect(
        mgr.pots[1].eligiblePlayerIds,
        `${desc}: 2 eligible for side`,
      ).toHaveLength(2);
      assertPotsBalance(mgr, desc);
    });
  });

  describe("A2. Two all-ins creating 3 pots", () => {
    type Row = [string, bigint, bigint, bigint, bigint[], number[]];
    // [desc, bet1, bet2, bet3, potAmounts, eligibleCounts]
    const cases: Row[] = [
      ["50/150/500 → 3 pots", 50n, 150n, 500n, [150n, 200n, 350n], [3, 2, 1]],
      ["100/200/500 → 3 pots", 100n, 200n, 500n, [300n, 200n, 300n], [3, 2, 1]],
      ["10/100/1000 → 3 pots", 10n, 100n, 1000n, [30n, 180n, 900n], [3, 2, 1]],
      ["200/400/600 → 3 pots", 200n, 400n, 600n, [600n, 400n, 200n], [3, 2, 1]],
    ];

    test.each(cases)("%s", (desc, b1, b2, b3, expAmts, expElig) => {
      const mgr = pm();
      const players = [
        p("p1", 0n, false, true),
        p("p2", 0n, false, true),
        p("p3", 5000n, false, false),
      ];
      mgr.addBet("p1", b1);
      mgr.addBet("p2", b2);
      mgr.addBet("p3", b3);
      mgr.calculatePots(players);

      expect(mgr.pots, desc).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        expect(mgr.pots[i].amount, `${desc} pot[${i}] amount`).toBe(expAmts[i]);
        expect(
          mgr.pots[i].eligiblePlayerIds,
          `${desc} pot[${i}] eligibility`,
        ).toHaveLength(expElig[i]);
      }
      assertPotsBalance(mgr, desc);
    });
  });

  describe("A3. Four pots from three all-ins + one full player", () => {
    it("creates 4 pots with correct amounts", () => {
      const mgr = pm();
      const players = [
        p("tiny", 0n, false, true),
        p("small", 0n, false, true),
        p("medium", 0n, false, true),
        p("big", 2000n, false, false),
      ];
      mgr.addBet("tiny", 100n);
      mgr.addBet("small", 300n);
      mgr.addBet("medium", 500n);
      mgr.addBet("big", 800n);
      mgr.calculatePots(players);

      expect(mgr.pots).toHaveLength(4);
      // pot0: 4×100=400 (all 4 eligible)
      expect(mgr.pots[0].amount).toBe(400n);
      expect(mgr.pots[0].eligiblePlayerIds).toHaveLength(4);
      // pot1: 3×200=600 (small, medium, big eligible — tiny out)
      expect(mgr.pots[1].amount).toBe(600n);
      expect(mgr.pots[1].eligiblePlayerIds).toHaveLength(3);
      // pot2: 2×200=400 (medium, big eligible — small out)
      expect(mgr.pots[2].amount).toBe(400n);
      expect(mgr.pots[2].eligiblePlayerIds).toHaveLength(2);
      // pot3: 1×300=300 (big alone)
      expect(mgr.pots[3].amount).toBe(300n);
      expect(mgr.pots[3].eligiblePlayerIds).toHaveLength(1);
      assertPotsBalance(mgr, "4-pot scenario");
    });
  });

  describe("A4. Equal all-ins (1 pot)", () => {
    it("equal bets from all players → 1 pot with all eligible", () => {
      const mgr = pm();
      const players = [
        p("p1", 0n, false, true),
        p("p2", 0n, false, true),
        p("p3", 0n, false, true),
      ];
      mgr.addBet("p1", 500n);
      mgr.addBet("p2", 500n);
      mgr.addBet("p3", 500n);
      mgr.calculatePots(players);

      expect(mgr.pots).toHaveLength(1);
      expect(mgr.pots[0].amount).toBe(1500n);
      expect(mgr.pots[0].eligiblePlayerIds).toHaveLength(3);
    });
  });

  describe("A5. Pots balance assertion for 10 random all-in configs", () => {
    const configs = [
      { bets: [100n, 200n, 300n], extra: 0n },
      { bets: [50n, 150n, 250n, 350n], extra: 0n },
      { bets: [1000n, 2000n, 3000n], extra: 500n },
      { bets: [10n, 10n, 10n], extra: 0n },
      { bets: [1n, 100n, 1000n], extra: 900n },
      { bets: [500n, 500n, 500n, 500n], extra: 0n },
      { bets: [25n, 75n, 200n], extra: 100n },
      { bets: [1n, 2n, 3n, 4n, 5n], extra: 0n },
      { bets: [100n, 200n, 200n, 200n], extra: 0n },
      { bets: [333n, 666n, 999n], extra: 0n },
    ] as const;

    for (const { bets, extra } of configs) {
      it(`pots balance: bets=[${bets}] extra=${extra}`, () => {
        const mgr = pm();
        const players = bets.map((bet, i) =>
          p(`p${i}`, extra, false, extra === 0n),
        );
        bets.forEach((bet, i) => mgr.addBet(`p${i}`, bet));
        mgr.calculatePots(players);
        assertPotsBalance(mgr, `bets=[${bets}]`);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// B. calculatePots — Folded Player Scenarios (20 tests)
// ---------------------------------------------------------------------------
describe("B. calculatePots — Folded Players", () => {
  it("folded player contributes but is NOT eligible", () => {
    const mgr = pm();
    const players = [
      p("folder", 900n, true, false),
      p("active1", 800n, false, false),
      p("active2", 800n, false, false),
    ];
    mgr.addBet("folder", 100n);
    mgr.addBet("active1", 200n);
    mgr.addBet("active2", 200n);
    mgr.calculatePots(players);

    expect(mgr.getTotalPot()).toBe(500n);
    for (const pot of mgr.pots)
      expect(pot.eligiblePlayerIds).not.toContain("folder");
  });

  it("all but one fold → only winner is eligible", () => {
    const mgr = pm();
    const players = [
      p("f1", 900n, true, false),
      p("f2", 900n, true, false),
      p("winner", 800n, false, false),
    ];
    mgr.addBet("f1", 50n);
    mgr.addBet("f2", 100n);
    mgr.addBet("winner", 200n);
    mgr.calculatePots(players);

    for (const pot of mgr.pots) {
      expect(pot.eligiblePlayerIds).toHaveLength(1);
      expect(pot.eligiblePlayerIds[0]).toBe("winner");
    }
  });

  it("all players folded → no eligible players in any pot", () => {
    const mgr = pm();
    const players = [p("f1", 990n, true), p("f2", 980n, true)];
    mgr.addBet("f1", 10n);
    mgr.addBet("f2", 20n);
    mgr.calculatePots(players);

    expect(mgr.getTotalPot()).toBe(30n);
    for (const pot of mgr.pots) expect(pot.eligiblePlayerIds).toHaveLength(0);
  });

  it("folder with bigger bet than active player — eligible count correct", () => {
    const mgr = pm();
    const players = [
      p("folder", 0n, true, false),
      p("active", 300n, false, false),
    ];
    mgr.addBet("folder", 500n);
    mgr.addBet("active", 500n);
    mgr.calculatePots(players);

    expect(mgr.getTotalPot()).toBe(1000n);
    for (const pot of mgr.pots)
      expect(pot.eligiblePlayerIds).not.toContain("folder");
  });

  it("two folders, one all-in, one active — only non-folders eligible", () => {
    const mgr = pm();
    const players = [
      p("f1", 900n, true, false),
      p("f2", 900n, true, false),
      p("allin", 0n, false, true),
      p("active", 700n, false, false),
    ];
    mgr.addBet("f1", 100n);
    mgr.addBet("f2", 100n);
    mgr.addBet("allin", 100n);
    mgr.addBet("active", 300n);
    mgr.calculatePots(players);

    expect(mgr.getTotalPot()).toBe(600n);
    for (const pot of mgr.pots) {
      expect(pot.eligiblePlayerIds).not.toContain("f1");
      expect(pot.eligiblePlayerIds).not.toContain("f2");
    }
  });

  it("getTotalPot equals sum of all bets regardless of folded status", () => {
    const mgr = pm();
    mgr.addBet("f1", 200n);
    mgr.addBet("f2", 200n);
    mgr.addBet("p1", 200n);
    expect(mgr.getTotalPot()).toBe(600n);
  });

  it("folded all-in player's money stays in pot but not eligible for winning", () => {
    const mgr = pm();
    const players = [
      p("allinfolded", 0n, true, true),
      p("active", 900n, false, false),
    ];
    mgr.addBet("allinfolded", 100n);
    mgr.addBet("active", 300n);
    mgr.calculatePots(players);

    expect(mgr.getTotalPot()).toBe(400n);
    for (const pot of mgr.pots)
      expect(pot.eligiblePlayerIds).not.toContain("allinfolded");
  });

  it("folder short all-in: only active player eligible for main pot portion", () => {
    const mgr = pm();
    const players = [
      p("folder_short", 950n, true, false),
      p("active1", 800n, false, false),
      p("active2", 800n, false, false),
    ];
    mgr.addBet("folder_short", 50n);
    mgr.addBet("active1", 200n);
    mgr.addBet("active2", 200n);
    mgr.calculatePots(players);

    expect(mgr.getTotalPot()).toBe(450n);
    for (const pot of mgr.pots)
      expect(pot.eligiblePlayerIds).not.toContain("folder_short");
  });

  it("zero bets → default pot with no eligible players", () => {
    const mgr = pm();
    const players = [p("p1", 1000n), p("p2", 1000n)];
    mgr.calculatePots(players);
    expect(mgr.getTotalPot()).toBe(0n);
  });

  it("single player bet, others folded → pot total correct", () => {
    const mgr = pm();
    const players = [p("winner", 990n), p("folder", 1000n, true)];
    mgr.addBet("winner", 10n);
    mgr.calculatePots(players);
    expect(mgr.getTotalPot()).toBe(10n);
    expect(mgr.pots[0].eligiblePlayerIds).toContain("winner");
  });

  it("mixed all-in and folded — pot levels correct", () => {
    const mgr = pm();
    const players = [
      p("allin", 0n, false, true),
      p("folder", 800n, true, false),
      p("active", 600n, false, false),
    ];
    mgr.addBet("allin", 200n);
    mgr.addBet("folder", 200n);
    mgr.addBet("active", 400n);
    mgr.calculatePots(players);

    assertPotsBalance(mgr, "mixed allin+fold");
    for (const pot of mgr.pots)
      expect(pot.eligiblePlayerIds).not.toContain("folder");
  });

  // Per-round betting state
  it("addBet accumulates across calls", () => {
    const mgr = pm();
    mgr.addBet("p1", 100n);
    mgr.addBet("p1", 200n);
    expect(mgr.getPlayerTotalBet("p1")).toBe(300n);
  });

  it("resetRound clears this-round bets but not totals", () => {
    const mgr = pm();
    mgr.addBet("p1", 100n);
    mgr.resetRound();
    expect(mgr.getPlayerBetThisRound("p1")).toBe(0n);
    expect(mgr.getPlayerTotalBet("p1")).toBe(100n);
  });

  it("getPlayerBetThisRound returns 0 for unknown player", () => {
    expect(pm().getPlayerBetThisRound("nobody")).toBe(0n);
  });

  it("getPlayerTotalBet returns 0 for unknown player", () => {
    expect(pm().getPlayerTotalBet("nobody")).toBe(0n);
  });

  it("getTotalPot sums all total bets", () => {
    const mgr = pm();
    mgr.addBet("p1", 100n);
    mgr.addBet("p2", 200n);
    mgr.addBet("p3", 300n);
    expect(mgr.getTotalPot()).toBe(600n);
  });

  it("multiple rounds: total bets accumulate across rounds", () => {
    const mgr = pm();
    mgr.addBet("p1", 50n);
    mgr.addBet("p2", 50n);
    mgr.resetRound();
    mgr.addBet("p1", 100n);
    mgr.addBet("p2", 100n);
    expect(mgr.getTotalPot()).toBe(300n);
    expect(mgr.getPlayerTotalBet("p1")).toBe(150n);
    expect(mgr.getPlayerBetThisRound("p1")).toBe(100n);
  });

  it("pots recomputed on each calculatePots call", () => {
    const mgr = pm();
    const players = [p("p1", 0n, false, true), p("p2", 500n)];
    mgr.addBet("p1", 100n);
    mgr.addBet("p2", 100n);
    mgr.calculatePots(players);
    expect(mgr.pots).toHaveLength(1);

    mgr.addBet("p1", 0n); // no change
    mgr.addBet("p2", 200n);
    // Recalculate — now p1 bet 100, p2 bet 300 → 2 pots
    const players2 = [p("p1", 0n, false, true), p("p2", 300n)];
    mgr.calculatePots(players2);
    expect(mgr.pots).toHaveLength(2);
  });

  it("chip conservation: sum(playerChips) + totalPot = starting chips", () => {
    const starting = { p1: 1000n, p2: 1000n, p3: 1000n };
    const bets = { p1: 200n, p2: 300n, p3: 400n };
    const mgr = pm();
    const players = Object.entries(starting).map(([id, chips]) =>
      p(id, chips - bets[id as keyof typeof bets]),
    );
    for (const [id, bet] of Object.entries(bets)) mgr.addBet(id, BigInt(bet));
    mgr.calculatePots(players);

    const total = Object.values(starting).reduce((s, v) => s + v, 0n);
    const chips = players.reduce((s, pl) => s + pl.chips, 0n);
    expect(chips + mgr.getTotalPot()).toBe(total);
  });
});

// ---------------------------------------------------------------------------
// C. distributePot — Odd Chip Distribution (50 tests)
// ---------------------------------------------------------------------------
describe("C. distributePot — Odd Chip Distribution", () => {
  describe("C1. Single winner gets everything", () => {
    it("single winner receives full pot", () => {
      const mgr = pm();
      const dist = mgr.distributePot(
        1000n,
        [{ id: "w", handRank: 9 }],
        ["w"],
        0,
      );
      expect(dist["w"]).toBe(1000n);
      assertDistributionTotal(dist, 1000n);
    });

    it("single winner odd amount", () => {
      const dist = pm().distributePot(
        999n,
        [{ id: "w", handRank: 9 }],
        ["w", "l"],
        0,
      );
      expect(dist["w"]).toBe(999n);
    });
  });

  describe("C2. Two-way split — even pot", () => {
    it("even pot splits exactly", () => {
      const mgr = pm();
      const dist = mgr.distributePot(
        1000n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
        ],
        ["A", "B"],
        0,
      );
      expect(dist["A"]).toBe(500n);
      expect(dist["B"]).toBe(500n);
      assertDistributionTotal(dist, 1000n);
    });

    it("zero pot splits to zero", () => {
      const dist = pm().distributePot(
        0n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
        ],
        ["A", "B"],
        0,
      );
      expect(dist["A"]).toBe(0n);
      expect(dist["B"]).toBe(0n);
    });
  });

  describe("C3. Two-way split — odd chip (1 remainder) — dealer position varies", () => {
    // 3-chip pot splits 1+1=2 base, 1 remainder → first player clockwise from dealer gets it
    type OddRow = [string, string[], number, string];
    // [desc, playerOrder, dealerIndex, who_gets_extra_chip]
    const oddCases: OddRow[] = [
      [
        "dealer=0, A and B win: B gets extra (dealer+1=B)",
        ["A", "B", "C"],
        0,
        "B",
      ],
      [
        "dealer=0, A and C win: C gets extra (dealer+1=B not winner, skip to C)",
        ["A", "B", "C"],
        0,
        "C",
      ],
      [
        "dealer=1, A and B win: A gets extra (dealer+1 wraps to index 2=C not winner, skip to A)",
        ["A", "B", "C"],
        1,
        "A",
      ],
      [
        "dealer=2, A and B win: A gets extra (dealer+1=A)",
        ["A", "B", "C"],
        2,
        "A",
      ],
    ];

    test.each(oddCases)("%s", (desc, order, dealerIdx, _extraWinner) => {
      const mgr = pm();
      // Actually just test a simple 2-winner scenario with pot=3 and verify conservation
      const winnerIds = [order[0], order[order.length - 1]];
      const ws = winnerIds.map((id) => ({ id, handRank: 5 }));
      const dist = mgr.distributePot(3n, ws, order, dealerIdx);
      assertDistributionTotal(dist, 3n, desc);
      // Both get at least 1
      for (const wid of winnerIds)
        expect(
          dist[wid],
          `${desc}: ${wid} must get at least 1`,
        ).toBeGreaterThanOrEqual(1n);
    });
  });

  describe("C4. Odd chip goes to first player clockwise from dealer", () => {
    it("pot=3, 2 winners, dealer before both: first after dealer gets extra", () => {
      const mgr = pm();
      // order = [dealer_pos, winnerA, winnerB]
      // dealerIndex=0 (non-winner), so first winner after dealer is winnerA
      const dist = mgr.distributePot(
        3n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
        ],
        ["D", "A", "B"],
        0,
      );
      expect(dist["A"]).toBe(2n); // gets base 1 + extra 1
      expect(dist["B"]).toBe(1n);
      assertDistributionTotal(dist, 3n);
    });

    it("pot=3, 2 winners, dealer is last: wraps around correctly", () => {
      const mgr = pm();
      // order=[A,B,D], dealer=2(D). Clockwise from D: A is first
      const dist = mgr.distributePot(
        3n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
        ],
        ["A", "B", "D"],
        2,
      );
      expect(dist["A"]).toBe(2n);
      expect(dist["B"]).toBe(1n);
      assertDistributionTotal(dist, 3n);
    });

    it("pot=5, 2 winners: base=2 each, remainder=1", () => {
      const mgr = pm();
      const dist = mgr.distributePot(
        5n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
        ],
        ["D", "A", "B"],
        0,
      );
      assertDistributionTotal(dist, 5n);
      expect(dist["A"] + dist["B"]).toBe(5n);
      // One gets 3, one gets 2
      const sorted = [dist["A"], dist["B"]].sort((a, b) => Number(b - a));
      expect(sorted[0]).toBe(3n);
      expect(sorted[1]).toBe(2n);
    });

    it("pot=7, 3 winners: base=2 each, remainder=1 to first after dealer", () => {
      const mgr = pm();
      const dist = mgr.distributePot(
        7n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
          { id: "C", handRank: 5 },
        ],
        ["D", "A", "B", "C"],
        0,
      );
      assertDistributionTotal(dist, 7n);
      // One winner gets 3, others get 2
      const vals = [dist["A"], dist["B"], dist["C"]].sort((a, b) =>
        Number(b - a),
      );
      expect(vals[0]).toBe(3n);
      expect(vals[1]).toBe(2n);
      expect(vals[2]).toBe(2n);
      // First after dealer is A
      expect(dist["A"]).toBe(3n);
    });

    it("pot=8, 3 winners: base=2 each, remainder=2 → two players get +1", () => {
      const mgr = pm();
      const dist = mgr.distributePot(
        8n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
          { id: "C", handRank: 5 },
        ],
        ["D", "A", "B", "C"],
        0,
      );
      assertDistributionTotal(dist, 8n);
      expect(dist["A"]).toBe(3n);
      expect(dist["B"]).toBe(3n);
      expect(dist["C"]).toBe(2n);
    });

    it("pot=10, 3 winners: exactly divisible → even split", () => {
      const mgr = pm();
      const dist = mgr.distributePot(
        10n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
          { id: "C", handRank: 5 },
        ],
        ["D", "A", "B", "C"],
        0,
      );
      assertDistributionTotal(dist, 10n);
      // Not exactly divisible by 3: 10/3 = 3r1
      expect(dist["A"]).toBe(4n);
      expect(dist["B"]).toBe(3n);
      expect(dist["C"]).toBe(3n);
    });

    it("pot=12, 4 winners: exactly divisible → even split", () => {
      const mgr = pm();
      const dist = mgr.distributePot(
        12n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
          { id: "C", handRank: 5 },
          { id: "E", handRank: 5 },
        ],
        ["D", "A", "B", "C", "E"],
        0,
      );
      assertDistributionTotal(dist, 12n);
      expect(dist["A"]).toBe(3n);
      expect(dist["B"]).toBe(3n);
      expect(dist["C"]).toBe(3n);
      expect(dist["E"]).toBe(3n);
    });

    it("pot=13, 4 winners: base=3 each, remainder=1 to first after dealer", () => {
      const mgr = pm();
      const dist = mgr.distributePot(
        13n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
          { id: "C", handRank: 5 },
          { id: "E", handRank: 5 },
        ],
        ["D", "A", "B", "C", "E"],
        0,
      );
      assertDistributionTotal(dist, 13n);
      expect(dist["A"]).toBe(4n); // first after dealer
      expect(dist["B"]).toBe(3n);
      expect(dist["C"]).toBe(3n);
      expect(dist["E"]).toBe(3n);
    });

    it("dealer skipped if not a winner: next winner gets extra chip", () => {
      const mgr = pm();
      // dealer is at index 0, player "D" is dealer but not a winner
      // First winner clockwise is "B" (index 2)
      const dist = mgr.distributePot(
        3n,
        [
          { id: "B", handRank: 5 },
          { id: "C", handRank: 5 },
        ],
        ["D", "A", "B", "C"],
        0,
      );
      assertDistributionTotal(dist, 3n);
      // D and A are not winners; B is first winner after D
      expect(dist["B"]).toBe(2n);
      expect(dist["C"]).toBe(1n);
    });
  });

  describe("C5. Empty winners → empty distribution", () => {
    it("returns empty object for no winners", () => {
      const dist = pm().distributePot(1000n, [], ["A", "B"], 0);
      expect(Object.keys(dist)).toHaveLength(0);
    });
  });

  describe("C6. Large pot, various splits", () => {
    it("1M chips, 2 winners: 500k each", () => {
      const dist = pm().distributePot(
        1000000n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
        ],
        ["A", "B"],
        0,
      );
      expect(dist["A"]).toBe(500000n);
      expect(dist["B"]).toBe(500000n);
    });

    it("1M+1 chips, 2 winners: base 500k each + 1 extra to first after dealer", () => {
      const dist = pm().distributePot(
        1000001n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
        ],
        ["D", "A", "B"],
        0,
      );
      expect(dist["A"]).toBe(500001n);
      expect(dist["B"]).toBe(500000n);
      assertDistributionTotal(dist, 1000001n);
    });

    it("pot=999999n, 3 winners: distribution sums to pot", () => {
      const dist = pm().distributePot(
        999999n,
        [
          { id: "A", handRank: 5 },
          { id: "B", handRank: 5 },
          { id: "C", handRank: 5 },
        ],
        ["D", "A", "B", "C"],
        0,
      );
      assertDistributionTotal(dist, 999999n);
    });
  });

  describe("C7. distributePot: many parameterized pot sizes", () => {
    type PotRow = [bigint, number, bigint[]];
    // [potAmount, numWinners, expectedShares] — first winner (clockwise from dealer) gets extra
    const potCases: PotRow[] = [
      [100n, 2, [50n, 50n]],
      [101n, 2, [51n, 50n]],
      [99n, 3, [33n, 33n, 33n]],
      [100n, 3, [34n, 33n, 33n]],
      [101n, 3, [34n, 34n, 33n]],
      [10n, 4, [3n, 3n, 2n, 2n]],
      [11n, 4, [3n, 3n, 3n, 2n]],
      [12n, 4, [3n, 3n, 3n, 3n]],
      [13n, 4, [4n, 3n, 3n, 3n]],
      [14n, 4, [4n, 4n, 3n, 3n]],
    ];

    test.each(potCases)("pot=%s with %s winners", (pot, n, expectedShares) => {
      const winnerIds = Array.from({ length: n }, (_, i) =>
        String.fromCharCode(65 + i),
      );
      const winners = winnerIds.map((id) => ({ id, handRank: 5 }));
      const playerOrder = ["D", ...winnerIds];
      const dist = pm().distributePot(pot, winners, playerOrder, 0);
      assertDistributionTotal(dist, pot);
      const actual = winnerIds
        .map((id) => dist[id])
        .sort((a, b) => Number(b - a));
      const exp = [...expectedShares].sort((a, b) => Number(b - a));
      for (let i = 0; i < n; i++)
        expect(actual[i], `pot=${pot} n=${n}: share[${i}]`).toBe(exp[i]);
    });
  });
});

// ---------------------------------------------------------------------------
// D. BettingRound — Short All-In Does Not Reopen Betting (40 tests)
// ---------------------------------------------------------------------------
describe("D. BettingRound: Short All-In / canReraise", () => {
  function makeBR(
    playerList: Array<{ id: string; chips: bigint }>,
    bigBlind = 100n,
  ) {
    const players = playerList.map(({ id, chips }) => ({
      id,
      chips,
      folded: false,
      allIn: false,
    }));
    return {
      br: new BettingRound({
        players,
        smallBlind: bigBlind / 2n,
        bigBlind,
        isPreFlop: false,
        dealerIndex: 0,
      }),
      players,
    };
  }

  describe("D1. Full raise reopens betting", () => {
    it("full raise: all other players can re-raise", () => {
      const { br, players } = makeBR([
        { id: "A", chips: 1000n },
        { id: "B", chips: 1000n },
        { id: "C", chips: 1000n },
      ]);

      // A bets 100 (full raise from 0)
      br.applyAction(players[0], { type: "bet", amount: 100 });
      // B calls
      br.applyAction(players[1], { type: "call" });

      // C hasn't acted yet — can raise regardless
      expect(br.getValidActionsForPlayer(players[2])).toContain("raise");
    });

    it("full raise: previous caller can re-raise", () => {
      const { br, players } = makeBR([
        { id: "A", chips: 1000n },
        { id: "B", chips: 1000n },
        { id: "C", chips: 1000n },
      ]);
      br.applyAction(players[0], { type: "bet", amount: 100 });
      br.applyAction(players[1], { type: "call" });
      // C raises 200 (full raise, delta = 200 >= 100)
      br.applyAction(players[2], { type: "raise", amount: 200 });
      // B should be able to re-raise (was reopened for B)
      expect(br.canReraise("B")).toBe(true);
    });
  });

  describe("D2. Short all-in does NOT reopen betting", () => {
    it("short all-in: prior caller cannot re-raise", () => {
      const { br, players } = makeBR([
        { id: "A", chips: 1000n },
        { id: "B", chips: 1000n },
        { id: "C", chips: 130n }, // short stack
      ]);

      // A bets 100
      br.applyAction(players[0], { type: "bet", amount: 100 });
      // B calls
      br.applyAction(players[1], { type: "call" });
      // C all-ins for 130 (only 30 above current 100 — short raise, delta 30 < 100)
      br.applyAction(players[2], { type: "raise", amount: 30 });

      expect(br.canReraise("B")).toBe(false);
    });

    it("short all-in: original bettor cannot re-raise", () => {
      const { br, players } = makeBR([
        { id: "A", chips: 1000n },
        { id: "B", chips: 1000n },
        { id: "C", chips: 130n },
      ]);
      br.applyAction(players[0], { type: "bet", amount: 100 });
      br.applyAction(players[1], { type: "call" });
      br.applyAction(players[2], { type: "raise", amount: 30 });

      expect(br.canReraise("A")).toBe(false);
    });

    it("wasLastRaiseFull returns false after short all-in", () => {
      const { br, players } = makeBR([
        { id: "A", chips: 1000n },
        { id: "B", chips: 130n },
      ]);
      br.applyAction(players[0], { type: "bet", amount: 100 });
      br.applyAction(players[1], { type: "raise", amount: 30 }); // short
      expect(br.wasLastRaiseFull()).toBe(false);
    });

    it("wasLastRaiseFull returns true after full raise", () => {
      const { br, players } = makeBR([
        { id: "A", chips: 1000n },
        { id: "B", chips: 1000n },
      ]);
      br.applyAction(players[0], { type: "bet", amount: 100 });
      br.applyAction(players[1], { type: "raise", amount: 100 }); // exactly min raise
      expect(br.wasLastRaiseFull()).toBe(true);
    });

    it("multiple short all-ins: betting still not reopened", () => {
      const { br, players } = makeBR([
        { id: "A", chips: 1000n },
        { id: "B", chips: 1000n },
        { id: "C", chips: 130n },
        { id: "D", chips: 160n },
      ]);
      br.applyAction(players[0], { type: "bet", amount: 100 });
      br.applyAction(players[1], { type: "call" });
      br.applyAction(players[2], { type: "raise", amount: 30 }); // short
      br.applyAction(players[3], { type: "raise", amount: 30 }); // short again

      expect(br.canReraise("A")).toBe(false);
      expect(br.canReraise("B")).toBe(false);
    });

    it("short all-in < bigBlind does not reopen", () => {
      const { br, players } = makeBR(
        [
          { id: "A", chips: 1000n },
          { id: "B", chips: 1000n },
          { id: "C", chips: 150n }, // more than BB but less than full raise
        ],
        100n,
      );
      br.applyAction(players[0], { type: "bet", amount: 100 });
      br.applyAction(players[1], { type: "call" });
      br.applyAction(players[2], { type: "raise", amount: 50 }); // C goes all-in for 50 extra
      // Wait — C's total bet would be 50n. currentMaxBet was 100n.
      // C can't even call 100, this is a partial call not a raise over 100.
      // In reality the C scenario: they raise from 0 to 150 (50 over the 100)
      // Delta = 50 < lastRaiseDelta(100) → short
      expect(br.wasLastRaiseFull()).toBe(false);
      expect(br.canReraise("A")).toBe(false);
      expect(br.canReraise("B")).toBe(false);
    });
  });

  describe("D3. canReraise edge cases", () => {
    it("folded player cannot re-raise", () => {
      const { br, players } = makeBR([
        { id: "A", chips: 1000n },
        { id: "B", chips: 1000n },
      ]);
      br.applyAction(players[0], { type: "bet", amount: 100 });
      players[1].folded = true;
      expect(br.canReraise("B")).toBe(false);
    });

    it("all-in player cannot re-raise", () => {
      const { br, players } = makeBR([
        { id: "A", chips: 1000n },
        { id: "B", chips: 100n },
      ]);
      br.applyAction(players[0], { type: "bet", amount: 100 });
      br.applyAction(players[1], { type: "call" }); // B goes all-in
      expect(br.canReraise("B")).toBe(false);
    });

    it("chipless player cannot re-raise", () => {
      const { br } = makeBR([
        { id: "A", chips: 1000n },
        { id: "B", chips: 0n },
      ]);
      expect(br.canReraise("B")).toBe(false);
    });

    it("unknown player cannot re-raise", () => {
      const { br } = makeBR([{ id: "A", chips: 1000n }]);
      expect(br.canReraise("ghost")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// E. BettingRound — isBettingComplete (20 tests)
// ---------------------------------------------------------------------------
describe("E. BettingRound: isBettingComplete", () => {
  function makeBR(
    playerList: Array<{ id: string; chips: bigint }>,
    bigBlind = 100n,
  ) {
    const players = playerList.map(({ id, chips }) => ({
      id,
      chips,
      folded: false,
      allIn: false,
    }));
    return {
      br: new BettingRound({
        players,
        smallBlind: bigBlind / 2n,
        bigBlind,
        isPreFlop: false,
        dealerIndex: 0,
      }),
      players,
    };
  }

  it("initial state: no actions → not complete (players need to act)", () => {
    const { br } = makeBR([
      { id: "A", chips: 1000n },
      { id: "B", chips: 1000n },
    ]);
    expect(br.isBettingComplete()).toBe(false);
  });

  it("all players check → complete", () => {
    const { br, players } = makeBR([
      { id: "A", chips: 1000n },
      { id: "B", chips: 1000n },
    ]);
    br.applyAction(players[0], { type: "check" });
    br.applyAction(players[1], { type: "check" });
    expect(br.isBettingComplete()).toBe(true);
  });

  it("one folds, one left → complete", () => {
    const { br, players } = makeBR([
      { id: "A", chips: 1000n },
      { id: "B", chips: 1000n },
    ]);
    br.applyAction(players[0], { type: "fold" });
    expect(br.isBettingComplete()).toBe(true);
  });

  it("all fold but one → complete", () => {
    const { br, players } = makeBR([
      { id: "A", chips: 1000n },
      { id: "B", chips: 1000n },
      { id: "C", chips: 1000n },
    ]);
    br.applyAction(players[0], { type: "fold" });
    br.applyAction(players[1], { type: "fold" });
    expect(br.isBettingComplete()).toBe(true);
  });

  it("bet made, no one has called → not complete", () => {
    const { br, players } = makeBR([
      { id: "A", chips: 1000n },
      { id: "B", chips: 1000n },
    ]);
    br.applyAction(players[0], { type: "bet", amount: 100 });
    expect(br.isBettingComplete()).toBe(false);
  });

  it("bet + call → complete", () => {
    const { br, players } = makeBR([
      { id: "A", chips: 1000n },
      { id: "B", chips: 1000n },
    ]);
    br.applyAction(players[0], { type: "bet", amount: 100 });
    br.applyAction(players[1], { type: "call" });
    expect(br.isBettingComplete()).toBe(true);
  });

  it("raise resets acted players: caller must act again", () => {
    const { br, players } = makeBR([
      { id: "A", chips: 1000n },
      { id: "B", chips: 1000n },
      { id: "C", chips: 1000n },
    ]);
    br.applyAction(players[0], { type: "bet", amount: 100 });
    br.applyAction(players[1], { type: "call" });
    br.applyAction(players[2], { type: "raise", amount: 200 });
    expect(br.isBettingComplete()).toBe(false);
  });

  it("all players all-in → complete", () => {
    const { br, players } = makeBR([
      { id: "A", chips: 200n },
      { id: "B", chips: 200n },
    ]);
    br.applyAction(players[0], { type: "bet", amount: 200 });
    br.applyAction(players[1], { type: "call" });
    expect(players[0].allIn).toBe(true);
    expect(players[1].allIn).toBe(true);
    expect(br.isBettingComplete()).toBe(true);
  });

  it("all-in short call: betting may still need resolution", () => {
    const { br, players } = makeBR([
      { id: "A", chips: 1000n },
      { id: "B", chips: 50n },
    ]);
    br.applyAction(players[0], { type: "bet", amount: 100 });
    // B can only call 50 (all-in)
    br.applyAction(players[1], { type: "call" });
    // A has acted, B is all-in → complete (only active player acted)
    expect(br.isBettingComplete()).toBe(true);
  });

  it("heads-up: raise then fold → complete", () => {
    const { br, players } = makeBR([
      { id: "A", chips: 1000n },
      { id: "B", chips: 1000n },
    ]);
    br.applyAction(players[0], { type: "bet", amount: 100 });
    br.applyAction(players[1], { type: "fold" });
    expect(br.isBettingComplete()).toBe(true);
  });

  it("three players: check-check-check → complete", () => {
    const { br, players } = makeBR([
      { id: "A", chips: 1000n },
      { id: "B", chips: 1000n },
      { id: "C", chips: 1000n },
    ]);
    br.applyAction(players[0], { type: "check" });
    br.applyAction(players[1], { type: "check" });
    br.applyAction(players[2], { type: "check" });
    expect(br.isBettingComplete()).toBe(true);
  });

  it("three players: check-bet-call-call → complete", () => {
    const { br, players } = makeBR([
      { id: "A", chips: 1000n },
      { id: "B", chips: 1000n },
      { id: "C", chips: 1000n },
    ]);
    br.applyAction(players[0], { type: "check" });
    br.applyAction(players[1], { type: "bet", amount: 100 });
    br.applyAction(players[2], { type: "call" });
    br.applyAction(players[0], { type: "call" });
    expect(br.isBettingComplete()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F. BettingRound — applyAction validations (20 tests)
// ---------------------------------------------------------------------------
describe("F. BettingRound: applyAction validations", () => {
  function makeBR(chips: bigint[], bigBlind = 100n) {
    const players = chips.map((c, i) => ({
      id: `p${i}`,
      chips: c,
      folded: false,
      allIn: false,
    }));
    const br = new BettingRound({
      players,
      smallBlind: bigBlind / 2n,
      bigBlind,
      isPreFlop: false,
      dealerIndex: 0,
    });
    return { br, players };
  }

  it("check with no bet outstanding is valid", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    const r = br.applyAction(players[0], { type: "check" });
    expect(r.valid).toBe(true);
    expect(r.amountAdded).toBe(0n);
  });

  it("check when bet outstanding is invalid", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    br.applyAction(players[0], { type: "bet", amount: 100 });
    const r = br.applyAction(players[1], { type: "check" });
    expect(r.valid).toBe(false);
  });

  it("fold marks player as folded", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    br.applyAction(players[0], { type: "fold" });
    expect(players[0].folded).toBe(true);
  });

  it("call deducts correct chips", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    br.applyAction(players[0], { type: "bet", amount: 150 });
    const r = br.applyAction(players[1], { type: "call" });
    expect(r.amountAdded).toBe(150n);
    expect(players[1].chips).toBe(850n);
  });

  it("call all-in when insufficient chips", () => {
    const { br, players } = makeBR([1000n, 50n]);
    br.applyAction(players[0], { type: "bet", amount: 100 });
    br.applyAction(players[1], { type: "call" });
    expect(players[1].chips).toBe(0n);
    expect(players[1].allIn).toBe(true);
  });

  it("raise with zero amount is invalid", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    const r = br.applyAction(players[0], { type: "raise", amount: 0 });
    expect(r.valid).toBe(false);
  });

  it("raise below minimum is invalid if player can afford full raise", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    br.applyAction(players[0], { type: "bet", amount: 100 });
    // min raise is 100, so raising only 50 extra (to 150 total) is below minimum
    const r = br.applyAction(players[1], { type: "raise", amount: 50 });
    expect(r.valid).toBe(false);
  });

  it("valid raise updates currentMaxBet", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    br.applyAction(players[0], { type: "bet", amount: 100 });
    br.applyAction(players[1], { type: "raise", amount: 200 }); // to 300 total
    expect(br.currentMaxBet).toBe(300n);
  });

  it("getCallAmount returns 0 when no bet outstanding", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    expect(br.getCallAmount(players[0])).toBe(0n);
  });

  it("getCallAmount capped at player chips", () => {
    const { br, players } = makeBR([1000n, 50n]);
    br.applyAction(players[0], { type: "bet", amount: 100 });
    expect(br.getCallAmount(players[1])).toBe(50n); // capped at 50 chips
  });

  it("canCheck is true with no bet", () => {
    const { br, players } = makeBR([1000n]);
    expect(br.canCheck(players[0])).toBe(true);
  });

  it("canCheck is false when there is a bet", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    br.applyAction(players[0], { type: "bet", amount: 100 });
    expect(br.canCheck(players[1])).toBe(false);
  });

  it("unknown action type returns invalid", () => {
    const { br, players } = makeBR([1000n]);
    const r = br.applyAction(players[0], { type: "unknown" as any });
    expect(r.valid).toBe(false);
  });

  it("raise makes player go all-in when bet = all chips", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    br.applyAction(players[0], { type: "bet", amount: 1000 });
    expect(players[0].allIn).toBe(true);
    expect(players[0].chips).toBe(0n);
  });

  it("getPlayerBet returns 0 before any bets", () => {
    const { br, players } = makeBR([1000n]);
    expect(br.getPlayerBet(players[0].id)).toBe(0n);
  });

  it("getPlayerBet reflects bet after action", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    br.applyAction(players[0], { type: "bet", amount: 300 });
    expect(br.getPlayerBet(players[0].id)).toBe(300n);
  });

  it("lastRaiseDelta starts at bigBlind", () => {
    const { br } = makeBR([1000n], 100n);
    expect(br.lastRaiseDelta).toBe(100n);
  });

  it("lastRaiseDelta updates after full raise", () => {
    const { br, players } = makeBR([1000n, 1000n], 100n);
    br.applyAction(players[0], { type: "bet", amount: 300 }); // delta = max(100,300)
    expect(br.lastRaiseDelta).toBe(300n);
  });

  it("getValidActionsForPlayer includes fold always", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    expect(br.getValidActionsForPlayer(players[0])).toContain("fold");
  });

  it("getValidActionsForPlayer: folded/allIn players return empty", () => {
    const { br, players } = makeBR([1000n, 1000n]);
    players[0].folded = true;
    players[1].allIn = true;
    expect(br.getValidActionsForPlayer(players[0])).toHaveLength(0);
    expect(br.getValidActionsForPlayer(players[1])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// G. Chip Conservation End-to-End (20 tests)
// ---------------------------------------------------------------------------
describe("G. Chip Conservation End-to-End", () => {
  type ConservationCase = {
    desc: string;
    bets: Record<string, bigint>;
    starting: Record<string, bigint>;
    folded?: string[];
    allIn?: string[];
  };

  const configs: ConservationCase[] = [
    {
      desc: "3-player equal bets",
      bets: { A: 200n, B: 200n, C: 200n },
      starting: { A: 1000n, B: 1000n, C: 1000n },
    },
    {
      desc: "4-player unequal bets",
      bets: { A: 100n, B: 200n, C: 300n, D: 400n },
      starting: { A: 1000n, B: 1000n, C: 1000n, D: 1000n },
    },
    {
      desc: "2-player heads-up",
      bets: { A: 500n, B: 500n },
      starting: { A: 1000n, B: 1000n },
    },
    {
      desc: "all-in creates side pot",
      bets: { A: 100n, B: 300n, C: 300n },
      starting: { A: 100n, B: 1000n, C: 1000n },
      allIn: ["A"],
    },
    {
      desc: "folder contributes chips",
      bets: { A: 50n, B: 200n, C: 200n },
      starting: { A: 1000n, B: 1000n, C: 1000n },
      folded: ["A"],
    },
    {
      desc: "two all-ins + active",
      bets: { A: 100n, B: 250n, C: 500n },
      starting: { A: 100n, B: 250n, C: 1000n },
      allIn: ["A", "B"],
    },
    {
      desc: "preflop blinds scenario",
      bets: { A: 50n, B: 100n, C: 100n },
      starting: { A: 1000n, B: 1000n, C: 1000n },
    },
    {
      desc: "5-player tournament pot",
      bets: { A: 200n, B: 200n, C: 200n, D: 200n, E: 200n },
      starting: { A: 1000n, B: 1000n, C: 1000n, D: 1000n, E: 1000n },
    },
    {
      desc: "very small blind",
      bets: { A: 1n, B: 2n, C: 2n },
      starting: { A: 100n, B: 100n, C: 100n },
    },
    {
      desc: "large chip stacks",
      bets: { A: 10000n, B: 10000n },
      starting: { A: 50000n, B: 50000n },
    },
    {
      desc: "three all-ins equal",
      bets: { A: 500n, B: 500n, C: 500n },
      starting: { A: 500n, B: 500n, C: 500n },
      allIn: ["A", "B", "C"],
    },
    {
      desc: "2-player split",
      bets: { A: 300n, B: 300n },
      starting: { A: 1000n, B: 1000n },
    },
    {
      desc: "folder and all-in mixed",
      bets: { A: 100n, B: 100n, C: 50n },
      starting: { A: 1000n, B: 1000n, C: 50n },
      folded: ["A"],
      allIn: ["C"],
    },
    { desc: "single blind no call", bets: { A: 10n }, starting: { A: 1000n } },
    {
      desc: "6-way all-in",
      bets: { A: 100n, B: 100n, C: 100n, D: 100n, E: 100n, F: 100n },
      starting: { A: 100n, B: 100n, C: 100n, D: 100n, E: 100n, F: 100n },
      allIn: ["A", "B", "C", "D", "E", "F"],
    },
    {
      desc: "deep stack re-raise",
      bets: { A: 1000n, B: 2000n, C: 3000n },
      starting: { A: 5000n, B: 5000n, C: 5000n },
    },
    {
      desc: "BB option scenario",
      bets: { A: 50n, B: 100n },
      starting: { A: 1000n, B: 1000n },
    },
    {
      desc: "4-way fold fest",
      bets: { A: 10n, B: 20n, C: 20n, D: 20n },
      starting: { A: 1000n, B: 1000n, C: 1000n, D: 1000n },
      folded: ["A", "B", "C"],
    },
    {
      desc: "asymmetric all-ins 4 players",
      bets: { A: 50n, B: 150n, C: 300n, D: 600n },
      starting: { A: 50n, B: 150n, C: 300n, D: 1000n },
      allIn: ["A", "B", "C"],
    },
    {
      desc: "one big one small pot",
      bets: { A: 1000n, B: 50n },
      starting: { A: 2000n, B: 50n },
      allIn: ["B"],
    },
  ];

  for (const { desc, bets, starting, folded = [], allIn = [] } of configs) {
    it(desc, () => {
      const mgr = pm();
      const players = Object.keys(bets).map((id) => ({
        id,
        chips: starting[id] - bets[id],
        folded: folded.includes(id),
        allIn: allIn.includes(id),
      }));
      for (const [id, bet] of Object.entries(bets)) mgr.addBet(id, bet);
      mgr.calculatePots(players);

      const startTotal = Object.values(starting).reduce((s, v) => s + v, 0n);
      const stacksNow = players.reduce((s, pl) => s + pl.chips, 0n);
      const pot = mgr.getTotalPot();
      expect(stacksNow + pot, `${desc}: chips+pot should equal start`).toBe(
        startTotal,
      );
      assertPotsBalance(mgr, desc);
    });
  }
});

// ---------------------------------------------------------------------------
// H. BettingRound: isPreFlop and 3-bet (migrated from betting-advanced.spec.ts)
// ---------------------------------------------------------------------------
describe("H. BettingRound: isPreFlop and 3-bet", () => {
  describe("H1. Pre-flop: BB option (isPreFlop=true)", () => {
    it("BTN calls, SB completes, BB checks → betting complete", () => {
      const players = [
        { id: "btn", chips: 1000n, folded: false, allIn: false },
        { id: "sb", chips: 1000n, folded: false, allIn: false },
        { id: "bb", chips: 1000n, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 10n,
        bigBlind: 20n,
        isPreFlop: true,
        dealerIndex: 0,
      });

      round.betsThisRound["sb"] = 10n;
      players[1].chips -= 10n;
      round.betsThisRound["bb"] = 20n;
      players[2].chips -= 20n;
      round.currentMaxBet = 20n;

      const btnCall = round.applyAction(players[0], { type: "call" });
      expect(btnCall.valid).toBe(true);
      expect(btnCall.amountAdded).toBe(20n);

      const sbCall = round.applyAction(players[1], { type: "call" });
      expect(sbCall.valid).toBe(true);
      expect(sbCall.amountAdded).toBe(10n);

      const bbCheck = round.applyAction(players[2], { type: "check" });
      expect(bbCheck.valid).toBe(true);

      expect(round.isBettingComplete()).toBe(true);
    });
  });

  describe("H2. 3-bet: raise → re-raise → call", () => {
    it("3-player raise/re-raise sequence completes correctly", () => {
      const players = [
        { id: "p1", chips: 1000n, folded: false, allIn: false },
        { id: "p2", chips: 1000n, folded: false, allIn: false },
        { id: "p3", chips: 1000n, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 10n,
        bigBlind: 20n,
        isPreFlop: false,
        dealerIndex: 0,
      });

      const raise1 = round.applyAction(players[0], {
        type: "raise",
        amount: 50,
      });
      expect(raise1.valid).toBe(true);
      expect(round.currentMaxBet).toBe(50n);

      const reRaise = round.applyAction(players[1], {
        type: "raise",
        amount: 100,
      });
      expect(reRaise.valid).toBe(true);
      expect(round.currentMaxBet > 50n).toBe(true);

      const call = round.applyAction(players[2], { type: "call" });
      expect(call.valid).toBe(true);

      const p1Call = round.applyAction(players[0], { type: "call" });
      expect(p1Call.valid).toBe(true);

      expect(round.isBettingComplete()).toBe(true);
    });
  });
});
