import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  Min,
  Max,
  IsInt,
  ArrayMinSize,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateGameDto {
  @IsString()
  table_id: string;

  @IsOptional()
  @IsString()
  tournament_id?: string;
}

export class JoinTableDto {
  @IsString()
  bot_id: string;
}

export class CreateTableDto {
  @IsString()
  @MinLength(1, { message: "Table name must not be empty" })
  @MaxLength(50, { message: "Table name must not exceed 50 characters" })
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/, {
    message:
      "Table name must start with a letter or number and contain only letters, numbers, spaces, underscores, and hyphens",
  })
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  small_blind?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  big_blind?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  starting_chips?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(9)
  max_players?: number;

  @IsOptional()
  @IsInt()
  @Min(5000)
  turn_timeout_ms?: number;
}

export class TableResponseDto {
  id: string;
  name: string;
  status: string;
  config: {
    small_blind: number;
    big_blind: number;
    starting_chips: number;
    max_players: number;
  };
  players: Array<{
    name: string;
    chips: number;
    disconnected: boolean;
  }>;
  gameId?: string;
  tournamentId?: string;
  tableNumber?: number;
}

export class JoinTableResponseDto {
  message: string;
  tableId: string;
  botId: string;
  playerCount: number;
}

export class LeaderboardEntryDto {
  name: string;
  bot_id: string;
  games_played: number;
  total_hands: number;
  total_wins: number;
  total_winnings: number;
  win_rate_pct: number | null;
}

export class BotActionDto {
  @IsString()
  action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class GameStateDto {
  id: string;
  table_id: string;
  tournament_id: string | null;
  status: string;
  hand_number: number;
  stage: string;
  pot: number;
  community_cards: Array<{ rank: string; suit: string }>;
  current_bet: number;
  current_player_id: string | null;
  dealer_position: number;
  players: Array<{
    bot_id: string;
    position: number;
    chips: number;
    bet: number;
    folded: boolean;
    all_in: boolean;
    cards?: Array<{ rank: string; suit: string }>;
  }>;
  valid_actions: Array<{
    action: string;
    min_amount?: number;
    max_amount?: number;
  }>;
}

export class HandHistoryDto {
  id: string;
  hand_number: number;
  pot: number;
  community_cards: Array<{ rank: string; suit: string }>;
  players: Array<{
    bot_id: string;
    bot_name: string;
    position: number;
    hole_cards: Array<{ rank: string; suit: string }>;
    amount_bet: number;
    amount_won: number;
    folded: boolean;
    won: boolean;
    best_hand?: {
      name: string;
      cards: Array<{ rank: string; suit: string }>;
    };
  }>;
  actions: Array<{
    bot_id: string;
    action_type: string;
    amount: number;
    stage: string;
  }>;
  started_at: Date;
  finished_at: Date;
}

// Provably Fair DTOs
export class VerifyHandDto {
  @IsString()
  serverSeed: string;

  @IsString()
  serverSeedHash: string;

  @IsString()
  clientSeed: string;

  @IsInt()
  @Min(1)
  nonce: number;

  @IsArray()
  @ArrayMinSize(52)
  @IsInt({ each: true })
  deckOrder: number[];
}

export class VerifyHandResponseDto {
  valid: boolean;
  serverSeedHashMatch: boolean;
  deckOrderMatch: boolean;
  message: string;
  details?: {
    providedServerSeed: string;
    calculatedHash: string;
    expectedHash: string;
    calculatedDeckOrder: number[];
    expectedDeckOrder: number[];
  };
}

export class HandSeedCommitmentDto {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export class HandSeedVerificationDto {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  combinedHash: string;
  deckOrder: number[];
  verificationUrl: string;
}
