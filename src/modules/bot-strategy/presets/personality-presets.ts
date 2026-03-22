import type { PersonalityPreset } from "../../../domain/bot-strategy/strategy.types";

export const PERSONALITY_PRESETS: PersonalityPreset[] = [
  {
    id: "shark",
    name: "The Shark",
    description: "Tight-aggressive. Plays few hands but plays them hard.",
    personality: {
      aggression: 75,
      bluffFrequency: 35,
      riskTolerance: 65,
      tightness: 70,
    },
    styleDescription:
      "Selects strong starting hands and bets/raises aggressively. " +
      "The gold standard of winning poker — pressure with an edge.",
  },
  {
    id: "rock",
    name: "The Rock",
    description: "Ultra-tight, ultra-passive. Only plays the very best hands.",
    personality: {
      aggression: 25,
      bluffFrequency: 5,
      riskTolerance: 20,
      tightness: 90,
    },
    styleDescription:
      "Waits patiently for premium hands and plays them cautiously. " +
      "Very predictable but hard to lose chips against.",
  },
  {
    id: "maniac",
    name: "The Maniac",
    description: "Loose-aggressive. Bets on everything and bluffs constantly.",
    personality: {
      aggression: 95,
      bluffFrequency: 70,
      riskTolerance: 90,
      tightness: 15,
    },
    styleDescription:
      "Plays nearly every hand and bets relentlessly. " +
      "Chaotic and unpredictable — wins big or loses big.",
  },
  {
    id: "calling_station",
    name: "The Calling Station",
    description: "Passive caller. Rarely raises, rarely folds.",
    personality: {
      aggression: 15,
      bluffFrequency: 5,
      riskTolerance: 50,
      tightness: 30,
    },
    styleDescription:
      "Calls almost any bet but rarely raises. " +
      "Easy to play against for experienced players.",
  },
  {
    id: "nit",
    name: "The Nit",
    description: "Even tighter than The Rock. Folds almost everything.",
    personality: {
      aggression: 10,
      bluffFrequency: 0,
      riskTolerance: 10,
      tightness: 95,
    },
    styleDescription:
      "Only plays AA, KK, QQ, and AK. Folds to any significant pressure. " +
      "Extremely exploitable but minimizes losses.",
  },
  {
    id: "balanced_pro",
    name: "Balanced Pro",
    description: "Well-rounded, hard to exploit. A balanced mix of all styles.",
    personality: {
      aggression: 60,
      bluffFrequency: 30,
      riskTolerance: 55,
      tightness: 55,
    },
    styleDescription:
      "Mixes aggression with selective hand play and occasional bluffs. " +
      "Difficult to read and adjust to.",
  },
  {
    id: "tricky",
    name: "Tricky",
    description: "Unpredictable. Lots of bluffs, unusual lines.",
    personality: {
      aggression: 50,
      bluffFrequency: 55,
      riskTolerance: 45,
      tightness: 50,
    },
    styleDescription:
      "Bluffs frequently and takes unconventional lines. " +
      "Keeps opponents guessing but can bleed chips with bad timing.",
  },
  {
    id: "bully",
    name: "The Bully",
    description: "Pressures opponents with large bets and constant aggression.",
    personality: {
      aggression: 85,
      bluffFrequency: 45,
      riskTolerance: 75,
      tightness: 40,
    },
    styleDescription:
      "Applies maximum pressure with big bets and raises. " +
      "Exploits tight players but vulnerable to traps.",
  },
];

export function getPresetById(id: string): PersonalityPreset | undefined {
  return PERSONALITY_PRESETS.find((p) => p.id === id);
}
