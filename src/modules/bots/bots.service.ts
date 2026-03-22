import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { BotRepository } from "../../repositories/bot.repository";
import { AnalyticsRepository } from "../../repositories/analytics.repository";
import { BotOwnershipService } from "./bot-ownership.service";
import { Bot } from "../../entities/bot.entity";
import {
  CreateInternalBotDto,
  UpdateBotDto,
  BotResponseDto,
} from "./dto/internal-bot.dto";
import { PaginatedResponse } from "../../common/dto";
import { toPaginatedResponse } from "../../common/utils";

const MAX_BOTS_PER_ACCOUNT = 10;

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly botOwnership: BotOwnershipService,
  ) {}

  async create(
    userId: string,
    dto: CreateInternalBotDto,
  ): Promise<BotResponseDto> {
    const userBots = await this.botRepository.findByUserId(userId);
    if (userBots.length >= MAX_BOTS_PER_ACCOUNT) {
      throw new BadRequestException(
        `Maximum ${MAX_BOTS_PER_ACCOUNT} bots per account. Please deactivate or delete an existing bot.`,
      );
    }

    const existing = await this.botRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Bot name '${dto.name}' already exists`);
    }

    const bot = await this.botRepository.create({
      name: dto.name,
      description: dto.description || null,
      user_id: userId,
      strategy: dto.strategy,
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
      description: bot.description,
      active: bot.active,
      user_id: bot.user_id,
      created_at: bot.created_at,
      strategy: bot.strategy,
    };
  }
}
