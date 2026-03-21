export interface Card {
  rank: string;
  suit: string;
}

export interface Player {
  id: string;
  name: string;
  chips: number;
  bet: number;
  currentBet?: number;
  folded: boolean;
  allIn: boolean;
  disconnected: boolean;
  position?: number;
  strikes?: number;
  holeCards?: Card[];
  lastAction?: {
    type: string;
    amount?: number;
    timestamp: number;
  };
}

export interface GameState {
  id: string;
  gameId?: string;
  tableId: string;
  tournamentId?: string;
  status: "waiting" | "running" | "paused" | "finished" | "error";
  handNumber: number;
  stage: "pre-flop" | "flop" | "turn" | "river" | "showdown";
  pot: number;
  communityCards: Card[];
  currentBet: number;
  currentPlayerId: string | null;
  dealerPosition: number;
  dealerIndex?: number;
  handInProgress?: boolean;
  players: Player[];
  blinds: {
    small: number;
    big: number;
    ante: number;
  };
}

export interface Tournament {
  id: string;
  name: string;
  type: "rolling" | "scheduled";
  status: "registering" | "running" | "final_table" | "finished" | "cancelled";
  buyIn: number;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  blindIncreaseMinutes?: number;
  minPlayers: number;
  maxPlayers: number;
  playersPerTable: number;
  entriesCount: number;
  registeredPlayers: number;
  lateRegEndsLevel: number;
  currentLevel?: number;
  rebuysAllowed: boolean;
  entries?: TournamentEntry[];
  scheduledStartAt?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface TournamentEntry {
  botId: string;
  botName: string;
  chips: number;
  position: number;
  busted: boolean;
}

export interface Bot {
  id: string;
  name: string;
  endpoint: string;
  description?: string;
  active: boolean;
  userId: string;
  createdAt: string;
  lastValidationScore?: number;
}

export interface LeaderboardEntry {
  botId: string;
  botName: string;
  totalNet: number;
  totalTournaments: number;
  tournamentWins: number;
  totalHands: number;
}

export interface HandResult {
  handNumber: number;
  winners: Array<{
    botId: string;
    amount: number;
    handName: string;
  }>;
  pot: number;
  provablyFair?: ProvablyFairData;
}

export interface ProvablyFairData {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  combinedHash: string;
  deckOrder: number[];
  verificationUrl: string;
}

export interface ProvablyFairCommitment {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
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

export interface BotActivity {
  botId: string;
  botName: string;
  isActive: boolean;
  activeGames: BotActivityGame[];
  activeTournaments: BotActivityTournament[];
  lastActivityAt: string | null;
}

export interface ActiveBotsResponse {
  bots: BotActivity[];
  totalActive: number;
  timestamp: string;
}

export interface BotSubscription {
  id: string;
  bot_id: string;
  bot_name?: string;
  tournament_id: string | null;
  tournament_name?: string | null;
  tournament_type_filter: string | null;
  min_buy_in: number | null;
  max_buy_in: number | null;
  priority: number;
  status: "active" | "paused" | "expired";
  successful_registrations: number;
  failed_registrations: number;
  last_registration_attempt: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface SubscriptionStats {
  total: number;
  active: number;
  paused: number;
  expired: number;
  total_successful_registrations: number;
  total_failed_registrations: number;
}
