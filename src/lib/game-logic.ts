// src/lib/game-logic.ts

import { Suit, Rank, Card, suitOrder, rankOrder } from '@/types/cards';

/**
 * Generates a standard 52-card deck.
 * @returns {Card[]} An array representing the deck of cards.
 */
export function generateDeck(): Card[] {
  const suits = Object.values(Suit);
  const ranks = Object.values(Rank);
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/**
 * Sorts a deck of cards based on rank and suit order (lowest first).
 * @param deck The deck to sort.
 * @returns {Card[]} The sorted deck.
 */
export function sortDeck(deck: Card[]): Card[] {
  return deck.sort((a, b) => {
    const rankComparison = rankOrder[a.rank] - rankOrder[b.rank];
    if (rankComparison !== 0) {
      return rankComparison;
    }
    return suitOrder[a.suit] - suitOrder[b.suit];
  });
}

/**
 * Adjusts the deck size to be perfectly divisible by the number of players
 * by removing the lowest ranking cards first.
 * @param deck The initial deck of cards.
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
    return deck; // No adjustment needed
  }

  const cardsToRemove = remainder;
  console.log(`Deck size ${deckSize} not divisible by ${numPlayers} players. Removing ${cardsToRemove} lowest cards.`);

  // Sort the deck to easily remove the lowest cards
  const sortedDeck = sortDeck([...deck]); // Work on a copy

  // Remove the lowest cards
  const adjustedDeck = sortedDeck.slice(cardsToRemove);
  console.log(`Adjusted deck size: ${adjustedDeck.length}`);

  return adjustedDeck;
}

/**
 * Shuffles a deck of cards using the Fisher-Yates algorithm.
 * @param deck The deck to shuffle.
 * @returns {Card[]} The shuffled deck.
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffledDeck = [...deck]; // Work on a copy
  for (let i = shuffledDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]]; // Swap elements
  }
  return shuffledDeck;
}

// Add more game logic functions here as needed (e.g., dealing cards)
