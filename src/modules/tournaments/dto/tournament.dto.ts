import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  MinLength,
  IsIn,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from "class-validator";
import { TournamentType } from "../../../entities/tournament.entity";
import { SafeNameConstraint } from "../../../common/validators/input-sanitization.validator";

const MAX_SAFE_BUY_IN = 1_000_000_000;

@ValidatorConstraint({ name: "minPlayersLessThanMax", async: false })
export class MinPlayersLessThanMaxConstraint implements ValidatorConstraintInterface {
  validate(_value: number, args: ValidationArguments): boolean {
    const obj = args.object as CreateTournamentDto;
    return obj.min_players <= obj.max_players;
  }

  defaultMessage(): string {
    return "min_players must be less than or equal to max_players";
  }
}

@ValidatorConstraint({ name: "futureDate", async: false })
export class FutureDateConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    if (!value) return true;
    const date = new Date(value);
    return date.getTime() > Date.now();
  }

  defaultMessage(): string {
    return "scheduled_start_at must be a future date";
  }
}

export class CreateTournamentDto {
  @IsString()
  @MinLength(1, { message: "Tournament name cannot be empty" })
  @MaxLength(100, { message: "Tournament name cannot exceed 100 characters" })
  @Matches(/^[a-zA-Z0-9\s\-_.,!?()]+$/, {
    message:
      "Tournament name can only contain letters, numbers, spaces, and basic punctuation (- _ . , ! ? ( ))",
  })
  @Validate(SafeNameConstraint)
  name: string;

  @IsIn(["rolling", "scheduled"])
  type: TournamentType;

  @IsNumber()
  @Min(0, { message: "buy_in must be at least 0" })
  @Max(MAX_SAFE_BUY_IN, {
    message: `buy_in cannot exceed ${MAX_SAFE_BUY_IN.toLocaleString()}`,
  })
  buy_in: number;

  @IsNumber()
  @Min(100, { message: "starting_chips must be at least 100" })
  @Max(MAX_SAFE_BUY_IN, {
    message: `starting_chips cannot exceed ${MAX_SAFE_BUY_IN.toLocaleString()}`,
  })
  starting_chips: number;

  @IsNumber()
  @Min(2, { message: "min_players must be at least 2" })
  @Validate(MinPlayersLessThanMaxConstraint)
  min_players: number;

  @IsNumber()
  @Min(2, { message: "max_players must be at least 2" })
  @Max(10000, { message: "max_players cannot exceed 10000" })
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
  @Validate(FutureDateConstraint)
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

export class UpdateTournamentScheduleDto {
  @IsOptional()
  @IsDateString()
  @Validate(FutureDateConstraint)
  scheduled_start_at?: string;
}

export class UpdateSchedulerConfigDto {
  @IsOptional()
  @IsString()
  cron_expression?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class SchedulerStatusDto {
  enabled: boolean;
  cronExpression: string;
  nextRun: Date | null;
  lastRun: Date | null;
}

export class TournamentQueryDto {
  @IsOptional()
  @IsIn([
    "registering",
    "rolling",
    "running",
    "final_table",
    "finished",
    "cancelled",
  ])
  status?: string;
}
