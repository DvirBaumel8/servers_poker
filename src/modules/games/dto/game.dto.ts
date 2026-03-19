import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  Max,
  IsInt,
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
