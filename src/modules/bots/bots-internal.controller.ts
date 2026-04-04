import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { User } from "../../entities/user.entity";
import { BotsService } from "./bots.service";
import { PERSONALITY_PRESETS } from "../bot-strategy/presets/personality-presets";
import { CONDITION_FIELDS } from "../../domain/bot-strategy/strategy.types";
import type { BotStrategy } from "../../domain/bot-strategy/strategy.types";
import {
  CreateInternalBotDto,
  SimulateActionDto,
} from "./dto/internal-bot.dto";
import {
  evaluateStrategy,
  type BotPayload,
} from "../bot-strategy/strategy-engine.service";
import { detectConflicts } from "../../domain/bot-strategy/strategy-conflict.detector";

@Controller("bots/internal")
@UseGuards(JwtAuthGuard)
export class BotsInternalController {
  constructor(private readonly botsService: BotsService) {}

  @Public()
  @Get("presets")
  getPresets() {
    return { presets: PERSONALITY_PRESETS };
  }

  @Public()
  @Get("condition-fields")
  getConditionFields() {
    return { fields: CONDITION_FIELDS };
  }

  @Post()
  @Throttle({ default: { ttl: 3600000, limit: 10 } })
  async createInternalBot(
    @Body() dto: CreateInternalBotDto,
    @CurrentUser() user: User,
  ) {
    return this.botsService.create(user.id, dto);
  }

  @Post("check-conflicts")
  @HttpCode(HttpStatus.OK)
  checkConflicts(@Body() dto: { strategy: BotStrategy }) {
    const result = detectConflicts(dto.strategy);
    return result;
  }

  @Post("simulate")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  simulateAction(@Body() dto: SimulateActionDto) {
    const { strategy, scenario } = dto;

    const bb = scenario.bigBlind;
    const payload: BotPayload = {
      gameId: "sim-preview",
      handNumber: 1,
      stage: scenario.stage,
      you: {
        name: "SimBot",
        chips: scenario.stackSize,
        holeCards: scenario.holeCards,
        bet: 0,
        position: scenario.position,
      },
      action: {
        canCheck: !scenario.facingBet,
        toCall: scenario.facingBet ? scenario.betAmount : 0,
        minRaise: scenario.facingBet ? scenario.betAmount * 2 : bb * 2,
        maxRaise: scenario.stackSize,
      },
      table: {
        pot: scenario.potSize,
        currentBet: scenario.facingBet ? scenario.betAmount : 0,
        communityCards: scenario.communityCards ?? [],
        smallBlind: bb / 2,
        bigBlind: bb,
        ante: 0,
      },
      players: this.buildSimPlayers(scenario),
      decisionSeed: "0000000000000000",
    };

    const result = evaluateStrategy(strategy as BotStrategy, payload);
    return result;
  }

  private buildSimPlayers(scenario: SimulateActionDto["scenario"]) {
    const players = [
      {
        name: "SimBot",
        chips: scenario.stackSize,
        bet: 0,
        folded: false,
        allIn: false,
        position: scenario.position,
      },
    ];
    for (let i = 1; i < scenario.playersInHand; i++) {
      players.push({
        name: `Opponent${i}`,
        chips: scenario.stackSize,
        bet: i === 1 && scenario.facingBet ? scenario.betAmount : 0,
        folded: false,
        allIn: false,
        position: `P${i}`,
      });
    }
    return players;
  }
}
