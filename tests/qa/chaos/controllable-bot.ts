/**
 * Controllable Bot Strategy
 *
 * Generates strategy JSON configurations for chaos testing purposes.
 * Replaces the former HTTP-based controllable bot server.
 */

export type StrategyChaosMode =
  | "normal"
  | "corrupt_json"
  | "extreme_aggressive"
  | "extreme_passive"
  | "invalid_values"
  | "missing_fields";

export interface StrategyChaosConfig {
  mode: StrategyChaosMode;
  personality?: "aggressive" | "conservative" | "random";
}

export interface ControllableBotConfig {
  name: string;
  initialMode?: StrategyChaosMode;
  personality?: "aggressive" | "conservative" | "random";
}

export interface BotStats {
  strategiesGenerated: number;
  corruptStrategies: number;
  extremeStrategies: number;
}

export class ControllableBot {
  private config: ControllableBotConfig;
  private chaosConfig: StrategyChaosConfig;
  private stats: BotStats;

  constructor(config: ControllableBotConfig) {
    this.config = config;
    this.chaosConfig = {
      mode: config.initialMode ?? "normal",
      personality: config.personality,
    };
    this.stats = {
      strategiesGenerated: 0,
      corruptStrategies: 0,
      extremeStrategies: 0,
    };
  }

  setMode(mode: StrategyChaosMode): void {
    this.chaosConfig.mode = mode;
  }

  getMode(): StrategyChaosMode {
    return this.chaosConfig.mode;
  }

  getStats(): BotStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      strategiesGenerated: 0,
      corruptStrategies: 0,
      extremeStrategies: 0,
    };
  }

  getName(): string {
    return this.config.name;
  }

  generateStrategy(): Record<string, unknown> {
    this.stats.strategiesGenerated++;

    switch (this.chaosConfig.mode) {
      case "corrupt_json":
        this.stats.corruptStrategies++;
        return {
          version: "invalid",
          tier: 123,
          personality: "not_an_object",
        } as any;

      case "extreme_aggressive":
        this.stats.extremeStrategies++;
        return {
          version: 1,
          tier: "quick",
          personality: {
            aggression: 100,
            bluffFrequency: 100,
            riskTolerance: 100,
            tightness: 0,
          },
        };

      case "extreme_passive":
        this.stats.extremeStrategies++;
        return {
          version: 1,
          tier: "quick",
          personality: {
            aggression: 0,
            bluffFrequency: 0,
            riskTolerance: 0,
            tightness: 100,
          },
        };

      case "invalid_values":
        this.stats.corruptStrategies++;
        return {
          version: 1,
          tier: "quick",
          personality: {
            aggression: -50,
            bluffFrequency: 999,
            riskTolerance: NaN,
            tightness: undefined,
          },
        };

      case "missing_fields":
        this.stats.corruptStrategies++;
        return { version: 1 };

      case "normal":
      default: {
        const personality = this.config.personality ?? "random";
        const presets: Record<string, Record<string, unknown>> = {
          aggressive: {
            version: 1,
            tier: "quick",
            personality: {
              aggression: 80,
              bluffFrequency: 50,
              riskTolerance: 70,
              tightness: 25,
            },
          },
          conservative: {
            version: 1,
            tier: "quick",
            personality: {
              aggression: 15,
              bluffFrequency: 5,
              riskTolerance: 10,
              tightness: 85,
            },
          },
          random: {
            version: 1,
            tier: "quick",
            personality: {
              aggression: 50,
              bluffFrequency: 50,
              riskTolerance: 50,
              tightness: 50,
            },
          },
        };
        return presets[personality];
      }
    }
  }
}

export function createBotFleet(
  count: number,
  options?: {
    initialMode?: StrategyChaosMode;
  },
): ControllableBot[] {
  const bots: ControllableBot[] = [];
  const personalities: Array<"aggressive" | "conservative" | "random"> = [
    "aggressive",
    "conservative",
    "random",
  ];

  for (let i = 0; i < count; i++) {
    const bot = new ControllableBot({
      name: `chaos-bot-${i + 1}`,
      personality: personalities[i % personalities.length],
      initialMode: options?.initialMode,
    });
    bots.push(bot);
  }

  return bots;
}
