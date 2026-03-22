import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager, DataSource } from "typeorm";
import { Game } from "../entities/game.entity";
import { GamePlayer } from "../entities/game-player.entity";
import { Hand } from "../entities/hand.entity";
import { HandPlayer } from "../entities/hand-player.entity";
import { Action, ActionType, ActionStage } from "../entities/action.entity";
import { BaseRepository } from "./base.repository";

export interface HandCompletionData {
  handId: string;
  pot: number;
  communityCards: Array<{ rank: string; suit: string }>;
  players: Array<{
    botId: string;
    endChips: number;
    amountWon: number;
    folded: boolean;
    allIn: boolean;
    won: boolean;
    sawShowdown: boolean;
    bestHand?: {
      name: string;
      rank: number;
      cards: Array<{ rank: string; suit: string }>;
    };
  }>;
}

@Injectable()
export class GameRepository extends BaseRepository<Game> {
  protected get entityName(): string {
    return "Game";
  }

  constructor(
    @InjectRepository(Game)
    protected readonly repository: Repository<Game>,
    @InjectRepository(GamePlayer)
    private readonly gamePlayerRepository: Repository<GamePlayer>,
    @InjectRepository(Hand)
    private readonly handRepository: Repository<Hand>,
    @InjectRepository(HandPlayer)
    private readonly handPlayerRepository: Repository<HandPlayer>,
    @InjectRepository(Action)
    private readonly actionRepository: Repository<Action>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  private getGamePlayerRepo(manager?: EntityManager): Repository<GamePlayer> {
    return manager
      ? manager.getRepository(GamePlayer)
      : this.gamePlayerRepository;
  }

  private getHandRepo(manager?: EntityManager): Repository<Hand> {
    return manager ? manager.getRepository(Hand) : this.handRepository;
  }

  private getHandPlayerRepo(manager?: EntityManager): Repository<HandPlayer> {
    return manager
      ? manager.getRepository(HandPlayer)
      : this.handPlayerRepository;
  }

  private getActionRepo(manager?: EntityManager): Repository<Action> {
    return manager ? manager.getRepository(Action) : this.actionRepository;
  }

  async findByTableId(
    tableId: string,
    manager?: EntityManager,
  ): Promise<Game[]> {
    return this.getRepo(manager).find({
      where: { table_id: tableId },
      order: { created_at: "DESC" },
    });
  }

  async createGame(
    tableId: string,
    tournamentId?: string,
    manager?: EntityManager,
  ): Promise<Game> {
    const repo = this.getRepo(manager);
    const game = repo.create({
      table_id: tableId,
      tournament_id: tournamentId || null,
      status: "waiting",
      started_at: new Date(),
    });
    return repo.save(game);
  }

  async finishGame(
    id: string,
    totalHands: number,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getRepo(manager).update(id, {
      status: "finished",
      total_hands: totalHands,
      finished_at: new Date(),
    });
  }

  async addGamePlayer(
    gameId: string,
    botId: string,
    startChips: number,
    manager?: EntityManager,
  ): Promise<GamePlayer> {
    const repo = this.getGamePlayerRepo(manager);
    const player = repo.create({
      game_id: gameId,
      bot_id: botId,
      start_chips: startChips,
    });
    return repo.save(player);
  }

  async finalizeGamePlayer(
    gameId: string,
    botId: string,
    endChips: number,
    finishPosition: number,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getGamePlayerRepo(manager).update(
      { game_id: gameId, bot_id: botId },
      { end_chips: endChips, finish_position: finishPosition },
    );
  }

  async createHand(
    data: Partial<Hand>,
    manager?: EntityManager,
  ): Promise<Hand> {
    const repo = this.getHandRepo(manager);
    const hand = repo.create({ ...data, started_at: new Date() });
    return repo.save(hand);
  }

  async addHandPlayer(
    data: Partial<HandPlayer>,
    manager?: EntityManager,
  ): Promise<HandPlayer> {
    const repo = this.getHandPlayerRepo(manager);
    const player = repo.create(data);
    return repo.save(player);
  }

  async recordAction(
    data: {
      handId: string;
      botId: string;
      actionSeq: number;
      actionType: ActionType;
      stage: ActionStage;
      amount: number;
      potAfter?: number;
      chipsAfter?: number;
      responseTimeMs?: number;
    },
    manager?: EntityManager,
  ): Promise<Action> {
    const repo = this.getActionRepo(manager);
    const action = repo.create({
      hand_id: data.handId,
      bot_id: data.botId,
      action_seq: data.actionSeq,
      action_type: data.actionType,
      stage: data.stage,
      amount: data.amount,
      pot_after: data.potAfter ?? null,
      chips_after: data.chipsAfter ?? null,
      response_time_ms: data.responseTimeMs ?? null,
    });
    return repo.save(action);
  }

  async completeHandAtomic(data: HandCompletionData): Promise<void> {
    await this.dataSource.transaction("SERIALIZABLE", async (manager) => {
      const handRepo = manager.getRepository(Hand);
      const handPlayerRepo = manager.getRepository(HandPlayer);

      await handRepo.update(data.handId, {
        pot: data.pot,
        community_cards: data.communityCards,
        stage: "complete",
        finished_at: new Date(),
      });

      for (const player of data.players) {
        await handPlayerRepo.update(
          { hand_id: data.handId, bot_id: player.botId },
          {
            end_chips: player.endChips,
            amount_won: player.amountWon,
            folded: player.folded,
            all_in: player.allIn,
            won: player.won,
            saw_showdown: player.sawShowdown,
            best_hand: player.bestHand || null,
          },
        );
      }
    });
  }

  async getHandHistory(
    gameId: string,
    limit: number = 50,
    offset: number = 0,
    manager?: EntityManager,
  ): Promise<Hand[]> {
    return this.getHandRepo(manager).find({
      where: { game_id: gameId },
      relations: ["players", "actions"],
      order: { hand_number: "DESC" },
      take: limit,
      skip: offset,
    });
  }

  async getHandWithDetails(
    handId: string,
    manager?: EntityManager,
  ): Promise<Hand | null> {
    return this.getHandRepo(manager).findOne({
      where: { id: handId },
      relations: ["players", "players.bot", "actions", "actions.bot"],
    });
  }

  async incrementHandsPlayed(
    gameId: string,
    botId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getGamePlayerRepo(manager).increment(
      { game_id: gameId, bot_id: botId },
      "hands_played",
      1,
    );
  }

  async incrementHandsWon(
    gameId: string,
    botId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getGamePlayerRepo(manager).increment(
      { game_id: gameId, bot_id: botId },
      "hands_won",
      1,
    );
  }

  async markSawFlop(
    handId: string,
    botId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getHandPlayerRepo(manager).update(
      { hand_id: handId, bot_id: botId },
      { saw_flop: true },
    );
  }

  async getLeaderboard(
    limit: number = 20,
    period: "all" | "month" | "week" = "all",
  ): Promise<
    Array<{
      name: string;
      bot_id: string;
      games_played: number;
      total_hands: number;
      total_wins: number;
      total_winnings: number;
      net_profit: number;
      win_rate_pct: number | null;
      tournament_wins: number;
      total_tournaments: number;
    }>
  > {
    let dateFilter = "";
    const params: (number | Date)[] = [limit];

    if (period === "week") {
      dateFilter = "AND g.created_at >= $2";
      params.push(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    } else if (period === "month") {
      dateFilter = "AND g.created_at >= $2";
      params.push(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    }

    const result = await this.dataSource.query(
      `
      SELECT
        b.name,
        b.id as bot_id,
        COUNT(DISTINCT gp.game_id)::integer AS games_played,
        COALESCE(SUM(gp.hands_played), 0)::integer AS total_hands,
        COALESCE(SUM(gp.hands_won), 0)::integer AS total_wins,
        COALESCE(SUM(gp.end_chips - gp.start_chips), 0)::integer AS total_winnings,
        COALESCE(SUM(gp.end_chips - gp.start_chips), 0)::integer AS net_profit,
        ROUND(
          100.0 * COALESCE(SUM(gp.hands_won), 0) / NULLIF(COALESCE(SUM(gp.hands_played), 0), 0),
          1
        )::float AS win_rate_pct,
        COALESCE(bs.tournament_wins, 0)::integer AS tournament_wins,
        COALESCE(bs.total_tournaments, 0)::integer AS total_tournaments
      FROM game_players gp
      JOIN bots b ON b.id = gp.bot_id
      JOIN games g ON g.id = gp.game_id
      LEFT JOIN bot_stats bs ON bs.bot_id = b.id
      WHERE gp.end_chips IS NOT NULL ${dateFilter}
      GROUP BY b.id, b.name, bs.tournament_wins, bs.total_tournaments
      ORDER BY total_winnings DESC
      LIMIT $1
      `,
      params,
    );

    return result;
  }

  async getGamePlayers(
    gameId: string,
    manager?: EntityManager,
  ): Promise<GamePlayer[]> {
    return this.getGamePlayerRepo(manager).find({ where: { game_id: gameId } });
  }
}
