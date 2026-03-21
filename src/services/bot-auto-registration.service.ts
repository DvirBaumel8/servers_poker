import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BotSubscription } from "../entities/bot-subscription.entity";
import { Tournament } from "../entities/tournament.entity";
import { TournamentEntry } from "../entities/tournament-entry.entity";
import { Bot } from "../entities/bot.entity";
import { BotSubscriptionRepository } from "../repositories/bot-subscription.repository";

interface RegistrationResult {
  subscriptionId: string;
  botId: string;
  tournamentId: string;
  success: boolean;
  reason?: string;
}

@Injectable()
export class BotAutoRegistrationService implements OnModuleInit {
  private readonly logger = new Logger(BotAutoRegistrationService.name);
  private isProcessing = false;

  constructor(
    private readonly subscriptionRepository: BotSubscriptionRepository,
    @InjectRepository(Tournament)
    private readonly tournamentRepository: Repository<Tournament>,
    @InjectRepository(TournamentEntry)
    private readonly entryRepository: Repository<TournamentEntry>,
    @InjectRepository(Bot)
    private readonly botRepository: Repository<Bot>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.eventEmitter.on(
      "tournament.created",
      (event: { tournamentId: string; type: string; buyIn: number }) => {
        this.handleNewTournament(
          event.tournamentId,
          event.type,
          event.buyIn,
        ).catch((e) =>
          this.logger.error(`Auto-registration error: ${e.message}`),
        );
      },
    );

    this.eventEmitter.on(
      "tournament.statusChanged",
      (event: { tournamentId: string; status: string }) => {
        if (event.status === "registering") {
          this.processRegistrationsForTournament(event.tournamentId).catch(
            (e) => this.logger.error(`Auto-registration error: ${e.message}`),
          );
        }
      },
    );

    this.logger.log("Bot auto-registration service initialized");
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledRegistrations(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      await this.cleanupExpiredSubscriptions();
      await this.processAllActiveSubscriptions();
    } catch (error: any) {
      this.logger.error(`Scheduled registration error: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleNewTournament(
    tournamentId: string,
    type: string,
    buyIn: number,
  ): Promise<void> {
    this.logger.log(
      `Processing auto-registrations for new tournament ${tournamentId}`,
    );

    const matchingSubscriptions =
      await this.subscriptionRepository.findMatchingSubscriptions(type, buyIn);

    for (const subscription of matchingSubscriptions) {
      await this.tryRegisterBot(subscription, tournamentId);
    }

    const specificSubscriptions =
      await this.subscriptionRepository.findByTournamentId(tournamentId);

    for (const subscription of specificSubscriptions) {
      await this.tryRegisterBot(subscription, tournamentId);
    }
  }

  private async processRegistrationsForTournament(
    tournamentId: string,
  ): Promise<void> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
    });

    if (!tournament || tournament.status !== "registering") {
      return;
    }

    await this.handleNewTournament(
      tournamentId,
      tournament.type,
      Number(tournament.buy_in),
    );
  }

  private async processAllActiveSubscriptions(): Promise<void> {
    const openTournaments = await this.tournamentRepository.find({
      where: { status: "registering" },
    });

    if (openTournaments.length === 0) {
      return;
    }

    const activeSubscriptions =
      await this.subscriptionRepository.findAllActive();

    for (const tournament of openTournaments) {
      for (const subscription of activeSubscriptions) {
        if (this.matchesSubscription(subscription, tournament)) {
          await this.tryRegisterBot(subscription, tournament.id);
        }
      }
    }
  }

  private matchesSubscription(
    subscription: BotSubscription,
    tournament: Tournament,
  ): boolean {
    if (
      subscription.tournament_id &&
      subscription.tournament_id !== tournament.id
    ) {
      return false;
    }

    if (
      subscription.tournament_type_filter &&
      subscription.tournament_type_filter !== tournament.type
    ) {
      return false;
    }

    const buyIn = Number(tournament.buy_in);
    if (subscription.min_buy_in !== null && buyIn < subscription.min_buy_in) {
      return false;
    }
    if (subscription.max_buy_in !== null && buyIn > subscription.max_buy_in) {
      return false;
    }

    return true;
  }

  private async tryRegisterBot(
    subscription: BotSubscription,
    tournamentId: string,
  ): Promise<RegistrationResult> {
    const result: RegistrationResult = {
      subscriptionId: subscription.id,
      botId: subscription.bot_id,
      tournamentId,
      success: false,
    };

    try {
      const bot = await this.botRepository.findOne({
        where: { id: subscription.bot_id },
      });

      if (!bot) {
        result.reason = "Bot not found";
        await this.subscriptionRepository.incrementFailed(subscription.id);
        return result;
      }

      if (!bot.active) {
        result.reason = "Bot is inactive";
        return result;
      }

      const existingEntry = await this.entryRepository.findOne({
        where: { tournament_id: tournamentId, bot_id: subscription.bot_id },
      });

      if (existingEntry) {
        result.reason = "Bot already registered";
        result.success = true;
        return result;
      }

      const tournament = await this.tournamentRepository.findOne({
        where: { id: tournamentId },
      });

      if (!tournament) {
        result.reason = "Tournament not found";
        await this.subscriptionRepository.incrementFailed(subscription.id);
        return result;
      }

      if (tournament.status !== "registering") {
        result.reason = "Tournament not accepting registrations";
        return result;
      }

      const entriesCount = await this.entryRepository.count({
        where: { tournament_id: tournamentId },
      });

      if (entriesCount >= tournament.max_players) {
        result.reason = "Tournament is full";
        await this.subscriptionRepository.incrementFailed(subscription.id);
        return result;
      }

      const userBotEntries = await this.entryRepository
        .createQueryBuilder("entry")
        .innerJoin("bots", "bot", "bot.id = entry.bot_id")
        .where("entry.tournament_id = :tournamentId", { tournamentId })
        .andWhere("bot.user_id = :userId", { userId: bot.user_id })
        .getCount();

      if (userBotEntries > 0) {
        result.reason = "User already has a bot in this tournament";
        return result;
      }

      const entry = this.entryRepository.create({
        tournament_id: tournamentId,
        bot_id: subscription.bot_id,
        entry_type: "initial",
      });

      await this.entryRepository.save(entry);

      await this.subscriptionRepository.incrementSuccessful(subscription.id);

      this.logger.log(
        `Auto-registered bot ${bot.name} to tournament ${tournament.name}`,
      );

      this.eventEmitter.emit("bot.autoRegistered", {
        botId: subscription.bot_id,
        botName: bot.name,
        tournamentId,
        tournamentName: tournament.name,
        subscriptionId: subscription.id,
      });

      result.success = true;
      return result;
    } catch (error: any) {
      result.reason = error.message;
      await this.subscriptionRepository.incrementFailed(subscription.id);
      this.logger.error(
        `Auto-registration failed for bot ${subscription.bot_id}: ${error.message}`,
      );
      return result;
    }
  }

  private async cleanupExpiredSubscriptions(): Promise<void> {
    const deleted = await this.subscriptionRepository.deleteExpired();
    if (deleted > 0) {
      this.logger.log(`Cleaned up ${deleted} expired subscriptions`);
    }
  }

  async manualTrigger(
    subscriptionId: string,
    tournamentId: string,
  ): Promise<RegistrationResult> {
    const subscription =
      await this.subscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      return {
        subscriptionId,
        botId: "",
        tournamentId,
        success: false,
        reason: "Subscription not found",
      };
    }

    return this.tryRegisterBot(subscription, tournamentId);
  }
}
