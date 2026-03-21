import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  BotCallerService,
  BotHealthStatus,
} from "../../services/bot/bot-caller.service";
import {
  BotHealthSchedulerService,
  HealthCheckRound,
} from "../../services/bot/bot-health-scheduler.service";
import {
  BotValidatorService,
  ValidationReport,
} from "../../services/bot/bot-validator.service";
import { BotsService } from "./bots.service";
import {
  HealthSummaryDto,
  BotConnectivityStatusDto,
  HealthCheckResultDto,
  BotLatencyDto,
} from "./dto/bot.dto";

@Controller("bots/connectivity")
@UseGuards(JwtAuthGuard, RolesGuard)
export class BotsConnectivityController {
  constructor(
    private readonly botsService: BotsService,
    private readonly botCaller: BotCallerService,
    private readonly healthScheduler: BotHealthSchedulerService,
    private readonly botValidator: BotValidatorService,
  ) {}

  @Get("health/summary")
  @Roles("admin")
  getHealthSummary(): HealthSummaryDto {
    const registered = this.healthScheduler.getRegisteredBots();
    const healthStatuses = this.botCaller.getAllHealthStatuses();
    const inActiveGames = this.healthScheduler.getBotsInActiveGames();
    const lastRound = this.healthScheduler.getLastHealthCheckRound();

    const healthyCount = healthStatuses.filter((h) => h.healthy).length;

    return {
      timestamp: new Date(),
      totalRegistered: registered.length,
      healthy: healthyCount,
      unhealthy: healthStatuses.length - healthyCount,
      inActiveGames: inActiveGames.length,
      lastCheckRound: lastRound,
    };
  }

  @Get("health/all")
  @Roles("admin")
  async getAllHealthStatuses(): Promise<BotConnectivityStatusDto[]> {
    const bots = await this.botsService.findAll();
    const registered = this.healthScheduler.getRegisteredBots();
    const registeredIds = new Set(registered.map((r) => r.id));
    const inGameIds = new Set(
      this.healthScheduler.getBotsInActiveGames().map((b) => b.id),
    );

    return bots.map((bot) => ({
      botId: bot.id,
      name: bot.name,
      endpoint: bot.endpoint,
      health: this.botCaller.getHealthStatus(bot.id) || null,
      registered: registeredIds.has(bot.id),
      inActiveGame: inGameIds.has(bot.id),
    }));
  }

  @Get("health/:botId")
  async getBotHealth(
    @Param("botId") botId: string,
  ): Promise<BotHealthStatus | { error: string }> {
    const status = this.botCaller.getHealthStatus(botId);
    if (!status) {
      return { error: "No health data available for this bot" };
    }
    return status;
  }

  @Post("health/:botId/check")
  @HttpCode(HttpStatus.OK)
  async triggerHealthCheck(
    @Param("botId") botId: string,
  ): Promise<HealthCheckResultDto | { error: string }> {
    const bot = await this.botsService.findById(botId);
    if (!bot) {
      return { error: "Bot not found" };
    }

    const startTime = Date.now();
    const healthy = await this.botCaller.healthCheck(botId, bot.endpoint);
    const latencyMs = Date.now() - startTime;

    return { healthy, latencyMs };
  }

  @Post("health/check-all")
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  async triggerHealthCheckAll(): Promise<HealthCheckRound> {
    return this.healthScheduler.runHealthCheckNow();
  }

  @Get("validate/:botId")
  async validateBot(
    @Param("botId") botId: string,
  ): Promise<ValidationReport | { error: string }> {
    const bot = await this.botsService.findById(botId);
    if (!bot) {
      return { error: "Bot not found" };
    }

    return this.botValidator.validateBot(botId, bot.endpoint);
  }

  @Get("validate/:botId/quick")
  async quickValidateBot(
    @Param("botId") botId: string,
  ): Promise<ValidationReport | { error: string }> {
    const bot = await this.botsService.findById(botId);
    if (!bot) {
      return { error: "Bot not found" };
    }

    return this.botValidator.validateBot(botId, bot.endpoint, {
      quickMode: true,
    });
  }

  @Post("circuit-breaker/:botId/reset")
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  resetCircuitBreaker(@Param("botId") botId: string): {
    success: boolean;
    botId: string;
  } {
    this.botCaller.resetCircuitBreaker(botId);
    return { success: true, botId };
  }

  @Get("latency/:botId")
  getLatency(@Param("botId") botId: string): BotLatencyDto {
    const latency = this.botCaller.getAverageLatency(botId);
    return { botId, averageLatencyMs: latency };
  }

  @Post("register/:botId")
  @HttpCode(HttpStatus.OK)
  async registerBotForMonitoring(
    @Param("botId") botId: string,
  ): Promise<{ success: boolean } | { error: string }> {
    const bot = await this.botsService.findById(botId);
    if (!bot) {
      return { error: "Bot not found" };
    }

    this.healthScheduler.registerBot(botId, bot.endpoint);
    return { success: true };
  }

  @Post("unregister/:botId")
  @HttpCode(HttpStatus.OK)
  unregisterBotFromMonitoring(@Param("botId") botId: string): {
    success: boolean;
  } {
    this.healthScheduler.unregisterBot(botId);
    return { success: true };
  }
}
