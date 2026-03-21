import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { User } from "../../entities/user.entity";
import { BotSubscriptionRepository } from "../../repositories/bot-subscription.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { TournamentRepository } from "../../repositories/tournament.repository";
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  SubscriptionResponseDto,
  SubscriptionStatsDto,
} from "./dto/subscription.dto";
import { BotSubscription } from "../../entities/bot-subscription.entity";

@Controller("bots/:botId/subscriptions")
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(
    private readonly subscriptionRepository: BotSubscriptionRepository,
    private readonly botRepository: BotRepository,
    private readonly tournamentRepository: TournamentRepository,
  ) {}

  @Get()
  async findAll(
    @Param("botId") botId: string,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto[]> {
    await this.verifyBotOwnership(botId, user);

    const subscriptions = await this.subscriptionRepository.findByBotId(botId);
    return subscriptions.map((s) => this.toResponseDto(s));
  }

  @Get("stats")
  async getStats(
    @Param("botId") botId: string,
    @CurrentUser() user: User,
  ): Promise<SubscriptionStatsDto> {
    await this.verifyBotOwnership(botId, user);

    const subscriptions = await this.subscriptionRepository.findByBotId(botId);
    const now = new Date();

    return {
      total: subscriptions.length,
      active: subscriptions.filter((s) => s.status === "active").length,
      paused: subscriptions.filter((s) => s.status === "paused").length,
      expired: subscriptions.filter(
        (s) => s.expires_at && new Date(s.expires_at) < now,
      ).length,
      total_successful_registrations: subscriptions.reduce(
        (sum, s) => sum + s.successful_registrations,
        0,
      ),
      total_failed_registrations: subscriptions.reduce(
        (sum, s) => sum + s.failed_registrations,
        0,
      ),
    };
  }

  @Get(":id")
  async findOne(
    @Param("botId") botId: string,
    @Param("id") id: string,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto> {
    await this.verifyBotOwnership(botId, user);

    const subscription = await this.subscriptionRepository.findById(id);
    if (!subscription || subscription.bot_id !== botId) {
      throw new NotFoundException(`Subscription ${id} not found`);
    }

    return this.toResponseDto(subscription);
  }

  @Post()
  async create(
    @Param("botId") botId: string,
    @Body() dto: CreateSubscriptionDto,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto> {
    await this.verifyBotOwnership(botId, user);

    if (dto.tournament_id) {
      const tournament = await this.tournamentRepository.findById(
        dto.tournament_id,
      );
      if (!tournament) {
        throw new NotFoundException(
          `Tournament ${dto.tournament_id} not found`,
        );
      }

      const existing = await this.subscriptionRepository.findByBotAndTournament(
        botId,
        dto.tournament_id,
      );
      if (existing) {
        throw new BadRequestException(
          "Subscription already exists for this bot and tournament",
        );
      }
    }

    const subscription = await this.subscriptionRepository.create({
      bot_id: botId,
      tournament_id: dto.tournament_id || null,
      tournament_type_filter: dto.tournament_type_filter || null,
      min_buy_in: dto.min_buy_in ?? null,
      max_buy_in: dto.max_buy_in ?? null,
      priority: dto.priority ?? 50,
      status: "active",
      expires_at: dto.expires_at ? new Date(dto.expires_at) : null,
    });

    return this.toResponseDto(subscription);
  }

  @Put(":id")
  async update(
    @Param("botId") botId: string,
    @Param("id") id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto> {
    await this.verifyBotOwnership(botId, user);

    const subscription = await this.subscriptionRepository.findById(id);
    if (!subscription || subscription.bot_id !== botId) {
      throw new NotFoundException(`Subscription ${id} not found`);
    }

    const updated = await this.subscriptionRepository.update(id, {
      tournament_type_filter:
        dto.tournament_type_filter !== undefined
          ? dto.tournament_type_filter
          : subscription.tournament_type_filter,
      min_buy_in:
        dto.min_buy_in !== undefined ? dto.min_buy_in : subscription.min_buy_in,
      max_buy_in:
        dto.max_buy_in !== undefined ? dto.max_buy_in : subscription.max_buy_in,
      priority: dto.priority ?? subscription.priority,
      status: dto.status ?? subscription.status,
      expires_at: dto.expires_at
        ? new Date(dto.expires_at)
        : dto.expires_at === null
          ? null
          : subscription.expires_at,
    });

    return this.toResponseDto(updated!);
  }

  @Delete(":id")
  async delete(
    @Param("botId") botId: string,
    @Param("id") id: string,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean }> {
    await this.verifyBotOwnership(botId, user);

    const subscription = await this.subscriptionRepository.findById(id);
    if (!subscription || subscription.bot_id !== botId) {
      throw new NotFoundException(`Subscription ${id} not found`);
    }

    await this.subscriptionRepository.delete(id);
    return { success: true };
  }

  @Post(":id/pause")
  async pause(
    @Param("botId") botId: string,
    @Param("id") id: string,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto> {
    await this.verifyBotOwnership(botId, user);

    const subscription = await this.subscriptionRepository.findById(id);
    if (!subscription || subscription.bot_id !== botId) {
      throw new NotFoundException(`Subscription ${id} not found`);
    }

    await this.subscriptionRepository.updateStatus(id, "paused");
    const updated = await this.subscriptionRepository.findById(id);
    return this.toResponseDto(updated!);
  }

  @Post(":id/resume")
  async resume(
    @Param("botId") botId: string,
    @Param("id") id: string,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto> {
    await this.verifyBotOwnership(botId, user);

    const subscription = await this.subscriptionRepository.findById(id);
    if (!subscription || subscription.bot_id !== botId) {
      throw new NotFoundException(`Subscription ${id} not found`);
    }

    await this.subscriptionRepository.updateStatus(id, "active");
    const updated = await this.subscriptionRepository.findById(id);
    return this.toResponseDto(updated!);
  }

  private async verifyBotOwnership(botId: string, user: User): Promise<void> {
    const bot = await this.botRepository.findById(botId);
    if (!bot) {
      throw new NotFoundException(`Bot ${botId} not found`);
    }
    if (bot.user_id !== user.id && user.role !== "admin") {
      throw new ForbiddenException("You do not own this bot");
    }
  }

  private toResponseDto(
    subscription: BotSubscription,
  ): SubscriptionResponseDto {
    return {
      id: subscription.id,
      bot_id: subscription.bot_id,
      bot_name: subscription.bot?.name,
      tournament_id: subscription.tournament_id,
      tournament_name: subscription.tournament?.name || null,
      tournament_type_filter: subscription.tournament_type_filter,
      min_buy_in: subscription.min_buy_in
        ? Number(subscription.min_buy_in)
        : null,
      max_buy_in: subscription.max_buy_in
        ? Number(subscription.max_buy_in)
        : null,
      priority: subscription.priority,
      status: subscription.status,
      successful_registrations: subscription.successful_registrations,
      failed_registrations: subscription.failed_registrations,
      last_registration_attempt: subscription.last_registration_attempt
        ? subscription.last_registration_attempt.toISOString()
        : null,
      expires_at: subscription.expires_at
        ? subscription.expires_at.toISOString()
        : null,
      created_at: subscription.created_at.toISOString(),
    };
  }
}
