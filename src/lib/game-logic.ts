// src/lib/game-logic.ts

import { Suit, Rank, Card, suitOrder, rankOrder } from '@/types/cards';

/**
 * Generates a standard 52-card deck.
 * Ranks: 2 (lowest) to Ace (highest)
 * Suits: Clubs < Hearts < Diamonds < Spades (based on suitOrder)
 * @returns {Card[]} An array representing the deck of cards.
 */
export function generateDeck(): Card[] {
  const suits = Object.values(Suit);
  const ranks = Object.values(Rank);
  const deck: Card[] = [];

  // Use rankOrder and suitOrder to generate in a somewhat predictable order initially
  // Sort ranks based on their defined order
  const sortedRanks = Object.keys(rankOrder) as Rank[];
  sortedRanks.sort((a, b) => rankOrder[a] - rankOrder[b]);

  // Sort suits based on their defined order
  const sortedSuits = Object.keys(suitOrder) as Suit[];
  sortedSuits.sort((a, b) => suitOrder[a] - suitOrder[b]);


  for (const suit of sortedSuits) {
    for (const rank of sortedRanks) {
      deck.push({ suit, rank });
    }
  }
  // console.log(`Generated deck with ${deck.length} cards.`); // Reduced logging noise
  return deck;
}

/**
 * Sorts a deck of cards based on rank and suit order (lowest first).
 * Uses the predefined rankOrder and suitOrder from types/cards.
 * @param deck The deck to sort.
 * @returns {Card[]} The sorted deck.
 */
export function sortDeck(deck: Card[]): Card[] {
  // Create a copy to avoid modifying the original array
  const deckCopy = [...deck];
  return deckCopy.sort((a, b) => {
    const rankComparison = rankOrder[a.rank] - rankOrder[b.rank];
    if (rankComparison !== 0) {
      return rankComparison; // Sort by rank first
    }
    // If ranks are the same, sort by suit
    return suitOrder[a.suit] - suitOrder[b.suit];
  });
}

/**
 * Adjusts the deck size FOR THE INITIAL DEAL ONLY to be perfectly divisible by the number of players
 * by removing the lowest ranking cards first (starting from 2 of Clubs, then 2 of Hearts, etc.).
 * This is typically only called once at the very start of the game.
 * Subsequent round adjustments handle removal differently (randomly).
 * @param deck The initial deck of cards (assumed to be 52 cards).
 * @param numPlayers The number of players in the game.
 * @returns {Card[]} The adjusted deck for the initial deal.
 */
export function adjustDeckForInitialDeal(deck: Card[], numPlayers: number): Card[] {
  if (numPlayers <= 0) {
    console.error("Number of players must be positive.");
    return []; // Or throw an error
  }
  if (numPlayers < 3 || numPlayers > 6) {
    console.warn(`Game designed for 3-6 players. Current: ${numPlayers}. Proceeding, but deck adjustment might be unusual.`);
  }

  const deckSize = deck.length;
  let cardsToRemove = 0;

  // Determine initial cards to remove based ONLY on making the deck divisible for the FIRST round
  if (numPlayers === 5 && deckSize === 52) {
      cardsToRemove = 2; // 52 -> 50 cards, 10 per player
  } else if (numPlayers === 6 && deckSize === 52) {
      cardsToRemove = 4; // 52 -> 48 cards, 8 per player
  } else {
      // For 3 or 4 players, 52 is already divisible for the first round (17 rem 1 for 3p, 13 for 4p)
      // But the rules say deal 17 for 3p (needs 51) and 13 for 4p (needs 52).
      // Let's adjust strictly based on the specified cards per player for the FIRST round.
      if (numPlayers === 3 && deckSize === 52) cardsToRemove = 1; // 52 -> 51 cards, 17 per player
      // No removal needed for 4 players (52 cards, 13 per player)
  }


  if (cardsToRemove === 0) {
    console.log(`Initial Deal: Deck size ${deckSize} suitable for ${numPlayers} players. No initial removal needed.`);
    return deck; // No adjustment needed
  }

  console.log(`Initial Deal: Adjusting deck size ${deckSize} for ${numPlayers} players. Removing ${cardsToRemove} lowest cards.`);

  // Sort the deck to easily remove the lowest cards (2C, 2H, 2D, 2S, 3C, ...)
  const sortedDeck = sortDeck([...deck]); // Work on a copy

  // Remove the lowest 'cardsToRemove' cards from the beginning of the sorted array
  const adjustedDeck = sortedDeck.slice(cardsToRemove);
  console.log(`Initial Deal: Adjusted deck size: ${adjustedDeck.length}. Removed cards:`, sortedDeck.slice(0, cardsToRemove).map(c => `${rankDisplay[c.rank]}${c.suit}`).join(', '));

  return adjustedDeck;
}

/**
 * Shuffles a deck of cards using the Fisher-Yates algorithm.
 * @param deck The deck to shuffle.
 * @returns {Card[]} The shuffled deck.
 */
export function shuffleDeck(deck: Card[]): Card[] {
  // console.log(`Shuffling deck of size ${deck.length}...`); // Reduced logging noise
  const shuffledDeck = [...deck]; // Work on a copy
  for (let i = shuffledDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]]; // Swap elements
  }
  // console.log("Deck shuffled."); // Reduced logging noise
  return shuffledDeck;
}


/**
 * Removes a specified number of cards randomly from the deck.
 * Used for adjustments between rounds.
 * @param deck The current deck.
 * @param count The number of cards to remove.
 * @returns The deck with cards removed.
 */
export function removeRandomCards(deck: Card[], count: number): Card[] {
  if (count <= 0) return deck;
  if (count >= deck.length) return []; // Remove all cards

  const deckCopy = [...deck];
  const removedCards: Card[] = [];

  console.log(`Removing ${count} random cards from deck of size ${deckCopy.length}.`);

  for (let i = 0; i < count; i++) {
    if (deckCopy.length === 0) break; // Should not happen if count < deck.length
    const randomIndex = Math.floor(Math.random() * deckCopy.length);
    removedCards.push(deckCopy.splice(randomIndex, 1)[0]);
  }

  console.log(`Removed random cards: ${removedCards.map(c => `${rankDisplay[c.rank]}${c.suit}`).join(', ')}. New deck size: ${deckCopy.length}`);
  return deckCopy;
}


// Helper to get display string for ranks (e.g., 'T' -> '10')
const rankDisplay: Record<Rank, string> = {
    [Rank.Two]: '2',
    [Rank.Three]: '3',
    [Rank.Four]: '4',
    [Rank.Five]: '5',
    [Rank.Six]: '6',
    [Rank.Seven]: '7',
    [Rank.Eight]: '8',
    [Rank.Nine]: '9',
    [Rank.Ten]: '10',
    [Rank.Jack]: 'J',
    [Rank.Queen]: 'Q',
    [Rank.King]: 'K',
    [Rank.Ace]: 'A',
};

/**
 * Removes the appropriate number of cards between rounds based on the number of players.
 * Also checks if Spades have been completely removed to potentially change the trump suit.
 * @param deck The current deck of cards
 * @param numPlayers The number of players in the game
 * @returns {Object} An object containing the adjusted deck and whether the trump suit changed
 */
export function removeCardsBetweenRounds(deck: Card[], numPlayers: number): { adjustedDeck: Card[], trumpChanged: boolean } {
    if (numPlayers < 3 || numPlayers > 6) {
        console.error("Invalid number of players. Must be between 3 and 6.");
        return { adjustedDeck: deck, trumpChanged: false };
    }

    // Determine how many cards to remove based on number of players
    const cardsToRemove = numPlayers;

    // Remove the specified number of random cards
    const adjustedDeck = removeRandomCards(deck, cardsToRemove);

    // Check if all Spades have been removed
    const hasSpades = adjustedDeck.some(card => card.suit === Suit.Spades);
    const trumpChanged = !hasSpades;

    return { adjustedDeck, trumpChanged };
}

/**
 * Calculates the score for a player based on their bid and actual tricks won.
 * @param bid The number of tricks the player bid
 * @param tricksWon The actual number of tricks won
 * @returns The score for this round
 */
export function calculateScore(bid: number, tricksWon: number): number {
    if (bid === tricksWon) {
        return 10 + tricksWon; // 10 points for exact match + 1 point per trick
    }
    return 0; // No points if bid doesn't match tricks won
}

/**
 * Validates if a bid is allowed for the last player based on the last player rule.
 * @param bid The bid to validate
 * @param currentTotalBids The sum of all other players' bids
 * @param totalCards The total number of cards in the round
 * @param cardsPerPlayer The number of cards each player has
 * @returns {boolean} True if the bid is valid, false otherwise
 */
export function isValidLastPlayerBid(bid: number, currentTotalBids: number, totalCards: number, cardsPerPlayer: number): boolean {
    // Last player rule only applies when there are more than 5 cards per player
    if (cardsPerPlayer <= 5) {
        return true;
    }

    // Check if this bid would make the total equal to the number of cards
    const potentialTotal = currentTotalBids + bid;
    return potentialTotal !== totalCards;
}
