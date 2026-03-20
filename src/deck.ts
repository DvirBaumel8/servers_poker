const SUITS: string[] = ["♠", "♥", "♦", "♣"];
const RANKS: string[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

interface RankValues {
  [key: string]: number;
}

const RANK_VALUES: RankValues = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

interface Card {
  rank: string;
  suit: string;
  value: number;
}

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ rank, suit, value: RANK_VALUES[rank] });
  return deck;
}

/**
 * Standard shuffle using Math.random() - not provably fair
 */
function shuffle(deck: Card[]): Card[] {
  const d: Card[] = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/**
 * Provably fair shuffle using pre-computed deck order
 * @param deck - Original deck in standard order
 * @param deckOrder - Array of indices defining the shuffle order
 * @returns Shuffled deck
 */
function shuffleWithOrder(deck: Card[], deckOrder: number[]): Card[] {
  if (deckOrder.length !== deck.length) {
    throw new Error(
      `Deck order length (${deckOrder.length}) must match deck length (${deck.length})`,
    );
  }
  const shuffled: Card[] = new Array(deck.length);
  for (let i = 0; i < deck.length; i++) {
    shuffled[i] = deck[deckOrder[i]];
  }
  return shuffled;
}

function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export {
  createDeck,
  shuffle,
  shuffleWithOrder,
  cardToString,
  RANK_VALUES,
  Card,
};
