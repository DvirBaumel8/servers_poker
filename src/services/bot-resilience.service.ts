import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { BotCallerService, BotCallResult } from "./bot-caller.service";

export interface BotAction {
  type: "fold" | "check" | "call" | "raise" | "bet" | "all_in";
  amount?: number;
}

export interface GameContext {
  gameId: string;
  handNumber: number;
  stage: string;
  pot: number;
  currentBet: number;
  toCall: number;
  canCheck: boolean;
  minRaise: number;
  maxRaise: number;
}

export interface BotCallOptions {
  botId: string;
  endpoint: string;
  payload: any;
  gameContext: GameContext;
  fallbackStrategy?: FallbackStrategy;
}

export type FallbackStrategy =
  | "conservative"
  | "aggressive"
  | "random"
  | "check_fold";

export interface ResilientBotCallResult extends BotCallResult {
  action: BotAction;
  usedFallback: boolean;
  fallbackReason?: string;
}

@Injectable()
export class BotResilienceService {
  private readonly logger = new Logger(BotResilienceService.name);
  private readonly defaultFallbackStrategy: FallbackStrategy;

  constructor(
    private readonly botCaller: BotCallerService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.defaultFallbackStrategy = this.configService.get<FallbackStrategy>(
      "BOT_FALLBACK_STRATEGY",
      "conservative",
    );
  }

  async callBotWithFallback(
    options: BotCallOptions,
  ): Promise<ResilientBotCallResult> {
    const { botId, endpoint, payload, gameContext, fallbackStrategy } = options;
    const strategy = fallbackStrategy ?? this.defaultFallbackStrategy;

    const result = await this.botCaller.callBot(botId, endpoint, payload);

    if (result.success && result.response) {
      const validatedAction = this.validateAndNormalizeAction(
        result.response,
        gameContext,
      );

      if (validatedAction) {
        return {
          ...result,
          action: validatedAction,
          usedFallback: false,
        };
      }

      this.logger.warn(
        `Bot ${botId} returned invalid action: ${JSON.stringify(result.response)}`,
      );

      const fallbackAction = this.generateFallbackAction(strategy, gameContext);

      this.eventEmitter.emit("bot.usedFallback", {
        botId,
        gameId: gameContext.gameId,
        reason: "invalid_response",
        originalResponse: result.response,
        fallbackAction,
      });

      return {
        ...result,
        action: fallbackAction,
        usedFallback: true,
        fallbackReason: "invalid_response",
      };
    }

    const fallbackAction = this.generateFallbackAction(strategy, gameContext);

    this.eventEmitter.emit("bot.usedFallback", {
      botId,
      gameId: gameContext.gameId,
      reason: result.error || "call_failed",
      fallbackAction,
    });

    return {
      ...result,
      action: fallbackAction,
      usedFallback: true,
      fallbackReason: result.error || "call_failed",
    };
  }

  generateFallbackAction(
    strategy: FallbackStrategy,
    context: GameContext,
  ): BotAction {
    switch (strategy) {
      case "conservative":
        return this.conservativeFallback(context);
      case "aggressive":
        return this.aggressiveFallback(context);
      case "random":
        return this.randomFallback(context);
      case "check_fold":
      default:
        return this.checkFoldFallback(context);
    }
  }

  private conservativeFallback(context: GameContext): BotAction {
    if (context.canCheck) {
      return { type: "check" };
    }

    if (context.toCall <= context.pot * 0.25) {
      return { type: "call" };
    }

    return { type: "fold" };
  }

  private aggressiveFallback(context: GameContext): BotAction {
    if (context.canCheck) {
      if (context.maxRaise > 0 && Math.random() > 0.5) {
        const raiseAmount = Math.min(context.minRaise, context.maxRaise);
        return { type: "raise", amount: raiseAmount };
      }
      return { type: "check" };
    }

    if (context.toCall <= context.pot * 0.5) {
      return { type: "call" };
    }

    return { type: "fold" };
  }

  private randomFallback(context: GameContext): BotAction {
    const actions: BotAction[] = [];

    if (context.canCheck) {
      actions.push({ type: "check" });
    } else {
      actions.push({ type: "fold" });
      actions.push({ type: "call" });
    }

    if (context.maxRaise > 0) {
      actions.push({ type: "raise", amount: context.minRaise });
    }

    const randomIndex = Math.floor(Math.random() * actions.length);
    return actions[randomIndex];
  }

  private checkFoldFallback(context: GameContext): BotAction {
    if (context.canCheck) {
      return { type: "check" };
    }
    return { type: "fold" };
  }

  private validateAndNormalizeAction(
    response: any,
    context: GameContext,
  ): BotAction | null {
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
          this.logger.debug("Bot tried to check when not allowed, folding");
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
  }
}
