import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  Max,
  IsDateString,
  IsUUID,
} from "class-validator";

export class CreateSubscriptionDto {
  @IsOptional()
  @IsUUID()
  tournament_id?: string;

  @IsOptional()
  @IsString()
  tournament_type_filter?: "rolling" | "scheduled";

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_buy_in?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_buy_in?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsDateString()
  expires_at?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  tournament_type_filter?: "rolling" | "scheduled" | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_buy_in?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_buy_in?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsEnum(["active", "paused"])
  status?: "active" | "paused";

  @IsOptional()
  @IsDateString()
  expires_at?: string | null;
}

export class SubscriptionResponseDto {
  id: string;
  bot_id: string;
  bot_name?: string;
  tournament_id: string | null;
  tournament_name?: string | null;
  tournament_type_filter: string | null;
  min_buy_in: number | null;
  max_buy_in: number | null;
  priority: number;
  status: string;
  successful_registrations: number;
  failed_registrations: number;
  last_registration_attempt: string | null;
  expires_at: string | null;
  created_at: string;
}

export class SubscriptionStatsDto {
  total: number;
  active: number;
  paused: number;
  expired: number;
  total_successful_registrations: number;
  total_failed_registrations: number;
}
