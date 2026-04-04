import {
  IsString,
  IsArray,
  IsNumber,
  IsOptional,
  ArrayMinSize,
  ArrayMaxSize,
  Min,
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
}
