import type { Suit, Rank, Card, PlayerHand } from '@/types/card';

const suits: Suit[] = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function createDeck(): Card[] {
  return suits.flatMap((suit) =>
    ranks.map((rank, index) => ({
      id: `${suit}-${rank}-${index}`, // Ensure unique ID
      suit,
      rank,
    }))
  );
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffledDeck = [...deck];
  for (let i = shuffledDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]];
  }
  return shuffledDeck;
}

export function dealCards(deck: Card[], numPlayers: number, cardsPerPlayer: number): { dealtHands: PlayerHand[], remainingDeck: Card[] } {
  const shuffled = shuffleDeck(deck);
  const dealtHands: PlayerHand[] = Array.from({ length: numPlayers }, (_, i) => ({
    playerId: i + 1,
    cards: [],
  }));
  let currentDeck = [...shuffled];

  for (let i = 0; i < cardsPerPlayer; i++) {
    for (let j = 0; j < numPlayers; j++) {
      if (currentDeck.length > 0) {
        dealtHands[j].cards.push(currentDeck.pop()!);
      }
    }
  }

  return { dealtHands, remainingDeck: currentDeck };
}
