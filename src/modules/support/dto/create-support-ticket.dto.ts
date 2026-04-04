import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateSupportTicketDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: "Issue with hand history",
    minLength: 3,
    maxLength: 200,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    example: "I noticed something wrong with hand #123...",
    minLength: 10,
  })
  @IsString()
  @MinLength(10)
  message: string;

  @ApiPropertyOptional({
    description: "Hand ID to link this ticket to a specific hand",
  })
  @IsOptional()
  @IsString()
  handId?: string;

  @ApiPropertyOptional({
    description: "Tournament ID to link this ticket to a tournament",
  })
  @IsOptional()
  @IsString()
  tournamentId?: string;
}
