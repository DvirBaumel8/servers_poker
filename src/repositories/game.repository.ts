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

  async findByTableId(
    tableId: string,
    manager?: EntityManager,
  ): Promise<Game[]> {
    const repo = manager ? manager.getRepository(Game) : this.repository;
    return repo.find({
      where: { table_id: tableId },
      order: { created_at: "DESC" },
    });
  }

  async createGame(
    tableId: string,
    tournamentId?: string,
    manager?: EntityManager,
  ): Promise<Game> {
    const repo = manager ? manager.getRepository(Game) : this.repository;
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
    const repo = manager ? manager.getRepository(Game) : this.repository;
    await repo.update(id, {
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
    const repo = manager
      ? manager.getRepository(GamePlayer)
      : this.gamePlayerRepository;
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
    const repo = manager
      ? manager.getRepository(GamePlayer)
      : this.gamePlayerRepository;
    await repo.update(
      { game_id: gameId, bot_id: botId },
      { end_chips: endChips, finish_position: finishPosition },
    );
  }

  async createHand(
    data: Partial<Hand>,
    manager?: EntityManager,
  ): Promise<Hand> {
    const repo = manager ? manager.getRepository(Hand) : this.handRepository;
    const hand = repo.create({ ...data, started_at: new Date() });
    return repo.save(hand);
  }

  async addHandPlayer(
    data: Partial<HandPlayer>,
    manager?: EntityManager,
  ): Promise<HandPlayer> {
    const repo = manager
      ? manager.getRepository(HandPlayer)
      : this.handPlayerRepository;
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
    const repo = manager
      ? manager.getRepository(Action)
      : this.actionRepository;
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
    const repo = manager ? manager.getRepository(Hand) : this.handRepository;
    return repo.find({
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
    const repo = manager ? manager.getRepository(Hand) : this.handRepository;
    return repo.findOne({
      where: { id: handId },
      relations: ["players", "players.bot", "actions", "actions.bot"],
    });
  }

  async incrementHandsPlayed(
    gameId: string,
    botId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(GamePlayer)
      : this.gamePlayerRepository;
    await repo.increment({ game_id: gameId, bot_id: botId }, "hands_played", 1);
  }

  async incrementHandsWon(
    gameId: string,
    botId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(GamePlayer)
      : this.gamePlayerRepository;
    await repo.increment({ game_id: gameId, bot_id: botId }, "hands_won", 1);
  }

  async markSawFlop(
    handId: string,
    botId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(HandPlayer)
      : this.handPlayerRepository;
    await repo.update({ hand_id: handId, bot_id: botId }, { saw_flop: true });
  }

  async getLeaderboard(limit: number = 20): Promise<
    Array<{
      name: string;
      bot_id: string;
      games_played: number;
      total_hands: number;
      total_wins: number;
      net_profit: number;
      win_rate_pct: number | null;
    }>
  > {
    const result = await this.dataSource.query(
      `
      SELECT
        b.name,
        b.id as bot_id,
        COUNT(DISTINCT gp.game_id) AS games_played,
        COALESCE(SUM(gp.hands_played), 0) AS total_hands,
        COALESCE(SUM(gp.hands_won), 0) AS total_wins,
        COALESCE(SUM(gp.end_chips - gp.start_chips), 0) AS net_profit,
        ROUND(
          100.0 * COALESCE(SUM(gp.hands_won), 0) / NULLIF(COALESCE(SUM(gp.hands_played), 0), 0),
          1
        ) AS win_rate_pct
      FROM game_players gp
      JOIN bots b ON b.id = gp.bot_id
      WHERE gp.end_chips IS NOT NULL
      GROUP BY b.id, b.name
      ORDER BY net_profit DESC
      LIMIT $1
      `,
      [limit],
    );

    return result;
  }
}
