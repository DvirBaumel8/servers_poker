import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { LiveGameManagerService } from "../game/live-game-manager.service";
import { GamePlayer } from "../../entities/game-player.entity";
import { Game } from "../../entities/game.entity";
import { Tournament } from "../../entities/tournament.entity";
import { TournamentEntry } from "../../entities/tournament-entry.entity";
import { TournamentSeat } from "../../entities/tournament-seat.entity";
import { Table } from "../../entities/table.entity";
import { Bot } from "../../entities/bot.entity";
import {
  BotActivityDto,
  BotActivityGame,
  BotActivityTournament,
} from "../../modules/bots/dto/bot.dto";

@Injectable()
export class BotActivityService {
  private readonly logger = new Logger(BotActivityService.name);

  constructor(
    private readonly liveGameManager: LiveGameManagerService,
    @InjectRepository(Bot)
    private readonly botRepository: Repository<Bot>,
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    @InjectRepository(GamePlayer)
    private readonly gamePlayerRepository: Repository<GamePlayer>,
    @InjectRepository(Tournament)
    private readonly tournamentRepository: Repository<Tournament>,
    @InjectRepository(TournamentEntry)
    private readonly tournamentEntryRepository: Repository<TournamentEntry>,
    @InjectRepository(TournamentSeat)
    private readonly tournamentSeatRepository: Repository<TournamentSeat>,
    @InjectRepository(Table)
    private readonly tableRepository: Repository<Table>,
  ) {}

  async getBotActivity(botId: string): Promise<BotActivityDto | null> {
    const bot = await this.botRepository.findOne({ where: { id: botId } });
    if (!bot) {
      return null;
    }

    const activeGames = await this.getActiveGamesForBot(botId);
    const activeTournaments = await this.getActiveTournamentsForBot(botId);

    let lastActivityAt: string | null = null;
    if (activeGames.length > 0 || activeTournaments.length > 0) {
      lastActivityAt = new Date().toISOString();
    }

    return {
      botId: bot.id,
      botName: bot.name,
      isActive: activeGames.length > 0 || activeTournaments.length > 0,
      activeGames,
      activeTournaments,
      lastActivityAt,
    };
  }

  async getActiveBotsForUser(userId: string): Promise<BotActivityDto[]> {
    const bots = await this.botRepository.find({ where: { user_id: userId } });
    const activities: BotActivityDto[] = [];

    for (const bot of bots) {
      const activity = await this.getBotActivity(bot.id);
      if (activity) {
        activities.push(activity);
      }
    }

    return activities;
  }

  async getAllActiveBots(): Promise<BotActivityDto[]> {
    const liveGames = this.liveGameManager.getAllGames();
    const activeBotIds = new Set<string>();

    for (const liveGame of liveGames) {
      for (const player of liveGame.game.players) {
        if (!player.disconnected) {
          activeBotIds.add(player.id);
        }
      }
    }

    const activeTournaments = await this.tournamentRepository.find({
      where: { status: In(["running", "final_table"]) },
    });

    for (const tournament of activeTournaments) {
      const seats = await this.tournamentSeatRepository.find({
        where: { tournament_id: tournament.id, busted: false },
      });
      for (const seat of seats) {
        activeBotIds.add(seat.bot_id);
      }
    }

    const activities: BotActivityDto[] = [];
    for (const botId of activeBotIds) {
      const activity = await this.getBotActivity(botId);
      if (activity && activity.isActive) {
        activities.push(activity);
      }
    }

    return activities;
  }

  private async getActiveGamesForBot(
    botId: string,
  ): Promise<BotActivityGame[]> {
    const activeGames: BotActivityGame[] = [];
    const liveGames = this.liveGameManager.getAllGames();

    for (const liveGame of liveGames) {
      const player = liveGame.game.players.find(
        (p) => p.id === botId && !p.disconnected,
      );

      if (player) {
        let tableName: string | undefined;
        let tournamentName: string | undefined;

        const table = await this.tableRepository.findOne({
          where: { id: liveGame.tableId },
        });
        if (table) {
          tableName = table.name;
        }

        if (liveGame.tournamentId) {
          const tournament = await this.tournamentRepository.findOne({
            where: { id: liveGame.tournamentId },
          });
          if (tournament) {
            tournamentName = tournament.name;
          }
        }

        const playerIndex = liveGame.game.players.findIndex(
          (p) => p.id === botId,
        );

        activeGames.push({
          tableId: liveGame.tableId,
          gameId: liveGame.gameDbId,
          tournamentId: liveGame.tournamentId,
          tournamentName,
          tableName,
          status: liveGame.game.status,
          handNumber: liveGame.game.handNumber,
          chips: player.chips,
          position: playerIndex >= 0 ? playerIndex + 1 : undefined,
          joinedAt: liveGame.startedAt.toISOString(),
        });
      }
    }

    return activeGames;
  }

  private async getActiveTournamentsForBot(
    botId: string,
  ): Promise<BotActivityTournament[]> {
    const activeTournaments: BotActivityTournament[] = [];

    const entries = await this.tournamentEntryRepository.find({
      where: { bot_id: botId },
      relations: ["tournament"],
    });

    for (const entry of entries) {
      if (!entry.tournament) continue;

      const status = entry.tournament.status;
      if (
        status !== "registering" &&
        status !== "running" &&
        status !== "final_table"
      ) {
        continue;
      }

      let chips = 0;
      let tableId: string | undefined;
      let tableName: string | undefined;
      let position: number | undefined;

      if (status === "running" || status === "final_table") {
        const seat = await this.tournamentSeatRepository.findOne({
          where: { tournament_id: entry.tournament_id, bot_id: botId },
        });
        if (seat && !seat.busted) {
          chips = Number(seat.chips);
          tableId = seat.tournament_table_id;

          const allSeats = await this.tournamentSeatRepository.find({
            where: { tournament_id: entry.tournament_id, busted: false },
            order: { chips: "DESC" },
          });
          const seatIndex = allSeats.findIndex((s) => s.bot_id === botId);
          position = seatIndex >= 0 ? seatIndex + 1 : undefined;

          if (tableId) {
            const liveGame = this.liveGameManager.getGame(tableId);
            if (liveGame) {
              tableName = `Table ${tableId.substring(0, 8)}`;
            }
          }
        } else if (seat?.busted) {
          continue;
        }
      }

      activeTournaments.push({
        tournamentId: entry.tournament_id,
        tournamentName: entry.tournament.name,
        status,
        chips,
        position,
        tableId,
        tableName,
        registeredAt: entry.created_at.toISOString(),
      });
    }

    return activeTournaments;
  }
}
