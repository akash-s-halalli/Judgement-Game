export type Suit = 'Hearts' | 'Diamonds' | 'Clubs' | 'Spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  id: string; // Unique identifier for drag-and-drop
  suit: Suit;
  rank: Rank;
}

export interface PlayerHand {
  playerId: number;
  cards: Card[];
}
