export class TournamentResultEntryDto {
  rank: number;
  botId: string;
  botName: string;
  userId: string;
  userName: string;
  finishPosition: number;
  payout: number;
  bustLevel?: number;
}

export class TournamentResultsDto {
  tournamentId: string;
  tournamentName: string;
  finishedAt: Date | null;
  totalEntries: number;
  results: TournamentResultEntryDto[];
}
