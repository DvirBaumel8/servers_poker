import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { BotRepository } from "../../repositories/bot.repository";
import { AnalyticsRepository } from "../../repositories/analytics.repository";
import { BotOwnershipService } from "./bot-ownership.service";
import { UserRepository } from "../../repositories/user.repository";
import { Bot } from "../../entities/bot.entity";
import {
  CreateInternalBotDto,
  UpdateBotDto,
  BotResponseDto,
} from "./dto/internal-bot.dto";
import { ScenarioDto } from "./dto/scenario.dto";
import * as crypto from "crypto";
import { PaginatedResponse } from "../../common/dto";
import { toPaginatedResponse } from "../../common/utils";
import {
  evaluateHydrated,
  hydrateStrategy,
  clearEvalCache,
  type BotPayload,
} from "../bot-strategy/strategy-engine.service";
import { bestHand as evaluateBestHand } from "../../domain/handEvaluator";
import { parseCardString } from "../bot-strategy/evaluators/hand-analyzer";
import { estimateEquityMonteCarlo } from "../bot-strategy/evaluators/equity.service";

const BOT_LIMIT_FREE = 1;
const BOT_LIMIT_PRO = 5;

function getBotLimit(subscriptionStatus: string): number {
  return subscriptionStatus === "active" ? BOT_LIMIT_PRO : BOT_LIMIT_FREE;
}

/** Returns the action bucket with the highest count. Tie-break: raise > call > check > fold. */
export function pickModalBucket(counts: {
  fold: number;
  check: number;
  call: number;
  raise: number;
}): "fold" | "check" | "call" | "raise" {
  const order = ["raise", "call", "check", "fold"] as const;
  // No initial value — starts from 'raise'. Strict > means earlier entries win ties.
  return order.reduce((best, b) => (counts[b] > counts[best] ? b : best));
}

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly botOwnership: BotOwnershipService,
    private readonly userRepository: UserRepository,
  ) {}

  async create(
    userId: string,
    dto: CreateInternalBotDto,
  ): Promise<BotResponseDto> {
    const user = await this.userRepository.findById(userId);
    const limit = getBotLimit(user?.subscription_status ?? "free");
    const userBots = await this.botRepository.findActiveByUserId(userId);
    if (userBots.length >= limit) {
      throw new BadRequestException(
        `Your plan allows a maximum of ${limit} bot${limit === 1 ? "" : "s"}. Upgrade to Pro for up to ${BOT_LIMIT_PRO} bots.`,
      );
    }

    const existing = await this.botRepository.findActiveByUserAndName(
      userId,
      dto.name,
    );
    if (existing) {
      throw new ConflictException(`Bot name '${dto.name}' already exists`);
    }

    let bot: Bot;
    try {
      bot = await this.botRepository.create({
        name: dto.name,
        description: dto.description,
        user_id: userId,
        strategy: dto.strategy,
      });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as any).constraint === "IDX_bots_active_user_name"
      ) {
        throw new ConflictException(`Bot name '${dto.name}' already exists`);
      }
      throw err;
    }

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

    const user = await this.userRepository.findById(userId);
    const limit = getBotLimit(user?.subscription_status ?? "free");
    const userBots = await this.botRepository.findActiveByUserId(userId);
    if (userBots.length >= limit) {
      throw new BadRequestException(
        `Your plan allows a maximum of ${limit} bot${limit === 1 ? "" : "s"}. Upgrade to Pro for up to ${BOT_LIMIT_PRO} bots.`,
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

    // Always bypass the hydration cache for the Scenario Lab — we need the
    // exact strategy the user just saved, not a previously compiled version.
    const hydrated = hydrateStrategy(bot.strategy as any);

    // Issue #4: validate community card count is a valid poker street
    const validCardCounts = [0, 3, 4, 5];
    if (!validCardCounts.includes(dto.communityCards.length)) {
      throw new BadRequestException(
        `Community cards must be 0 (preflop), 3 (flop), 4 (turn), or 5 (river). Got ${dto.communityCards.length}.`,
      );
    }

    const cardCount = dto.communityCards.length;
    const stage =
      cardCount === 0
        ? "preflop"
        : cardCount === 3
          ? "flop"
          : cardCount === 4
            ? "turn"
            : "river";

    // Issue #6: build mock players based on numberOfPlayers.
    // The hero is included in payload.players (consistent with the live game) so that
    // the engine's active-player count is accurate for guards like the board-plays check.
    const botStack = dto.botStack ?? 1000;
    const bb = dto.bigBlind ?? 10;
    const oppStack = dto.avgOpponentStack ?? botStack;
    const playerCount = dto.numberOfPlayers ?? 6;
    const VILLAIN_POSITIONS = ["UTG", "UTG+1", "HJ", "CO", "BTN", "SB", "BB"];
    const mockPlayers: BotPayload["players"] = [
      // Hero entry first — keeps the count including the decision-maker
      {
        name: "Hero",
        chips: botStack,
        bet: 0,
        folded: false,
        allIn: false,
        position: dto.position,
      },
      // Opponents
      // When there is a facing bet (toCall > 0) only the first opponent (the bettor)
      // is still active in the hand. All others have already folded. This ensures the
      // Monte Carlo equity simulation uses the correct number of live opponents rather
      // than counting all mock table-seats as active, which would dilute equity and
      // inflate the potOdds-vs-equity ratio, triggering false negative-EV fold boosts.
      ...Array.from({ length: playerCount - 1 }, (_, i) => ({
        name: `Villain${i + 1}`,
        chips: oppStack,
        bet: i === 0 ? dto.toCall : 0,
        folded: dto.toCall > 0 && i !== 0, // fold inactive seats when facing a bet
        allIn: i === 0 && dto.toCall > 0 && dto.toCall >= oppStack,
        position: VILLAIN_POSITIONS[i % VILLAIN_POSITIONS.length],
      })),
    ];

    // Pre-compute the best hand so the strategy engine gets correct hand strength.
    // Without this, hand-analyzer defaults to "high_card" for post-flop hands,
    // causing personality bots to use a "weak" base distribution (55% fold) even
    // for straights, flushes, full houses, etc.
    let bestHandName: string | undefined;
    if (dto.communityCards.length > 0) {
      bestHandName = evaluateBestHand(
        dto.holeCards.map(parseCardString),
        dto.communityCards.map(parseCardString),
      ).name;
    }

    const basePayload: Omit<BotPayload, "decisionSeed"> = {
      gameId: "scenario-lab",
      handNumber: 1,
      stage,
      you: {
        name: "Hero",
        chips: botStack,
        holeCards: dto.holeCards,
        bet: 0,
        position: dto.position,
        ...(bestHandName ? { bestHand: { name: bestHandName } } : {}),
      },
      action: {
        canCheck: dto.toCall === 0,
        toCall: dto.toCall,
        minRaise: dto.minRaise,
        maxRaise: botStack,
      },
      table: {
        // In the live game, `potManager.getTotalPot()` already includes the opposing
        // bet by the time the hero's payload is built. Add `toCall` here so that
        // potOdds = toCall / (pot + toCall) is computed correctly in buildGameContext.
        // Without this, a 400-chip all-in into a 50-chip pot would show potOdds=88.9%
        // instead of the correct 47.1%, triggering a spurious negative-EV fold boost.
        pot: dto.pot + dto.toCall,
        currentBet: dto.toCall,
        communityCards: dto.communityCards,
        smallBlind: Math.round(bb / 2),
        bigBlind: bb,
        ante: 0,
      },
      players: mockPlayers,
    };

    const RUNS = 20;
    const counts = { fold: 0, check: 0, call: 0, raise: 0 };
    type ActionBucket = "fold" | "check" | "call" | "raise";
    const firstResultByType: Partial<
      Record<ActionBucket, ReturnType<typeof evaluateHydrated>>
    > = {};

    // Derive a base hash from the scenario inputs, then produce a deterministic
    // seed for every run (run_i = sha256(baseHash:i)). This makes the entire
    // distribution stable across repeated calls with the same scenario setup.
    const baseHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          h: dto.holeCards,
          c: dto.communityCards,
          pos: dto.position,
          pot: dto.pot,
          tc: dto.toCall,
          mr: dto.minRaise,
        }),
      )
      .digest("hex");

    // Clear the eval cache so no stale result from a previous analysis (with a
    // different strategy version) can pollute this call.
    clearEvalCache();

    // Sanity guards — enforce legal poker actions:
    //   1. fold → check   when toCall=0 (folding for free is illegal)
    //   2. check → call   when toCall>0 (checking when facing a bet is illegal)
    const canCheck = dto.toCall === 0;

    for (let i = 0; i < RUNS; i++) {
      const seed = crypto
        .createHash("sha256")
        .update(`${baseHash}:${i}`)
        .digest("hex");
      const payload: BotPayload = { ...basePayload, decisionSeed: seed };
      const result = evaluateHydrated(hydrated, payload, { labMode: true });
      let type = result.action.type;
      // Guard 1: fold-for-free is illegal
      if (type === "fold" && canCheck) {
        type = "check";
      }
      // Guard 2: checking when facing a bet is illegal
      if (type === "check" && !canCheck) {
        type = "call";
      }
      if (type === "fold") {
        counts.fold++;
        if (!firstResultByType.fold) firstResultByType.fold = result;
      } else if (type === "check") {
        counts.check++;
        if (!firstResultByType.check) firstResultByType.check = result;
      } else if (type === "raise" || type === "all_in") {
        counts.raise++;
        if (!firstResultByType.raise) firstResultByType.raise = result;
      } else {
        counts.call++;
        if (!firstResultByType.call) firstResultByType.call = result;
      }
    }

    // Pick the modal action (highest count). Tie-break order: raise > call > check > fold.
    const modalBucket = pickModalBucket(counts);

    const distribution = {
      fold: Math.round((counts.fold / RUNS) * 100),
      check: Math.round((counts.check / RUNS) * 100),
      call: Math.round((counts.call / RUNS) * 100),
      raise: Math.round((counts.raise / RUNS) * 100),
    };

    const primaryResult = firstResultByType[modalBucket]!;

    // Compute real Monte Carlo equity for the Scenario Lab display.
    // Uses a fixed seed (42) for deterministic results on the same scenario.
    // Count only non-folded opponents — mirrors the strategy engine's active-player
    // logic so the displayed win chance matches the equity the bot actually used to
    // make its decision. When facing a bet, all seats except the bettor are folded.
    const activeOpponentCount = mockPlayers
      .slice(1)
      .filter((p) => !p.folded).length;
    const mcEquityRaw = estimateEquityMonteCarlo(
      dto.holeCards,
      dto.communityCards,
      activeOpponentCount,
      undefined, // use tunables default (5000)
      42, // deterministic seed
    );
    // Return as 0–100 with one decimal precision, e.g. 0.912 → 91.2
    const equity = Math.round(mcEquityRaw * 1000) / 10;

    return {
      primaryAction: primaryResult.action,
      source: primaryResult.source,
      explanation: primaryResult.explanation,
      handNotation: primaryResult.handNotation,
      ruleId: primaryResult.ruleId,
      distribution,
      equity,
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
