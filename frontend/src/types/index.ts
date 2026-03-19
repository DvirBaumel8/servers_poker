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
  minPlayers: number;
  maxPlayers: number;
  playersPerTable: number;
  entriesCount: number;
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
}
