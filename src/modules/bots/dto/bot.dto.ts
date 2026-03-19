import {
  IsString,
  IsUrl,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";

export class CreateBotDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      "Bot name can only contain letters, numbers, underscores, and hyphens",
  })
  name: string;

  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false,
  })
  endpoint: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateBotDto {
  @IsOptional()
  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false,
  })
  endpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class BotResponseDto {
  id: string;
  name: string;
  endpoint: string;
  description: string | null;
  active: boolean;
  user_id: string;
  created_at: Date;
  last_validation: Record<string, any> | null;
  last_validation_score: number | null;
}

export class ValidateBotResponseDto {
  valid: boolean;
  score: number;
  details: {
    reachable: boolean;
    respondedCorrectly: boolean;
    responseTimeMs: number;
    errors: string[];
  };
}

export class HealthCheckRoundDto {
  roundId: number;
  startedAt: Date;
  completedAt?: Date;
  totalBots: number;
  healthyCount: number;
  unhealthyCount: number;
}

export class HealthSummaryDto {
  timestamp: Date;
  totalRegistered: number;
  healthy: number;
  unhealthy: number;
  inActiveGames: number;
  lastCheckRound?: HealthCheckRoundDto;
}

export class BotHealthStatusDto {
  botId: string;
  endpoint: string;
  healthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  averageLatencyMs: number;
  circuitOpen: boolean;
}

export class BotConnectivityStatusDto {
  botId: string;
  name: string;
  endpoint: string;
  health: BotHealthStatusDto | null;
  registered: boolean;
  inActiveGame: boolean;
}

export class HealthCheckResultDto {
  healthy: boolean;
  latencyMs: number;
}

export class BotLatencyDto {
  botId: string;
  averageLatencyMs: number;
}
