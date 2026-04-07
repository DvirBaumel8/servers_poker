import {
  IsString,
  IsArray,
  IsNumber,
  IsInt,
  IsOptional,
  ArrayMinSize,
  ArrayMaxSize,
  Min,
  Max,
} from "class-validator";

export class ScenarioDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsString({ each: true })
  holeCards!: [string, string];

  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  communityCards!: string[];

  @IsString()
  position!: string;

  @IsNumber()
  @Min(0)
  pot!: number;

  @IsNumber()
  @Min(0)
  toCall!: number;

  @IsNumber()
  @Min(0)
  minRaise!: number;

  @IsOptional()
  @IsString()
  currentAction?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(9)
  numberOfPlayers?: number;

  /** Your bot's stack in chips. Defaults to 1000. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  botStack?: number;

  /** Average opponent stack in chips. Defaults to botStack ?? 1000. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  avgOpponentStack?: number;

  /** Big blind chip value. Defaults to 10. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  bigBlind?: number;

  /**
   * The last action taken by an opponent before it's the hero's turn.
   * Values: 'check' | 'bet' | 'raise' | 'all_in'
   * When 'check', toCall must be 0 and fold is illegal — the backend enforces this.
   */
  @IsOptional()
  @IsString()
  lastAction?: string;
}
