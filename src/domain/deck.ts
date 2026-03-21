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

type CardLike = {
  rank?: string;
  suit: string;
  value?: number;
};

const VALUE_TO_RANK: { [key: number]: string } = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

function cardToString(card: CardLike | Card | string): string {
  // If already a string, return as-is
  if (typeof card === "string") {
    return card;
  }
  // If it's not an object, return unknown
  if (!card || typeof card !== "object") {
    return "??";
  }
  // Get rank - either from rank property or derived from value
  let rank = card.rank;
  if (!rank && card.value !== undefined) {
    rank = VALUE_TO_RANK[card.value];
  }
  // Validate we have both rank and suit
  if (typeof rank !== "string" || typeof card.suit !== "string") {
    return "??";
  }
  return `${rank}${card.suit}`;
}

/**
 * Parse a card string like "A♥" or "10♠" back into a Card object.
 * Also handles object format {rank, suit} for backwards compatibility.
 */
function parseCard(input: string | { rank?: string; suit?: string }): Card {
  // Handle object format
  if (typeof input === "object" && input !== null) {
    const rank = input.rank || "?";
    const suit = input.suit || "?";
    return { rank, suit, value: RANK_VALUES[rank] || 0 };
  }

  // Handle string format
  if (typeof input !== "string" || input.length < 2) {
    return { rank: "?", suit: "?", value: 0 };
  }

  // Extract suit (last character - Unicode suit symbol)
  const chars = [...input]; // Handle Unicode correctly
  const suit = chars.pop() || "?";
  const rank = chars.join("");

  return {
    rank,
    suit,
    value: RANK_VALUES[rank] || 0,
  };
}

export {
  createDeck,
  shuffle,
  shuffleWithOrder,
  cardToString,
  parseCard,
  RANK_VALUES,
  Card,
};
