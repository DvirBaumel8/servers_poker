import {
  IsString,
  IsOptional,
  IsObject,
  IsIn,
  MaxLength,
  IsUUID,
} from "class-validator";

export class RecordEventDto {
  @IsString()
  @IsIn([
    "page_view",
    "bot_created",
    "bot_validated",
    "tournament_joined",
    "tournament_watched",
    "game_watched",
    "subscription_toggled",
    "leaderboard_viewed",
    "profile_viewed",
    "login",
    "logout",
    "signup",
    "feature_used",
  ])
  event_type: string;

  @IsOptional()
  @IsObject()
  event_data?: Record<string, unknown>;

  @IsString()
  @IsUUID()
  session_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  page_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  referrer?: string;
}

export class LifetimeStatsDto {
  totalUsers: number;
  totalBots: number;
  totalHandsDealt: number;
  totalTournaments: number;
  totalGames: number;
  totalChipVolume: number;
}

export class TodayStatsDto {
  newUsers: number;
  activeUsers: number;
  newBots: number;
  activeBots: number;
  gamesPlayed: number;
  handsDealt: number;
  tournamentsCompleted: number;
}

export class LiveStatsDto {
  activeGames: number;
  activeTournaments: number;
  playersInGames: number;
  currentHandsPerMinute: number;
}

export class HealthStatsDto {
  avgBotResponseMs: number;
  botTimeoutCount: number;
  botErrorCount: number;
  errorRate: string;
}

export class PlatformStatsDto {
  lifetime: LifetimeStatsDto;
  today: TodayStatsDto;
  live: LiveStatsDto;
  health: HealthStatsDto;
  generatedAt: string;
}

export class MetricsHistoryQueryDto {
  @IsOptional()
  @IsString()
  days?: string;
}

export class TopPerformerDto {
  botId: string;
  botName: string;
  netChips: number;
}

export class AdminStatsDto extends PlatformStatsDto {
  topPerformers: TopPerformerDto[];
  metricsHistory: Array<{
    date: string;
    hands_dealt: number;
    games_played: number;
    active_users: number;
    active_bots: number;
  }>;
}
