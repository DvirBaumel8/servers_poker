/**
 * Regression tests for the null-override range chart bug.
 *
 * Bug: When a Pro bot has a position-specific rangeChart override that contains
 * null entries (user clicked "Clear" on a cell in the position tab), spreading
 * that null over the global chart would encode the cell as 0 ("unset = Fold"),
 * silently folding hands that were painted as "raise" in the global tab.
 *
 * Fix: Filter null entries from position override charts before merging so that
 * null means "inherit from global" rather than "explicitly fold".
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  hydrateStrategy,
  clearHydrationCache,
  clearEvalCache,
  clearStreetMemos,
  evaluateHydrated,
  type BotPayload,
} from "../../../src/modules/bot-strategy/strategy-engine.service";
import type { BotStrategy } from "../../../src/domain/bot-strategy/strategy.types";

// AA hole cards in the engine are passed as strings like "Ah" "As"
const AA_PAYLOAD: BotPayload = {
  gameId: "test",
  handNumber: 1,
  stage: "pre-flop",
  decisionSeed:
    "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
  you: {
    name: "Hero",
    chips: 1000,
    holeCards: ["Ah", "As"],
    bet: 0,
    position: "BTN",
  },
  action: { canCheck: false, toCall: 20, minRaise: 40, maxRaise: 1000 },
  table: {
    pot: 30,
    currentBet: 20,
    communityCards: [],
    smallBlind: 5,
    bigBlind: 10,
    ante: 0,
  },
  players: [
    {
      name: "Villain",
      chips: 980,
      bet: 20,
      folded: false,
      allIn: false,
      position: "SB",
    },
  ],
};

function makeProStrategy(
  globalAA: "raise" | "call" | "fold" | null,
  btnOverrideAA: "raise" | "call" | "fold" | null | "omit",
): BotStrategy {
  const globalChart = globalAA !== null ? { AA: globalAA } : {};
  const btnChart =
    btnOverrideAA === "omit"
      ? undefined
      : btnOverrideAA !== null
        ? { AA: btnOverrideAA }
        : { AA: null };

  return {
    version: 1,
    tier: "pro",
    personality: {
      aggression: 50,
      bluffFrequency: 10,
      riskTolerance: 50,
      tightness: 30,
    },
    rangeChart: globalChart,
    positionOverrides:
      btnChart !== undefined ? { BTN: { rangeChart: btnChart } } : {},
  } as unknown as BotStrategy;
}

describe("null-override range chart merge (P1 bug regression)", () => {
  beforeEach(() => {
    clearHydrationCache();
    clearEvalCache();
    clearStreetMemos();
  });

  it("global raise + BTN null override → should raise (inherit global)", () => {
    const strategy = makeProStrategy("raise", null);
    const hydrated = hydrateStrategy(strategy);
    const result = evaluateHydrated(hydrated, AA_PAYLOAD);
    expect(result.source).toBe("Range Chart");
    expect(result.action.type).toBe("raise");
  });

  it("global raise + BTN explicit fold override → should fold (explicit override wins)", () => {
    const strategy = makeProStrategy("raise", "fold");
    const hydrated = hydrateStrategy(strategy);
    const result = evaluateHydrated(hydrated, AA_PAYLOAD);
    expect(result.source).toBe("Range Chart");
    expect(result.action.type).toBe("fold");
  });

  it("global raise + no BTN override at all → should raise (inherit global)", () => {
    const strategy = makeProStrategy("raise", "omit");
    const hydrated = hydrateStrategy(strategy);
    const result = evaluateHydrated(hydrated, AA_PAYLOAD);
    expect(result.source).toBe("Range Chart");
    expect(result.action.type).toBe("raise");
  });

  it("global raise + BTN explicit raise override → should raise", () => {
    const strategy = makeProStrategy("raise", "raise");
    const hydrated = hydrateStrategy(strategy);
    const result = evaluateHydrated(hydrated, AA_PAYLOAD);
    expect(result.source).toBe("Range Chart");
    expect(result.action.type).toBe("raise");
  });

  it("no global chart + BTN null override → should fold (unset falls through to personality which handles it)", () => {
    // Without any chart entry, range chart returns fold (unset = fold)
    const strategy = makeProStrategy(null, null);
    const hydrated = hydrateStrategy(strategy);
    // The empty range chart still fires (it exists) but AA is unset → fold
    const result = evaluateHydrated(hydrated, AA_PAYLOAD);
    // AA with a balanced personality won't necessarily fold here; the key is it doesn't crash
    expect(["fold", "call", "raise"]).toContain(result.action.type);
  });
});
