/**
 * Pokersolver-backed hand evaluator.
 * Drop-in replacement for handEvaluator.ts — same determineWinners() interface.
 * Used by the tournament simulation worker so the custom evaluator stays untouched.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Hand } = require("pokersolver");

interface Card {
  rank: string;
  suit: string;
  value?: number;
}

interface Player {
  id: string;
  holeCards: Card[];
}

interface WinnerResult {
  playerId: string;
  hand: { name: string; rank: number; descr: string };
}

const SUIT_MAP: Record<string, string> = {
  "♠": "s",
  "♥": "h",
  "♦": "d",
  "♣": "c",
};

function toPokersolverCards(cards: Card[]): string[] {
  return cards.map((card) => {
    const rank = card.rank === "10" ? "T" : card.rank;
    const suit = SUIT_MAP[card.suit] || card.suit.toLowerCase();
    return rank + suit;
  });
}

/**
 * Determine winners from a set of players and community cards.
 * Returns the same shape as the original determineWinners() in handEvaluator.ts.
 */
export function determineWinners(
  players: Player[],
  communityCards: Card[],
): { winners: WinnerResult[]; hands: WinnerResult[] } {
  const community = toPokersolverCards(communityCards);

  const solved = players.map((p) => {
    const hole = toPokersolverCards(p.holeCards);
    const hand = Hand.solve([...hole, ...community]);
    return { playerId: p.id, hand, solvedHand: hand };
  });

  const winningHands: any[] = Hand.winners(solved.map((s) => s.solvedHand));
  const winnerSet = new Set(winningHands);

  const result = solved.map((s) => ({
    playerId: s.playerId,
    hand: {
      name: s.hand.name as string,
      rank: s.hand.rank as number,
      descr: s.hand.descr as string,
    },
  }));

  const winners = solved
    .filter((s) => winnerSet.has(s.solvedHand))
    .map((s) => ({
      playerId: s.playerId,
      hand: {
        name: s.hand.name as string,
        rank: s.hand.rank as number,
        descr: s.hand.descr as string,
      },
    }));

  return { winners, hands: result };
}
