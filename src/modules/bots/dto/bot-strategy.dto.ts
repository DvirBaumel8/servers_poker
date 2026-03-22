import {
  IsString,
  IsOptional,
  IsObject,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";
import type { BotStrategy } from "../../../domain/bot-strategy/strategy.types";

export class CreateInternalBotDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      "Bot name can only contain letters, numbers, underscores, and hyphens",
  })
  name: string;

  @IsObject()
  strategy: BotStrategy;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^[^<>]*$/, {
    message: "Description must not contain HTML tags",
  })
  description?: string;
}

export class UpdateStrategyDto {
  @IsObject()
  strategy: BotStrategy;
}

export class SimulateActionDto {
  @IsObject()
  strategy: BotStrategy;

  @IsObject()
  scenario: Record<string, any>;
}

export class StrategyValidationResponseDto {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
    severity: "error" | "warning";
  }>;
  warnings: Array<{
    path: string;
    message: string;
    severity: "error" | "warning";
  }>;
  conflicts: Array<{
    ruleA: string;
    ruleB: string;
    street: string;
    description: string;
    severity: "error" | "warning";
  }>;
}
