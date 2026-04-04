import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
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
import { ScenarioDto } from "./dto/scenario.dto";
import { PaginatedResponse } from "../../common/dto";
import { toPaginatedResponse } from "../../common/utils";
import {
  evaluateHydrated,
  getOrHydrateStrategy,
  type BotPayload,
} from "../bot-strategy/strategy-engine.service";

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
    const userBots = await this.botRepository.findActiveByUserId(userId);
    if (userBots.length >= MAX_BOTS_PER_ACCOUNT) {
      throw new BadRequestException(
        `Maximum ${MAX_BOTS_PER_ACCOUNT} bots per account. Please deactivate or delete an existing bot.`,
      );
    }

    const existing = await this.botRepository.findActiveByUserAndName(
      userId,
      dto.name,
    );
    if (existing) {
      throw new ConflictException(`Bot name '${dto.name}' already exists`);
    }

    const bot = await this.botRepository.create({
      name: dto.name,
      description: dto.description,
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
      relations: ["stats"],
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

  async duplicate(id: string, userId: string): Promise<BotResponseDto> {
    const original = await this.botRepository.findById(id);
    if (!original) {
      throw new NotFoundException(`Bot ${id} not found`);
    }
    if (original.user_id !== userId) {
      throw new ForbiddenException("You can only duplicate your own bots");
    }

    const userBots = await this.botRepository.findActiveByUserId(userId);
    if (userBots.length >= MAX_BOTS_PER_ACCOUNT) {
      throw new BadRequestException(
        `Maximum ${MAX_BOTS_PER_ACCOUNT} bots per account. Please deactivate or delete an existing bot.`,
      );
    }

    const baseName = `${original.name} (Copy)`;
    const nameExists = await this.botRepository.findByName(baseName);
    const finalName = nameExists
      ? `${original.name} (Copy ${Date.now()})`
      : baseName;

    return this.create(userId, {
      name: finalName,
      description: original.description ?? undefined,
      strategy: original.strategy as any,
    });
  }

  async getProfile(id: string) {
    const profile = await this.analyticsRepository.getBotProfile(id);
    if (!profile) {
      throw new NotFoundException(`Bot ${id} not found`);
    }
    return profile;
  }

  async evaluateScenario(botId: string, userId: string, dto: ScenarioDto) {
    const bot = await this.botRepository.findById(botId);
    if (!bot) throw new NotFoundException(`Bot ${botId} not found`);
    if (bot.user_id !== userId)
      throw new ForbiddenException("You can only test your own bots");

    const hydrated = getOrHydrateStrategy(bot.strategy as any);

    const cardCount = dto.communityCards.length;
    const stage =
      cardCount === 0
        ? "preflop"
        : cardCount === 3
          ? "flop"
          : cardCount === 4
            ? "turn"
            : "river";

    const mockPlayers: BotPayload["players"] = [
      {
        name: "Villain1",
        chips: 1000,
        bet: dto.toCall,
        folded: false,
        allIn: false,
        position: "UTG",
      },
      {
        name: "Villain2",
        chips: 1000,
        bet: 0,
        folded: true,
        allIn: false,
        position: "CO",
      },
      {
        name: "Villain3",
        chips: 1000,
        bet: 0,
        folded: true,
        allIn: false,
        position: "HJ",
      },
    ];

    const basePayload: Omit<BotPayload, "decisionSeed"> = {
      gameId: "scenario-lab",
      handNumber: 1,
      stage,
      you: {
        name: "Hero",
        chips: 1000,
        holeCards: dto.holeCards,
        bet: 0,
        position: dto.position,
      },
      action: {
        canCheck: dto.toCall === 0,
        toCall: dto.toCall,
        minRaise: dto.minRaise,
        maxRaise: 1000,
      },
      table: {
        pot: dto.pot,
        currentBet: dto.toCall,
        communityCards: dto.communityCards,
        smallBlind: 5,
        bigBlind: 10,
        ante: 0,
      },
      players: mockPlayers,
    };

    const RUNS = 20;
    const counts = { fold: 0, check: 0, call: 0, raise: 0 };
    let primaryResult: ReturnType<typeof evaluateHydrated> | null = null;

    for (let i = 0; i < RUNS; i++) {
      const seed = Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .padStart(8, "0")
        .repeat(8);
      const payload: BotPayload = { ...basePayload, decisionSeed: seed };
      const result = evaluateHydrated(hydrated, payload);
      if (i === 0) primaryResult = result;
      const type = result.action.type;
      if (type === "fold") counts.fold++;
      else if (type === "check") counts.check++;
      else if (type === "raise" || type === "all_in") counts.raise++;
      else counts.call++;
    }

    const distribution = {
      fold: Math.round((counts.fold / RUNS) * 100),
      check: Math.round((counts.check / RUNS) * 100),
      call: Math.round((counts.call / RUNS) * 100),
      raise: Math.round((counts.raise / RUNS) * 100),
    };

    return {
      primaryAction: primaryResult!.action,
      source: primaryResult!.source,
      explanation: primaryResult!.explanation,
      handNotation: primaryResult!.handNotation,
      ruleId: primaryResult!.ruleId,
      distribution,
    };
  }

  private toResponseDto(bot: Bot): BotResponseDto {
    const statsRow = bot.stats?.[0];
    const totalTournaments = statsRow?.total_tournaments ?? 0;
    const tournamentWins = statsRow?.tournament_wins ?? 0;
    const winRate =
      totalTournaments > 0
        ? Math.round((tournamentWins / totalTournaments) * 100)
        : 0;
    return {
      id: bot.id,
      name: bot.name,
      description: bot.description ?? null,
      active: bot.active,
      user_id: bot.user_id,
      created_at: bot.created_at,
      strategy: bot.strategy,
      win_rate: winRate,
      tournaments_count: totalTournaments,
    };
  }
}
