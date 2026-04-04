import {
  IsString,
  IsOptional,
  IsObject,
  IsNotEmpty,
  IsNumber,
  IsIn,
  IsArray,
  IsBoolean,
  MinLength,
  MaxLength,
  Matches,
  ValidateNested,
  Min,
  Max,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";
import { Type } from "class-transformer";

const VALID_TIERS = ["quick", "strategy", "pro"] as const;
const MAX_STRATEGY_JSON_BYTES = 50 * 1024;

function MaxJsonSize(maxBytes: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "maxJsonSize",
      target: object.constructor,
      propertyName,
      constraints: [maxBytes],
      options: {
        message: `Strategy JSON must not exceed ${maxBytes} bytes`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          if (value === null || value === undefined) return true;
          try {
            return JSON.stringify(value).length <= maxBytes;
          } catch {
            return false;
          }
        },
      },
    });
  };
}

class PersonalityDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  aggression: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  bluffFrequency: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  riskTolerance: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  tightness: number;
}

class StrategyDto {
  @IsNumber()
  version: number;

  @IsString()
  @IsIn([...VALID_TIERS])
  tier: string;

  @ValidateNested()
  @Type(() => PersonalityDto)
  @IsNotEmpty()
  personality: PersonalityDto;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  rangeChart?: Record<string, string>;
}

export class CreateInternalBotDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_\- ]+$/, {
    message:
      "Bot name can only contain letters, numbers, underscores, hyphens, and spaces",
  })
  name: string;

  @IsObject()
  @IsNotEmpty()
  @MaxJsonSize(MAX_STRATEGY_JSON_BYTES)
  @ValidateNested()
  @Type(() => StrategyDto)
  strategy: StrategyDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^[^<>]*$/, {
    message: "Description must not contain HTML tags",
  })
  description?: string;
}

class SimulateScenarioDto {
  @IsString()
  @IsIn(["pre-flop", "preflop", "flop", "turn", "river"])
  stage: string;

  @IsArray()
  @IsString({ each: true })
  holeCards: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  communityCards: string[];

  @IsString()
  position: string;

  @IsNumber()
  @Min(0)
  stackSize: number;

  @IsNumber()
  @Min(0)
  potSize: number;

  @IsNumber()
  @Min(1)
  bigBlind: number;

  @IsBoolean()
  facingBet: boolean;

  @IsNumber()
  @Min(0)
  betAmount: number;

  @IsNumber()
  @Min(2)
  @Max(10)
  playersInHand: number;
}

export class SimulateActionDto {
  @IsObject()
  @IsNotEmpty()
  @MaxJsonSize(MAX_STRATEGY_JSON_BYTES)
  @ValidateNested()
  @Type(() => StrategyDto)
  strategy: StrategyDto;

  @IsObject()
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => SimulateScenarioDto)
  scenario: SimulateScenarioDto;
}

export class UpdateBotDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_\- ]+$/, {
    message:
      "Bot name can only contain letters, numbers, underscores, hyphens, and spaces",
  })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^[^<>]*$/, {
    message: "Description must not contain HTML tags",
  })
  description?: string;

  @IsOptional()
  @IsObject()
  @MaxJsonSize(MAX_STRATEGY_JSON_BYTES)
  @ValidateNested()
  @Type(() => StrategyDto)
  strategy?: StrategyDto;
}

export class BotResponseDto {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  user_id: string;
  created_at: Date;
  strategy: Record<string, any> | null;
}

export interface BotActivityGame {
  tableId: string;
  gameId: string;
  tournamentId?: string;
  tournamentName?: string;
  tableName?: string;
  status: "waiting" | "running" | "finished" | "error";
  handNumber: number;
  chips: number;
  position?: number;
  joinedAt: string;
}

export interface BotActivityTournament {
  tournamentId: string;
  tournamentName: string;
  status: "registering" | "running" | "final_table" | "finished" | "cancelled";
  chips: number;
  position?: number;
  tableId?: string;
  tableName?: string;
  registeredAt: string;
}

export class BotActivityDto {
  botId: string;
  botName: string;
  isActive: boolean;
  activeGames: BotActivityGame[];
  activeTournaments: BotActivityTournament[];
  lastActivityAt: string | null;
}

export class ActiveBotsResponseDto {
  bots: BotActivityDto[];
  totalActive: number;
  timestamp: string;
}
