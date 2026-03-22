import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { GameRepository } from "../../repositories/game.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { HandSeedRepository } from "../../repositories/hand-seed.repository";
import { RedisCacheService } from "../../common/redis/redis-cache.service";
import { Game } from "../../entities/game.entity";
import { Hand } from "../../entities/hand.entity";
import { HandSeed } from "../../entities/hand-seed.entity";
import { HandHistoryDto, LeaderboardEntryDto } from "./dto/game.dto";

export interface HandSeedDto {
  handNumber: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string | null;
  combinedHash: string | null;
  deckOrder: number[] | null;
  revealed: boolean;
  revealedAt: Date | null;
  createdAt: Date;
  verificationUrl?: string;
}

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  constructor(
    private readonly gameRepository: GameRepository,
    private readonly botRepository: BotRepository,
    private readonly handSeedRepository: HandSeedRepository,
    private readonly cacheService: RedisCacheService,
  ) {}

  async findById(id: string): Promise<Game | null> {
    return this.gameRepository.findById(id);
  }

  async findByTableId(tableId: string): Promise<Game[]> {
    return this.gameRepository.findByTableId(tableId);
  }

  async createGame(tableId: string, tournamentId?: string): Promise<Game> {
    const game = await this.gameRepository.createGame(tableId, tournamentId);
    this.logger.log(`Game ${game.id} created for table ${tableId}`);
    return game;
  }

  async getHandHistory(
    gameId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<HandHistoryDto[]> {
    const hands = await this.gameRepository.getHandHistory(
      gameId,
      limit,
      offset,
    );
    return hands.map((h) => this.toHandHistoryDto(h));
  }

  async getHand(handId: string): Promise<HandHistoryDto | null> {
    const hand = await this.gameRepository.getHandWithDetails(handId);
    if (!hand) return null;
    return this.toHandHistoryDto(hand);
  }

  async getTableHistory(
    tableId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{
    gameId: string;
    tableId: string;
    totalHands: number;
    hands: HandHistoryDto[];
  }> {
    const games = await this.gameRepository.findByTableId(tableId);
    if (!games.length) {
      throw new NotFoundException("No games found for this table");
    }

    const latestGame = games[0];
    const hands = await this.getHandHistory(latestGame.id, limit, offset);

    return {
      gameId: latestGame.id,
      tableId,
      totalHands: latestGame.total_hands,
      hands,
    };
  }

  async getLeaderboard(
    limit: number = 20,
    period: "all" | "month" | "week" = "all",
  ): Promise<LeaderboardEntryDto[]> {
    const cacheKey = `leaderboard:${period}:${limit}`;
    const results = await this.cacheService.getOrSet(
      cacheKey,
      () => this.gameRepository.getLeaderboard(limit, period),
      { ttlSeconds: 60 }, // Cache for 1 minute
    );
    // pg driver returns bigints as strings; convert to numbers
    return results.map((entry) => ({
      ...entry,
      games_played: Number(entry.games_played),
      total_hands: Number(entry.total_hands),
      total_wins: Number(entry.total_wins),
      total_winnings: Number(entry.total_winnings),
      net_profit: Number(entry.net_profit),
      win_rate_pct:
        entry.win_rate_pct !== null ? Number(entry.win_rate_pct) : null,
      tournament_wins: Number(entry.tournament_wins),
      total_tournaments: Number(entry.total_tournaments),
    }));
  }

  /**
   * Check if a user has access to a game's data.
   * Admins have full access; regular users can only access games where their bots participated.
   */
  async userHasAccessToGame(
    gameId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<boolean> {
    if (isAdmin) return true;

    const userBots = await this.botRepository.findByUserId(userId);
    if (userBots.length === 0) return false;

    const userBotIds = new Set(userBots.map((b) => b.id));

    const game = await this.gameRepository.findById(gameId);
    if (!game) return false;

    const gamePlayers = await this.gameRepository.getGamePlayers(gameId);
    return gamePlayers.some((p) => userBotIds.has(p.bot_id));
  }

  /**
   * Check if a user has access to a specific hand.
   */
  async userHasAccessToHand(
    handId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<boolean> {
    if (isAdmin) return true;

    const hand = await this.gameRepository.getHandWithDetails(handId);
    if (!hand) return false;

    const userBots = await this.botRepository.findByUserId(userId);
    if (userBots.length === 0) return false;

    const userBotIds = new Set(userBots.map((b) => b.id));
    return (hand.players || []).some((p) => userBotIds.has(p.bot_id));
  }

  async getGameSeeds(gameId: string): Promise<HandSeedDto[]> {
    const seeds = await this.handSeedRepository.findByGame(gameId);
    return seeds.map((seed) => this.toHandSeedDto(seed));
  }

  async getHandSeed(
    gameId: string,
    handNumber: number,
  ): Promise<HandSeedDto | null> {
    const seed = await this.handSeedRepository.findByGameAndHand(
      gameId,
      handNumber,
    );
    if (!seed) return null;
    return {
      ...this.toHandSeedDto(seed),
      verificationUrl: `/api/v1/games/verify-hand`,
    };
  }

  private toHandSeedDto(seed: HandSeed): HandSeedDto {
    return {
      handNumber: seed.hand_number,
      serverSeed: seed.server_seed,
      serverSeedHash: seed.server_seed_hash,
      clientSeed: seed.client_seed,
      combinedHash: seed.combined_hash,
      deckOrder: seed.deck_order,
      revealed: seed.revealed,
      revealedAt: seed.revealed_at,
      createdAt: seed.created_at,
    };
  }

  private toHandHistoryDto(hand: Hand): HandHistoryDto {
    return {
      id: hand.id,
      hand_number: hand.hand_number,
      pot: Number(hand.pot),
      community_cards: hand.community_cards,
      players: (hand.players || []).map((p) => ({
        bot_id: p.bot_id,
        bot_name: p.bot?.name || "Unknown",
        position: p.position,
        hole_cards: p.hole_cards,
        amount_bet: Number(p.amount_bet),
        amount_won: Number(p.amount_won || 0),
        folded: p.folded,
        won: p.won,
        best_hand: p.best_hand
          ? { name: p.best_hand.name, cards: p.best_hand.cards }
          : undefined,
      })),
      actions: (hand.actions || []).map((a) => ({
        bot_id: a.bot_id,
        action_type: a.action_type,
        amount: Number(a.amount),
        stage: a.stage,
      })),
      started_at: hand.started_at!,
      finished_at: hand.finished_at!,
    };
  }
}
