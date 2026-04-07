import { describe, it, expect } from "vitest";
import { pickModalBucket } from "../../../src/modules/bots/bots.service";

describe("pickModalBucket", () => {
  it("returns the action with the highest count", () => {
    expect(pickModalBucket({ fold: 0, check: 2, call: 10, raise: 8 })).toBe(
      "call",
    );
  });

  it("returns raise when raise has the highest count", () => {
    expect(pickModalBucket({ fold: 0, check: 2, call: 8, raise: 10 })).toBe(
      "raise",
    );
  });

  it("prefers raise over call on a tie (tie-break order)", () => {
    expect(pickModalBucket({ fold: 0, check: 0, call: 10, raise: 10 })).toBe(
      "raise",
    );
  });

  it("returns fold when fold has the majority", () => {
    expect(pickModalBucket({ fold: 15, check: 1, call: 3, raise: 1 })).toBe(
      "fold",
    );
  });

  it("returns raise as the highest-priority fallback when all counts are zero", () => {
    expect(pickModalBucket({ fold: 0, check: 0, call: 0, raise: 0 })).toBe(
      "raise",
    );
  });

  it("prefers call over check on a tie", () => {
    expect(pickModalBucket({ fold: 0, check: 10, call: 10, raise: 0 })).toBe(
      "call",
    );
  });

  it("prefers check over fold on a tie", () => {
    expect(pickModalBucket({ fold: 5, check: 5, call: 0, raise: 0 })).toBe(
      "check",
    );
  });
});
