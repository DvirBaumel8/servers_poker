import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { User } from "../../entities/user.entity";
import { BotSubscriptionRepository } from "../../repositories/bot-subscription.repository";
import { TournamentRepository } from "../../repositories/tournament.repository";
import { BotOwnershipService } from "./bot-ownership.service";
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  SubscriptionResponseDto,
  SubscriptionStatsDto,
} from "./dto/subscription.dto";
import { BotSubscription } from "../../entities/bot-subscription.entity";
import { assertFound } from "../../common/utils";

@Controller("bots/:botId/subscriptions")
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(
    private readonly subscriptionRepository: BotSubscriptionRepository,
    private readonly tournamentRepository: TournamentRepository,
    private readonly botOwnership: BotOwnershipService,
  ) {}

  @Get()
  async findAll(
    @Param("botId", ParseUUIDPipe) botId: string,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto[]> {
    await this.botOwnership.getBotWithOwnershipCheck(
      botId,
      user.id,
      user.role === "admin",
    );

    const subscriptions = await this.subscriptionRepository.findByBotId(botId);
    return subscriptions.map((s) => this.toResponseDto(s));
  }

  @Get("stats")
  async getStats(
    @Param("botId", ParseUUIDPipe) botId: string,
    @CurrentUser() user: User,
  ): Promise<SubscriptionStatsDto> {
    await this.botOwnership.getBotWithOwnershipCheck(
      botId,
      user.id,
      user.role === "admin",
    );

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
    @Param("botId", ParseUUIDPipe) botId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto> {
    await this.botOwnership.getBotWithOwnershipCheck(
      botId,
      user.id,
      user.role === "admin",
    );

    const subscription = await this.getSubscriptionOrThrow(id, botId);
    return this.toResponseDto(subscription);
  }

  @Post()
  async create(
    @Param("botId", ParseUUIDPipe) botId: string,
    @Body() dto: CreateSubscriptionDto,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto> {
    await this.botOwnership.getBotWithOwnershipCheck(
      botId,
      user.id,
      user.role === "admin",
    );

    if (dto.tournament_id) {
      await this.tournamentRepository.findByIdOrThrow(dto.tournament_id);

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
    @Param("botId", ParseUUIDPipe) botId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto> {
    await this.botOwnership.getBotWithOwnershipCheck(
      botId,
      user.id,
      user.role === "admin",
    );

    const subscription = await this.getSubscriptionOrThrow(id, botId);

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
    @Param("botId", ParseUUIDPipe) botId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean }> {
    await this.botOwnership.getBotWithOwnershipCheck(
      botId,
      user.id,
      user.role === "admin",
    );

    await this.getSubscriptionOrThrow(id, botId);
    await this.subscriptionRepository.delete(id);
    return { success: true };
  }

  @Post(":id/pause")
  async pause(
    @Param("botId", ParseUUIDPipe) botId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto> {
    await this.botOwnership.getBotWithOwnershipCheck(
      botId,
      user.id,
      user.role === "admin",
    );

    await this.getSubscriptionOrThrow(id, botId);
    await this.subscriptionRepository.updateStatus(id, "paused");
    const updated = await this.subscriptionRepository.findById(id);
    return this.toResponseDto(updated!);
  }

  @Post(":id/resume")
  async resume(
    @Param("botId", ParseUUIDPipe) botId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<SubscriptionResponseDto> {
    await this.botOwnership.getBotWithOwnershipCheck(
      botId,
      user.id,
      user.role === "admin",
    );

    await this.getSubscriptionOrThrow(id, botId);
    await this.subscriptionRepository.updateStatus(id, "active");
    const updated = await this.subscriptionRepository.findById(id);
    return this.toResponseDto(updated!);
  }

  /**
   * Get subscription by ID and verify it belongs to the specified bot.
   */
  private async getSubscriptionOrThrow(
    id: string,
    botId: string,
  ): Promise<BotSubscription> {
    const subscription = await this.subscriptionRepository.findById(id);
    assertFound(
      subscription && subscription.bot_id === botId,
      "Subscription",
      id,
    );
    return subscription!;
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
