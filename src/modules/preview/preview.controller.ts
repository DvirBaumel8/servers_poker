import { Controller, Get } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { Throttle } from "@nestjs/throttler";
import { GamesService } from "../games/games.service";
import { TablesService } from "../games/tables.service";
import { TournamentsService } from "../tournaments/tournaments.service";

/**
 * Preview endpoints provide limited, anonymized data for unauthenticated users.
 * These are intended for landing pages and marketing to show platform activity
 * without exposing sensitive competitive information.
 */
@Controller("preview")
export class PreviewController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly tablesService: TablesService,
    private readonly tournamentsService: TournamentsService,
  ) {}

  /**
   * Get a high-level summary of platform activity.
   * Rate limited: 30 requests per minute per IP.
   */
  @Public()
  @Get("stats")
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async getPlatformStats() {
    const tables = await this.tablesService.findAllWithState();
    const activeTables = tables.filter((t) => t.status === "running");
    const tournaments = await this.tournamentsService.findAll();
    const activeTournaments = tournaments.filter(
      (t) => t.status === "running" || t.status === "registering",
    );

    return {
      activeTables: activeTables.length,
      totalTables: tables.length,
      activeTournaments: activeTournaments.length,
      totalTournaments: tournaments.length,
      totalPlayersOnline: activeTables.reduce(
        (sum, t) => sum + (t.players?.length || 0),
        0,
      ),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get preview of active tables (names and player counts only, no game state).
   * Rate limited: 20 requests per minute per IP.
   */
  @Public()
  @Get("tables")
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async getTablesPreview() {
    const tables = await this.tablesService.findAllWithState();

    return tables.slice(0, 10).map((table) => ({
      id: table.id,
      name: table.name,
      status: table.status,
      playerCount: table.players?.length || 0,
      maxPlayers: table.config?.max_players || 9,
      blinds: {
        small: table.config?.small_blind || 0,
        big: table.config?.big_blind || 0,
      },
    }));
  }

  /**
   * Get preview of active tournaments (basic info, no detailed standings).
   * Rate limited: 20 requests per minute per IP.
   */
  @Public()
  @Get("tournaments")
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async getTournamentsPreview() {
    const tournaments = await this.tournamentsService.findAll();

    return tournaments
      .filter((t) => t.status !== "cancelled")
      .slice(0, 10)
      .map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        type: tournament.type,
        status: tournament.status,
        buyIn: tournament.buy_in,
        playersRegistered: tournament.entries_count,
        maxPlayers: tournament.max_players,
        prizePool: tournament.buy_in * tournament.entries_count,
      }));
  }

  /**
   * Get anonymized leaderboard preview (top 5 only, limited info).
   * Rate limited: 20 requests per minute per IP.
   */
  @Public()
  @Get("leaderboard")
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async getLeaderboardPreview() {
    const leaderboard = await this.gamesService.getLeaderboard(5);

    return leaderboard.map((entry, index) => ({
      rank: index + 1,
      botName: entry.name,
      totalWinnings: parseInt(String(entry.total_winnings), 10) || 0,
      gamesPlayed: parseInt(String(entry.games_played), 10) || 0,
    }));
  }
}
