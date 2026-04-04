import { IsOptional, IsIn, IsNumber, Min, Max } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// ============================================================================
// ENUMS
// ============================================================================

export enum TierBadge {
  TIER_1_QUICK = "TIER_1_QUICK",
  TIER_2_MATRIX = "TIER_2_MATRIX",
  TIER_3_ELITE = "TIER_3_ELITE",
}

// ============================================================================
// QUERY DTO
// ============================================================================

export class LeaderboardQueryDto {
  @ApiPropertyOptional({
    enum: ["QUICK", "MATRIX", "ELITE"],
    description: "Filter by strategy tier",
  })
  @IsOptional()
  @IsIn(["QUICK", "MATRIX", "ELITE"])
  tier?: string;

  @ApiPropertyOptional({
    enum: ["daily", "weekly", "monthly", "all_time"],
    default: "all_time",
    description: "Time period for stats aggregation",
  })
  @IsOptional()
  @IsIn(["daily", "weekly", "monthly", "all_time"])
  period?: string;

  @ApiPropertyOptional({
    enum: ["bb100", "roi"],
    default: "bb100",
    description: "Sort column (BB/100 or ROI)",
  })
  @IsOptional()
  @IsIn(["bb100", "roi"])
  sortBy?: string;

  @ApiPropertyOptional({
    default: 10,
    minimum: 0,
    description: "Minimum hands played to appear on leaderboard",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minGames?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number;
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export class LeaderboardEntryDto {
  @ApiProperty() botId: string;
  @ApiProperty() botName: string;
  @ApiProperty() userId: string;
  @ApiProperty({ description: "Display name of the bot owner" })
  ownerName: string;
  @ApiProperty({ enum: TierBadge }) tierBadge: TierBadge;
  @ApiProperty({ description: "Big blinds won per 100 hands" }) bb100: number;
  @ApiProperty({ description: "In-the-money percentage" }) itmPct: number;
  @ApiProperty({ description: "Return on investment percentage" })
  roiPct: number;
  @ApiProperty() totalHands: number;
  @ApiProperty() totalTournaments: number;
  @ApiProperty() tournamentWins: number;
  @ApiProperty({ description: "Net chips as string (BigInt)" })
  totalNet: string;
  @ApiProperty({ description: "Total payouts as string (BigInt)" })
  totalPayout: string;
  @ApiProperty({ description: "Leaderboard rank (1-based)" }) rank: number;
}

export class PaginatedLeaderboardDto {
  @ApiProperty({ type: [LeaderboardEntryDto] })
  data: LeaderboardEntryDto[];

  @ApiProperty() total: number;
  @ApiProperty() limit: number;
  @ApiProperty() offset: number;
  @ApiProperty({
    description: "ISO timestamp of last materialized view refresh",
  })
  lastRefreshedAt: string;
}

export class HotStreakEntryDto {
  @ApiProperty() tournamentId: string;
  @ApiProperty() tournamentName: string;
  @ApiProperty() finishPosition: number;
  @ApiProperty() maxPlayers: number;
  @ApiProperty({ description: "Whether this finish was in the money" })
  isItm: boolean;
  @ApiProperty() finishedAt: string;
}

export class BotPerformanceDto {
  @ApiProperty() botId: string;
  @ApiProperty() botName: string;
  @ApiProperty({ enum: TierBadge }) tierBadge: TierBadge;
  @ApiProperty({ description: "Big blinds won per 100 hands" }) bb100: number;
  @ApiProperty({ description: "In-the-money percentage" }) itmPct: number;
  @ApiProperty({ description: "Return on investment percentage" })
  roiPct: number;
  @ApiProperty() totalHands: number;
  @ApiProperty() totalTournaments: number;
  @ApiProperty() tournamentWins: number;
  @ApiProperty({ description: "Net chips as string (BigInt)" })
  totalNet: string;
  @ApiProperty({ description: "Total payouts as string (BigInt)" })
  totalPayout: string;
  @ApiProperty({
    type: [HotStreakEntryDto],
    description: "Last 5 tournament finishes with ITM status",
  })
  hotStreak: HotStreakEntryDto[];
  @ApiProperty({
    description:
      "Standard deviation of finish positions (lower = more consistent). Null if < 2 tournaments.",
    nullable: true,
  })
  consistencyIndex: number | null;
}
