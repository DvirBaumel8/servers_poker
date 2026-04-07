import { describe, it, expect } from "vitest";
import { normalizeRaiseAction } from "../../../src/services/game/live-game-manager.service";

describe("normalizeRaiseAction", () => {
  it("converts all_in to raise with full remaining stack above call", () => {
    const result = normalizeRaiseAction(
      { type: "all_in" },
      /*lastRaiseDelta*/ 100,
      /*playerChips*/ 600,
      /*toCall*/ 100,
    );
    expect(result).toEqual({ type: "raise", amount: 500 }); // 600 - 100
  });

  it("converts all_in when toCall = 0 to raise with full chips", () => {
    const result = normalizeRaiseAction(
      { type: "all_in" },
      /*lastRaiseDelta*/ 50,
      /*playerChips*/ 300,
      /*toCall*/ 0,
    );
    expect(result).toEqual({ type: "raise", amount: 300 });
  });

  it("snaps sub-minimum raise to lastRaiseDelta when player can afford it", () => {
    const result = normalizeRaiseAction(
      { type: "raise", amount: 30 },
      /*lastRaiseDelta*/ 100,
      /*playerChips*/ 500,
      /*toCall*/ 50,
    );
    // 500 >= 50 + 100 → snap to 100
    expect(result).toEqual({ type: "raise", amount: 100 });
  });

  it("converts sub-minimum raise to all-in when player cannot afford minimum", () => {
    const result = normalizeRaiseAction(
      { type: "raise", amount: 30 },
      /*lastRaiseDelta*/ 100,
      /*playerChips*/ 120,
      /*toCall*/ 50,
    );
    // 120 < 50 + 100 → can't afford minimum → all-in: 120 - 50 = 70
    expect(result).toEqual({ type: "raise", amount: 70 });
  });

  it("leaves a legal raise unchanged", () => {
    const action = { type: "raise", amount: 200 };
    const result = normalizeRaiseAction(
      action,
      /*lastRaiseDelta*/ 100,
      /*playerChips*/ 1000,
      /*toCall*/ 50,
    );
    expect(result).toBe(action); // same reference — no copy
  });

  it("leaves a call action unchanged", () => {
    const action = { type: "call" };
    const result = normalizeRaiseAction(
      action,
      /*lastRaiseDelta*/ 100,
      /*playerChips*/ 500,
      /*toCall*/ 100,
    );
    expect(result).toBe(action);
  });

  it("leaves a fold action unchanged", () => {
    const action = { type: "fold" };
    const result = normalizeRaiseAction(
      action,
      /*lastRaiseDelta*/ 100,
      /*playerChips*/ 500,
      /*toCall*/ 0,
    );
    expect(result).toBe(action);
  });

  it("snaps sub-minimum bet (not raise) to lastRaiseDelta", () => {
    const result = normalizeRaiseAction(
      { type: "bet", amount: 10 },
      /*lastRaiseDelta*/ 50,
      /*playerChips*/ 300,
      /*toCall*/ 0,
    );
    expect(result).toEqual({ type: "raise", amount: 50 });
  });
});
