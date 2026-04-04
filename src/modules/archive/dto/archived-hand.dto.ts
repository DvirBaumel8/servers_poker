export interface TournamentArchive {
  version: 1;
  tournament_id: string;
  archived_at: string;
  hand_count: number;
  hands: ArchivedHand[];
}

export interface ArchivedHand {
  id: string;
  game_id: string;
  hand_number: number;
  dealer_bot_id: string | null;
  small_blind: string;
  big_blind: string;
  ante: string;
  community_cards: Array<{ rank: string; suit: string }>;
  pot: string;
  stage: string;
  started_at: string | null;
  finished_at: string | null;
  validation_error: boolean;
  is_audited: boolean;
  players: ArchivedHandPlayer[];
  actions: ArchivedAction[];
  logic_bugs: ArchivedLogicBug[];
}

export interface ArchivedHandPlayer {
  id: string;
  hand_id: string;
  bot_id: string;
  position: number;
  hole_cards: Array<{ rank: string; suit: string }>;
  start_chips: string;
  end_chips: string | null;
  amount_bet: string;
  amount_won: string | null;
  folded: boolean;
  all_in: boolean;
  won: boolean;
  saw_flop: boolean;
  saw_showdown: boolean;
  card_status: string;
  best_hand: unknown | null;
}

export interface ArchivedAction {
  id: string;
  hand_id: string;
  bot_id: string;
  action_seq: number;
  action_type: string;
  stage: string;
  amount: string;
  pot_after: string | null;
  chips_after: string | null;
  response_time_ms: number | null;
}

export interface ArchivedLogicBug {
  id: string;
  hand_id: string | null;
  check_name: string;
  description: string;
  details: Record<string, unknown>;
  detected_at: string;
}

export class ArchivedHandResponseDto {
  id: string;
  game_id: string;
  hand_number: number;
  dealer_bot_id: string | null;
  small_blind: string;
  big_blind: string;
  ante: string;
  community_cards: Array<{ rank: string; suit: string }>;
  pot: string;
  stage: string;
  started_at: string | null;
  finished_at: string | null;
  players: ArchivedHandPlayer[];
  actions: ArchivedAction[];
}

export class ArchivedHandListResponseDto {
  tournament_id: string;
  hand_count: number;
  hands: Array<{
    id: string;
    hand_number: number;
    pot: string;
    stage: string;
    started_at: string | null;
    finished_at: string | null;
  }>;
}
