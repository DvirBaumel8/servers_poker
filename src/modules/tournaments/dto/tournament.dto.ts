import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsBoolean,
  Min,
  Max,
  IsIn,
} from "class-validator";
import { TournamentType } from "../../../entities/tournament.entity";

export class CreateTournamentDto {
  @IsString()
  name: string;

  @IsIn(["rolling", "scheduled"])
  type: TournamentType;

  @IsNumber()
  @Min(0)
  buy_in: number;

  @IsNumber()
  @Min(100)
  starting_chips: number;

  @IsNumber()
  @Min(2)
  min_players: number;

  @IsNumber()
  @Min(2)
  max_players: number;

  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(10)
  players_per_table?: number;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(60000)
  turn_timeout_ms?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  late_reg_ends_level?: number;

  @IsOptional()
  @IsBoolean()
  rebuys_allowed?: boolean;

  @IsOptional()
  @IsDateString()
  scheduled_start_at?: string;

  @IsOptional()
  blind_levels?: Array<{
    level: number;
    small_blind: number;
    big_blind: number;
    ante?: number;
  }>;
}

export class RegisterBotDto {
  @IsString()
  bot_id: string;
}

export class TournamentResponseDto {
  id: string;
  name: string;
  type: TournamentType;
  status: string;
  buy_in: number;
  starting_chips: number;
  small_blind?: number;
  big_blind?: number;
  current_level?: number;
  min_players: number;
  max_players: number;
  players_per_table: number;
  turn_timeout_ms: number;
  late_reg_ends_level: number;
  rebuys_allowed: boolean;
  scheduled_start_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  entries_count: number;
  created_at: Date;
}

export class TournamentResultDto {
  bot_id: string;
  bot_name: string;
  finish_position: number;
  payout: number;
}

export class TournamentLeaderboardEntryDto {
  position: number;
  bot_id: string;
  bot_name: string;
  chips: number;
  busted: boolean;
}

export class TournamentStateDto {
  tournamentId: string;
  name: string;
  status: string;
  playersRemaining: number;
  totalEntrants: number;
  tables?: number;
  currentLevel?: number;
  smallBlind?: number;
  bigBlind?: number;
  ante?: number;
}
