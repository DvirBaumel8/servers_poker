export interface Card {
  rank: string;
  suit: string;
}

export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
