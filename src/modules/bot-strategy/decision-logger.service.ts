import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { StrategyDecision } from "../../entities/strategy-decision.entity";
import { buildGameContext, type BotPayload } from "./strategy-engine.service";
import type {
  BotStrategy,
  StrategyEvaluation,
} from "../../domain/bot-strategy/strategy.types";

export interface StrategyDecisionEvent {
  botId: string;
  gameId: string;
  handNumber: number;
  street: string;
  payload: BotPayload;
  strategy: BotStrategy;
  evaluation: StrategyEvaluation;
}

@Injectable()
export class DecisionLoggerService implements OnModuleInit {
  private readonly logger = new Logger(DecisionLoggerService.name);
  private buffer: Partial<StrategyDecision>[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly FLUSH_INTERVAL_MS = 3000;
  private static readonly MAX_BUFFER_SIZE = 50;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(StrategyDecision)
    private readonly decisionRepo: Repository<StrategyDecision>,
  ) {}

  onModuleInit() {
    this.eventEmitter.on("strategy.decision", this.onDecision.bind(this));

    this.flushTimer = setInterval(
      () => this.flush(),
      DecisionLoggerService.FLUSH_INTERVAL_MS,
    );

    this.logger.log("Decision logger initialized");
  }

  private onDecision(event: StrategyDecisionEvent): void {
    try {
      const context = buildGameContext(event.payload);

      this.buffer.push({
        id: uuidv4(),
        bot_id: event.botId,
        game_id: event.gameId,
        hand_number: event.handNumber,
        street: event.street,
        bot_payload: event.payload as any,
        game_context: context as any,
        strategy_snapshot: event.strategy as any,
        action_type: event.evaluation.action.type,
        action_amount: event.evaluation.action.amount ?? null,
        decision_source: event.evaluation.source,
        explanation: event.evaluation.explanation,
        rule_id: event.evaluation.ruleId ?? null,
        hand_notation: event.evaluation.handNotation ?? null,
        analysis_status: "pending",
        analysis_result: null,
        analyzed_at: null,
      });

      if (this.buffer.length >= DecisionLoggerService.MAX_BUFFER_SIZE) {
        this.flush();
      }
    } catch (error: any) {
      this.logger.warn(`Failed to buffer decision: ${error.message}`);
    }
  }

  async forceFlush(): Promise<void> {
    return this.flush();
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);

    try {
      await this.decisionRepo
        .createQueryBuilder()
        .insert()
        .into(StrategyDecision)
        .values(batch)
        .execute();

      this.logger.debug(`Flushed ${batch.length} strategy decisions`);
    } catch (error: any) {
      this.logger.error(
        `Failed to flush ${batch.length} decisions: ${error.message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}
