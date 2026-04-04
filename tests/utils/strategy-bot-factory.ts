import type { BotStrategy } from "../../src/domain/bot-strategy/strategy.types";

export function createCallerStrategy(): BotStrategy {
  return {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 10,
      bluffFrequency: 5,
      riskTolerance: 20,
      tightness: 20,
    },
  };
}

export function createFolderStrategy(): BotStrategy {
  return {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 5,
      bluffFrequency: 0,
      riskTolerance: 5,
      tightness: 95,
    },
  };
}

export function createAggressiveStrategy(): BotStrategy {
  return {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 90,
      bluffFrequency: 60,
      riskTolerance: 80,
      tightness: 30,
    },
  };
}

export function createSmartStrategy(): BotStrategy {
  return {
    version: 1,
    tier: "strategy",
    personality: {
      aggression: 55,
      bluffFrequency: 25,
      riskTolerance: 45,
      tightness: 55,
    },
    rules: {
      preflop: [
        {
          id: "r1",
          priority: 1,
          conditions: [{ field: "facingBet", operator: "eq", value: false }],
          action: { type: "call" },
        },
      ],
      flop: [],
      turn: [],
      river: [],
    },
  };
}

export function createDefaultStrategy(): BotStrategy {
  return {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 50,
      bluffFrequency: 30,
      riskTolerance: 50,
      tightness: 50,
    },
  };
}
