
// src/types/cards.ts

/**
 * Represents the four standard playing card suits.
 * Order for sorting/comparison (lowest to highest): Clubs < Hearts < Diamonds < Spades
 */
export enum Suit {
  Clubs = 'C',
  Hearts = 'H',
  Diamonds = 'D',
  Spades = 'S',
}

/**
 * Represents the standard playing card ranks.
 * Order for sorting/comparison (lowest to highest): 2 < 3 < ... < King < Ace
 */
export enum Rank {
  Two = '2',
  Three = '3',
  Four = '4',
  Five = '5',
  Six = '6',
  Seven = '7',
  Eight = '8',
  Nine = '9',
  Ten = 'T', // T for Ten
  Jack = 'J',
  Queen = 'Q',
  King = 'K',
  Ace = 'A',
}

/**
 * Interface representing a single playing card.
 */
export interface Card {
  suit: Suit;
  rank: Rank;
}

/**
 * Maps suits to their numerical order for sorting (lower number = lower suit).
 */
export const suitOrder: Record<Suit, number> = {
  [Suit.Clubs]: 1,
  [Suit.Hearts]: 2,
  [Suit.Diamonds]: 3,
  [Suit.Spades]: 4,
};

/**
 * Maps ranks to their numerical value for sorting/comparison (lower number = lower rank).
 */
export const rankOrder: Record<Rank, number> = {
  [Rank.Two]: 2,
  [Rank.Three]: 3,
  [Rank.Four]: 4,
  [Rank.Five]: 5,
  [Rank.Six]: 6,
  [Rank.Seven]: 7,
  [Rank.Eight]: 8,
  [Rank.Nine]: 9,
  [Rank.Ten]: 10,
  [Rank.Jack]: 11,
  [Rank.Queen]: 12,
  [Rank.King]: 13,
  [Rank.Ace]: 14, // Ace is high
};

/**
 * Represents the different phases of the game.
 * dealing: Initial phase where cards are ready to be dealt by the starting player.
 */
export type GamePhase = 'dealing' | 'bidding' | 'playing' | 'scoring' | 'gameOver';


/**
 * Represents player hands stored in Firestore, mapping player ID to an array of cards.
 * Hands might be null or undefined during initialization or between rounds.
 */
export type PlayerHands = {
    [playerId: string]: Card[] | undefined | null;
};

// Note: PlayerHand interface was removed as PlayerHands map is more suitable for Firestore structure.
// If needed locally for specific components, it can be redefined.
// export interface PlayerHand {
//   playerId: string;
//   cards: Card[];
// }

