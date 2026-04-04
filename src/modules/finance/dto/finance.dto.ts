import { IsNumber, IsOptional, Min, Max } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class DepositDto {
  @ApiProperty({
    description: "Amount to deposit (positive integer)",
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  @Max(1_000_000_000)
  amount: number;
}

export class WithdrawDto {
  @ApiProperty({
    description: "Amount to withdraw (positive integer)",
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  @Max(1_000_000_000)
  amount: number;
}

export class PaginationDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
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

export class WalletResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() user_id: string;
  @ApiProperty({ description: "Balance as string (BigInt)" }) balance: string;
  @ApiProperty() created_at: Date;
}

export class TransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() wallet_id: string;
  @ApiProperty({ enum: ["deposit", "withdrawal", "buy_in", "payout", "prize"] })
  type: string;
  @ApiProperty({ description: "Amount as string (BigInt)" }) amount: string;
  @ApiPropertyOptional() reference_id: string | null;
  @ApiPropertyOptional() description: string | null;
  @ApiProperty() created_at: Date;
}

export class PaginatedTransactionsDto {
  @ApiProperty({ type: [TransactionResponseDto] })
  data: TransactionResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() limit: number;
  @ApiProperty() offset: number;
}
