
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
  console.log(`Generated deck with ${deck.length} cards.`);
  return deck;
}

/**
 * Sorts a deck of cards based on rank and suit order (lowest first).
 * Uses the predefined rankOrder and suitOrder from types/cards.
 * @param deck The deck to sort.
 * @returns {Card[]} The sorted deck.
 */
export function sortDeck(deck: Card[]): Card[] {
  return deck.sort((a, b) => {
    const rankComparison = rankOrder[a.rank] - rankOrder[b.rank];
    if (rankComparison !== 0) {
      return rankComparison; // Sort by rank first
    }
    // If ranks are the same, sort by suit
    return suitOrder[a.suit] - suitOrder[b.suit];
  });
}

/**
 * Adjusts the deck size to be perfectly divisible by the number of players
 * by removing the lowest ranking cards first (starting from 2 of Clubs, then 2 of Hearts, etc.).
 * @param deck The initial deck of cards (assumed to be 52 cards).
 * @param numPlayers The number of players in the game.
 * @returns {Card[]} The adjusted deck.
 */
export function adjustDeckForPlayers(deck: Card[], numPlayers: number): Card[] {
  if (numPlayers <= 0) {
    console.error("Number of players must be positive.");
    return []; // Or throw an error
  }

  const deckSize = deck.length;
  const remainder = deckSize % numPlayers;

  if (remainder === 0) {
    console.log(`Deck size ${deckSize} is divisible by ${numPlayers} players. No adjustment needed.`);
    return deck; // No adjustment needed
  }

  const cardsToRemove = remainder;
  console.log(`Deck size ${deckSize} not divisible by ${numPlayers} players. Removing ${cardsToRemove} lowest cards.`);

  // Sort the deck to easily remove the lowest cards (2C, 2H, 2D, 2S, 3C, ...)
  const sortedDeck = sortDeck([...deck]); // Work on a copy

  // Remove the lowest 'cardsToRemove' cards from the beginning of the sorted array
  const adjustedDeck = sortedDeck.slice(cardsToRemove);
  console.log(`Adjusted deck size: ${adjustedDeck.length}. Removed cards:`, sortedDeck.slice(0, cardsToRemove).map(c => `${c.rank}${c.suit}`).join(', '));

  return adjustedDeck;
}

/**
 * Shuffles a deck of cards using the Fisher-Yates algorithm.
 * @param deck The deck to shuffle.
 * @returns {Card[]} The shuffled deck.
 */
export function shuffleDeck(deck: Card[]): Card[] {
  console.log(`Shuffling deck of size ${deck.length}...`);
  const shuffledDeck = [...deck]; // Work on a copy
  for (let i = shuffledDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]]; // Swap elements
  }
  console.log("Deck shuffled.");
  return shuffledDeck;
}

// Add more game logic functions here as needed (e.g., dealing cards - Note: dealing logic moved to page.tsx)

