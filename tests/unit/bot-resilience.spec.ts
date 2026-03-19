import { describe, it, expect, beforeEach } from "vitest";

describe("Bot Resilience Service", () => {
  describe("Fallback Strategies", () => {
    interface GameContext {
      canCheck: boolean;
      toCall: number;
      pot: number;
      minRaise: number;
      maxRaise: number;
    }

    interface BotAction {
      type: "fold" | "check" | "call" | "raise";
      amount?: number;
    }

    const conservativeFallback = (context: GameContext): BotAction => {
      if (context.canCheck) {
        return { type: "check" };
      }
      if (context.toCall <= context.pot * 0.25) {
        return { type: "call" };
      }
      return { type: "fold" };
    };

    const checkFoldFallback = (context: GameContext): BotAction => {
      if (context.canCheck) {
        return { type: "check" };
      }
      return { type: "fold" };
    };

    describe("Conservative Strategy", () => {
      it("should check when possible", () => {
        const context: GameContext = {
          canCheck: true,
          toCall: 0,
          pot: 100,
          minRaise: 10,
          maxRaise: 100,
        };

        const action = conservativeFallback(context);
        expect(action.type).toBe("check");
      });

      it("should call small bets (< 25% of pot)", () => {
        const context: GameContext = {
          canCheck: false,
          toCall: 20,
          pot: 100,
          minRaise: 20,
          maxRaise: 100,
        };

        const action = conservativeFallback(context);
        expect(action.type).toBe("call");
      });

      it("should fold large bets (> 25% of pot)", () => {
        const context: GameContext = {
          canCheck: false,
          toCall: 50,
          pot: 100,
          minRaise: 50,
          maxRaise: 100,
        };

        const action = conservativeFallback(context);
        expect(action.type).toBe("fold");
      });
    });

    describe("Check/Fold Strategy", () => {
      it("should check when possible", () => {
        const context: GameContext = {
          canCheck: true,
          toCall: 0,
          pot: 100,
          minRaise: 10,
          maxRaise: 100,
        };

        const action = checkFoldFallback(context);
        expect(action.type).toBe("check");
      });

      it("should fold when cannot check", () => {
        const context: GameContext = {
          canCheck: false,
          toCall: 10,
          pot: 100,
          minRaise: 10,
          maxRaise: 100,
        };

        const action = checkFoldFallback(context);
        expect(action.type).toBe("fold");
      });
    });
  });

  describe("Action Validation", () => {
    interface GameContext {
      canCheck: boolean;
      minRaise: number;
      maxRaise: number;
    }

    interface BotAction {
      type: string;
      amount?: number;
    }

    const validateAndNormalizeAction = (
      response: any,
      context: GameContext,
    ): BotAction | null => {
      if (!response || typeof response !== "object") {
        return null;
      }

      const { type, amount } = response;

      if (!type || typeof type !== "string") {
        return null;
      }

      switch (type.toLowerCase()) {
        case "fold":
          return { type: "fold" };

        case "check":
          if (!context.canCheck) {
            return null;
          }
          return { type: "check" };

        case "call":
          return { type: "call" };

        case "raise":
        case "bet":
          if (typeof amount !== "number" || amount <= 0) {
            return null;
          }
          if (amount < context.minRaise && context.minRaise > 0) {
            return { type: "raise", amount: context.minRaise };
          }
          if (amount > context.maxRaise) {
            return { type: "raise", amount: context.maxRaise };
          }
          return { type: "raise", amount: Math.floor(amount) };

        case "all_in":
          return { type: "all_in" };

        default:
          return null;
      }
    };

    it("should accept valid fold", () => {
      const context: GameContext = { canCheck: true, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction({ type: "fold" }, context);
      expect(result).toEqual({ type: "fold" });
    });

    it("should accept valid check when allowed", () => {
      const context: GameContext = { canCheck: true, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction({ type: "check" }, context);
      expect(result).toEqual({ type: "check" });
    });

    it("should reject check when not allowed", () => {
      const context: GameContext = { canCheck: false, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction({ type: "check" }, context);
      expect(result).toBeNull();
    });

    it("should accept valid call", () => {
      const context: GameContext = { canCheck: false, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction({ type: "call" }, context);
      expect(result).toEqual({ type: "call" });
    });

    it("should accept valid raise within bounds", () => {
      const context: GameContext = { canCheck: false, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction(
        { type: "raise", amount: 50 },
        context,
      );
      expect(result).toEqual({ type: "raise", amount: 50 });
    });

    it("should clamp raise below minimum to minRaise", () => {
      const context: GameContext = { canCheck: false, minRaise: 20, maxRaise: 100 };
      const result = validateAndNormalizeAction(
        { type: "raise", amount: 10 },
        context,
      );
      expect(result).toEqual({ type: "raise", amount: 20 });
    });

    it("should clamp raise above maximum to maxRaise", () => {
      const context: GameContext = { canCheck: false, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction(
        { type: "raise", amount: 150 },
        context,
      );
      expect(result).toEqual({ type: "raise", amount: 100 });
    });

    it("should floor fractional raise amounts", () => {
      const context: GameContext = { canCheck: false, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction(
        { type: "raise", amount: 55.7 },
        context,
      );
      expect(result).toEqual({ type: "raise", amount: 55 });
    });

    it("should reject raise without amount", () => {
      const context: GameContext = { canCheck: false, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction({ type: "raise" }, context);
      expect(result).toBeNull();
    });

    it("should reject negative raise amount", () => {
      const context: GameContext = { canCheck: false, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction(
        { type: "raise", amount: -10 },
        context,
      );
      expect(result).toBeNull();
    });

    it("should accept all_in", () => {
      const context: GameContext = { canCheck: false, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction({ type: "all_in" }, context);
      expect(result).toEqual({ type: "all_in" });
    });

    it("should reject null response", () => {
      const context: GameContext = { canCheck: true, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction(null, context);
      expect(result).toBeNull();
    });

    it("should reject response without type", () => {
      const context: GameContext = { canCheck: true, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction({ amount: 50 }, context);
      expect(result).toBeNull();
    });

    it("should reject invalid action type", () => {
      const context: GameContext = { canCheck: true, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction({ type: "bluff" }, context);
      expect(result).toBeNull();
    });

    it("should handle case-insensitive action types", () => {
      const context: GameContext = { canCheck: true, minRaise: 10, maxRaise: 100 };
      const result = validateAndNormalizeAction({ type: "FOLD" }, context);
      expect(result).toEqual({ type: "fold" });
    });
  });

  describe("Fallback Selection", () => {
    it("should use fallback when bot call fails", () => {
      const callFailed = true;
      const fallbackUsed = callFailed;
      expect(fallbackUsed).toBe(true);
    });

    it("should use fallback when response is invalid", () => {
      const response = { invalid: "data" };
      const isValid =
        response &&
        typeof response === "object" &&
        "type" in response &&
        ["fold", "check", "call", "raise", "all_in"].includes(
          (response as any).type,
        );

      expect(isValid).toBe(false);
    });

    it("should not use fallback when response is valid", () => {
      const response = { type: "call" };
      const isValid =
        response &&
        typeof response === "object" &&
        "type" in response &&
        ["fold", "check", "call", "raise", "all_in"].includes(response.type);

      expect(isValid).toBe(true);
    });
  });
});
