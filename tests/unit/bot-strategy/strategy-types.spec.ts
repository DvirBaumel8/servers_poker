import { describe, it, expect } from "vitest";
import {
  generateAllHandNotations,
  RANKS,
  POSITIONS,
  STREETS,
  CONDITION_FIELDS,
  PERSONALITY_FIELDS,
} from "../../../src/domain/bot-strategy/strategy.types";

describe("Strategy Types", () => {
  describe("generateAllHandNotations", () => {
    it("should generate exactly 169 unique hand notations", () => {
      const hands = generateAllHandNotations();
      expect(hands).toHaveLength(169);
      expect(new Set(hands).size).toBe(169);
    });

    it("should include all 13 pocket pairs", () => {
      const hands = generateAllHandNotations();
      for (const rank of RANKS) {
        expect(hands).toContain(`${rank}${rank}`);
      }
    });

    it("should include common suited hands", () => {
      const hands = generateAllHandNotations();
      expect(hands).toContain("AKs");
      expect(hands).toContain("KQs");
      expect(hands).toContain("JTs");
      expect(hands).toContain("98s");
      expect(hands).toContain("32s");
    });

    it("should include common offsuit hands", () => {
      const hands = generateAllHandNotations();
      expect(hands).toContain("AKo");
      expect(hands).toContain("KQo");
      expect(hands).toContain("72o");
      expect(hands).toContain("32o");
    });

    it("should always put higher rank first for non-pairs", () => {
      const hands = generateAllHandNotations();
      for (const hand of hands) {
        if (hand.length === 3) {
          const r1 = RANKS.indexOf(hand[0] as any);
          const r2 = RANKS.indexOf(hand[1] as any);
          expect(r1).toBeLessThanOrEqual(r2);
        }
      }
    });

    it("should have 78 suited, 78 offsuit, and 13 pairs", () => {
      const hands = generateAllHandNotations();
      const suited = hands.filter((h) => h.endsWith("s"));
      const offsuit = hands.filter((h) => h.endsWith("o"));
      const pairs = hands.filter((h) => h.length === 2);
      expect(suited).toHaveLength(78);
      expect(offsuit).toHaveLength(78);
      expect(pairs).toHaveLength(13);
    });
  });

  describe("constants", () => {
    it("should have 13 ranks in descending order (A-2)", () => {
      expect(RANKS).toHaveLength(13);
      expect(RANKS[0]).toBe("A");
      expect(RANKS[12]).toBe("2");
    });

    it("should have 9 positions", () => {
      expect(POSITIONS).toHaveLength(9);
      expect(POSITIONS).toContain("BTN");
      expect(POSITIONS).toContain("SB");
      expect(POSITIONS).toContain("BB");
    });

    it("should have 4 streets", () => {
      expect(STREETS).toHaveLength(4);
      expect(STREETS).toEqual(["preflop", "flop", "turn", "river"]);
    });

    it("should have 4 personality fields", () => {
      expect(PERSONALITY_FIELDS).toHaveLength(4);
      expect(PERSONALITY_FIELDS).toContain("aggression");
      expect(PERSONALITY_FIELDS).toContain("bluffFrequency");
      expect(PERSONALITY_FIELDS).toContain("riskTolerance");
      expect(PERSONALITY_FIELDS).toContain("tightness");
    });
  });

  describe("CONDITION_FIELDS", () => {
    it("should have at least 15 condition fields", () => {
      expect(CONDITION_FIELDS.length).toBeGreaterThanOrEqual(15);
    });

    it("should have unique field names per category", () => {
      const keys = CONDITION_FIELDS.map((f) => `${f.category}.${f.field}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("should have valid tier values", () => {
      for (const field of CONDITION_FIELDS) {
        expect(["quick", "strategy", "pro"]).toContain(field.tier);
      }
    });

    it("should have enum fields with enumValues", () => {
      const enumFields = CONDITION_FIELDS.filter((f) => f.type === "enum");
      for (const field of enumFields) {
        expect(field.enumValues).toBeDefined();
        expect(field.enumValues!.length).toBeGreaterThan(0);
      }
    });

    it("should have street restrictions only on valid streets", () => {
      for (const field of CONDITION_FIELDS) {
        if (field.streets) {
          for (const street of field.streets) {
            expect(STREETS).toContain(street);
          }
        }
      }
    });
  });
});
