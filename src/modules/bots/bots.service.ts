import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BotRepository } from "../../repositories/bot.repository";
import { AnalyticsRepository } from "../../repositories/analytics.repository";
import { BotOwnershipService } from "./bot-ownership.service";
import { Bot } from "../../entities/bot.entity";
import {
  CreateBotDto,
  UpdateBotDto,
  BotResponseDto,
  ValidateBotResponseDto,
} from "./dto/bot.dto";
import { UrlValidatorService } from "../../common/validators/url-validator.service";
import { PaginatedResponse } from "../../common/dto";
import { toPaginatedResponse } from "../../common/utils";

const MAX_BOTS_PER_ACCOUNT = 10;

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);
  private readonly botTimeoutMs: number;
  private readonly nodeEnv: string;

  constructor(
    private readonly botRepository: BotRepository,
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly botOwnership: BotOwnershipService,
    private readonly configService: ConfigService,
    private readonly urlValidator: UrlValidatorService,
  ) {
    this.botTimeoutMs = this.configService.get<number>("BOT_TIMEOUT_MS", 10000);
    this.nodeEnv = this.configService.get<string>("NODE_ENV", "development");
  }

  private isProduction(): boolean {
    return this.nodeEnv === "production";
  }

  async create(userId: string, dto: CreateBotDto): Promise<BotResponseDto> {
    // Check bot limit per account
    const userBots = await this.botRepository.findByUserId(userId);
    if (userBots.length >= MAX_BOTS_PER_ACCOUNT) {
      throw new BadRequestException(
        `Maximum ${MAX_BOTS_PER_ACCOUNT} bots per account. Please deactivate or delete an existing bot.`,
      );
    }

    // Check bot name uniqueness
    const existing = await this.botRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Bot name '${dto.name}' already exists`);
    }

    // Validate endpoint URL
    const urlValidation = this.urlValidator.validate(dto.endpoint);
    if (!urlValidation.valid) {
      throw new BadRequestException(
        `Invalid endpoint URL: ${urlValidation.error}`,
      );
    }

    // In dev/test mode, allow skipping health check with skip_validation flag
    const skipHealthCheck =
      dto.skip_validation === true && !this.isProduction();

    if (!skipHealthCheck) {
      // Perform health check to verify bot is reachable
      const healthCheck = await this.urlValidator.validateWithHealthCheck(
        dto.endpoint,
        5000,
      );
      if (!healthCheck.valid) {
        throw new BadRequestException(
          `Cannot connect to bot endpoint: ${healthCheck.error}. ` +
            `Make sure your bot is running and accessible at ${dto.endpoint}. ` +
            (this.isProduction()
              ? ""
              : 'In dev mode, you can add "skip_validation": true to bypass this check.'),
        );
      }
    } else {
      this.logger.warn(`Skipping health check for bot ${dto.name} (dev mode)`);
    }

    const bot = await this.botRepository.create({
      ...dto,
      user_id: userId,
    });

    this.logger.log(`Bot created: ${bot.name} by user ${userId}`);

    return this.toResponseDto(bot);
  }

  async findById(id: string): Promise<BotResponseDto | null> {
    const bot = await this.botRepository.findById(id);
    if (!bot) return null;
    return this.toResponseDto(bot);
  }

  async findByUserId(userId: string): Promise<BotResponseDto[]> {
    const bots = await this.botRepository.findByUserId(userId);
    return bots.map((b) => this.toResponseDto(b));
  }

  async findAll(): Promise<BotResponseDto[]> {
    const bots = await this.botRepository.findAll();
    return bots.map((b) => this.toResponseDto(b));
  }

  async findActive(): Promise<BotResponseDto[]> {
    const bots = await this.botRepository.findAll();
    return bots.filter((b) => b.active).map((b) => this.toResponseDto(b));
  }

  async findActivePaginated(
    limit: number,
    offset: number,
  ): Promise<PaginatedResponse<BotResponseDto>> {
    const [bots, total] = await this.botRepository.findAndCount({
      where: { active: true },
      take: limit,
      skip: offset,
      order: { created_at: "DESC" },
    });
    return toPaginatedResponse(bots, total, limit, offset, (b) =>
      this.toResponseDto(b),
    );
  }

  async findByUserIdPaginated(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<PaginatedResponse<BotResponseDto>> {
    const [bots, total] = await this.botRepository.findAndCount({
      where: { user_id: userId },
      take: limit,
      skip: offset,
      order: { created_at: "DESC" },
    });
    return toPaginatedResponse(bots, total, limit, offset, (b) =>
      this.toResponseDto(b),
    );
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateBotDto,
  ): Promise<BotResponseDto> {
    await this.botOwnership.getBotWithOwnershipCheck(id, userId, false);
    const updated = await this.botRepository.update(id, dto);
    return this.toResponseDto(updated!);
  }

  async deactivate(
    id: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<void> {
    await this.botOwnership.getBotWithOwnershipCheck(id, userId, isAdmin);
    await this.botRepository.deactivate(id);
  }

  async activate(id: string, userId: string, isAdmin: boolean): Promise<void> {
    await this.botOwnership.getBotWithOwnershipCheck(id, userId, isAdmin);
    await this.botRepository.activate(id);
  }

  async validate(id: string): Promise<ValidateBotResponseDto> {
    const bot = await this.botRepository.findByIdOrThrow(id);

    const result: ValidateBotResponseDto = {
      valid: false,
      score: 0,
      details: {
        reachable: false,
        respondedCorrectly: false,
        responseTimeMs: 0,
        errors: [],
      },
    };

    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.botTimeoutMs);

      const response = await fetch(bot.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "health_check",
          data: {},
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      result.details.responseTimeMs = Date.now() - start;
      result.details.reachable = true;

      if (response.ok) {
        const body = await response.json();
        if (body && typeof body === "object") {
          result.details.respondedCorrectly = true;
          result.valid = true;
          result.score = 100;
        }
      } else {
        result.details.errors.push(
          `HTTP ${response.status}: ${response.statusText}`,
        );
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        result.details.errors.push(`Timeout after ${this.botTimeoutMs}ms`);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        result.details.errors.push(message);
      }
    }

    await this.botRepository.update(id, {
      last_validation: result.details,
      last_validation_score: result.score,
    });

    return result;
  }

  async getProfile(id: string) {
    const profile = await this.analyticsRepository.getBotProfile(id);
    if (!profile) {
      throw new NotFoundException(`Bot ${id} not found`);
    }
    return profile;
  }

  private toResponseDto(bot: Bot): BotResponseDto {
    return {
      id: bot.id,
      name: bot.name,
      endpoint: bot.endpoint,
      description: bot.description,
      active: bot.active,
      user_id: bot.user_id,
      created_at: bot.created_at,
      last_validation: bot.last_validation,
      last_validation_score: bot.last_validation_score,
    };
  }
}
