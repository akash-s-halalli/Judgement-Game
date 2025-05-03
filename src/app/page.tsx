'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Card, PlayerHand as PlayerHandType } from '@/types/card';
import { createDeck, dealCards, shuffleDeck } from '@/lib/deck';
import { PlayerHandComponent } from '@/components/player-hand';
import { PlayingArea } from '@/components/playing-area';
import { DeckComponent } from '@/components/deck-component';
import { CardComponent } from '@/components/card-component'; // Import CardComponent
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card as UICard, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const NUM_PLAYERS = 2; // Example: 2 players
const CARDS_PER_HAND = 7; // Example: 7 cards per hand
const CURRENT_USER_PLAYER_ID = 1; // Assume the user is Player 1 for now

export default function GamePage() {
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerHands, setPlayerHands] = useState<PlayerHandType[]>([]);
  const [playedCards, setPlayedCards] = useState<{ [playerId: number]: Card | null }>({}); // Cards currently in the playing area for the trick/round
  const [currentTurnPlayerId, setCurrentTurnPlayerId] = useState<number>(1);
  const [gameMessage, setGameMessage] = useState<string>('Game started. Player 1\'s turn.');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // --- Game Initialization ---
  const initializeGame = useCallback(() => {
    const newDeck = createDeck();
    const { dealtHands, remainingDeck } = dealCards(newDeck, NUM_PLAYERS, CARDS_PER_HAND);
    setDeck(remainingDeck);
    setPlayerHands(dealtHands);
    setPlayedCards(Object.fromEntries(Array.from({length: NUM_PLAYERS}, (_, i) => [i + 1, null]))); // Initialize played cards placeholder
    setCurrentTurnPlayerId(1); // Player 1 starts
    setGameMessage('Game started. Player 1\'s turn.');
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  // --- Core Game Logic ---

  const isPlayerTurn = (playerId: number): boolean => {
    return playerId === currentTurnPlayerId;
  };

  const playCard = (playerId: number, card: Card) => {
    if (!isPlayerTurn(playerId)) {
      setGameMessage("It's not your turn!");
      return;
    }

    // Find the player's hand
    const handIndex = playerHands.findIndex(hand => hand.playerId === playerId);
    if (handIndex === -1) return; // Should not happen

    const currentHand = playerHands[handIndex];

    // Check if the card is in the player's hand
    const cardIndex = currentHand.cards.findIndex(c => c.id === card.id);
    if (cardIndex === -1) {
      setGameMessage("Invalid card."); // Should not happen with drag/drop if implemented correctly
      return;
    }

    // Remove card from hand
    const updatedHandCards = currentHand.cards.filter(c => c.id !== card.id);
    const updatedHands = [...playerHands];
    updatedHands[handIndex] = { ...currentHand, cards: updatedHandCards };
    setPlayerHands(updatedHands);

    // Add card to played area
    setPlayedCards(prev => ({ ...prev, [playerId]: card }));

    // Advance turn
    const nextPlayerId = (currentTurnPlayerId % NUM_PLAYERS) + 1;
    setCurrentTurnPlayerId(nextPlayerId);
    setGameMessage(`Player ${playerId} played ${card.rank} of ${card.suit}. Player ${nextPlayerId}'s turn.`);

    // Basic check: If all players have played a card, clear the playing area (example logic)
    if (Object.values(playedCards).filter(c => c !== null).length === NUM_PLAYERS -1) { // Check if N-1 players already played
      setTimeout(() => {
         // Add logic here to determine winner of the trick, score, etc.
         setGameMessage(`Round finished! Player ${nextPlayerId}'s turn.`);
         // Reset played cards for the next round/trick
         setPlayedCards(Object.fromEntries(Array.from({length: NUM_PLAYERS}, (_, i) => [i + 1, null])));
      }, 1500); // Delay to show cards
    }
  };

 const drawCard = (playerId: number) => {
    if (!isPlayerTurn(playerId)) {
      setGameMessage("It's not your turn to draw!");
      return;
    }
    if (deck.length === 0) {
      setGameMessage("Deck is empty!");
      return;
    }

    // Find the player's hand
    const handIndex = playerHands.findIndex(hand => hand.playerId === playerId);
    if (handIndex === -1) return;

    // Draw card
    const drawnCard = deck[0];
    const remainingDeck = deck.slice(1);
    setDeck(remainingDeck);

    // Add card to hand
    const updatedHandCards = [...playerHands[handIndex].cards, drawnCard];
    const updatedHands = [...playerHands];
    updatedHands[handIndex] = { ...playerHands[handIndex], cards: updatedHandCards };
    setPlayerHands(updatedHands);

    // Advance turn after drawing
    const nextPlayerId = (currentTurnPlayerId % NUM_PLAYERS) + 1;
    setCurrentTurnPlayerId(nextPlayerId);
    setGameMessage(`Player ${playerId} drew a card. Player ${nextPlayerId}'s turn.`);
  };


  // --- Drag and Drop Handlers ---

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = "move";
    setIsDragging(true);
  };

 const handleDropOnPlayingArea = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const cardId = e.dataTransfer.getData('text/plain');
    const cardDataString = e.dataTransfer.getData('application/json');

    if (!cardDataString) return; // No card data being dragged

    try {
      const card: Card = JSON.parse(cardDataString);
      // Assume the drop comes from the current user
      if (isPlayerTurn(CURRENT_USER_PLAYER_ID)) {
        playCard(CURRENT_USER_PLAYER_ID, card);
      } else {
        setGameMessage("It's not your turn!");
      }
    } catch (error) {
      console.error("Failed to parse card data on drop:", error);
      setGameMessage("Error playing card.");
    }
  };

   const handleDragEnd = () => {
     setIsDragging(false);
   };


  // --- Render Logic ---

  const currentPlayerHand = playerHands.find(hand => hand.playerId === CURRENT_USER_PLAYER_ID);
  const opponentHands = playerHands.filter(hand => hand.playerId !== CURRENT_USER_PLAYER_ID);

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-screen bg-background p-4 md:p-8 font-sans">
        <header className="mb-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-primary">Distance Duel</h1>
          <Button onClick={initializeGame} variant="outline">New Game</Button>
        </header>

        {/* Opponent Area */}
        <div className="mb-6">
           <h2 className="text-lg font-semibold text-secondary mb-2">Opponent(s)</h2>
          {opponentHands.map(hand => (
            <div key={hand.playerId} className="mb-4 p-4 border border-muted rounded-lg bg-card/80">
               <div className="flex items-center justify-between mb-2">
                 <span className={isPlayerTurn(hand.playerId) ? 'text-primary font-bold' : 'text-muted-foreground'}>
                   Player {hand.playerId}
                  {isPlayerTurn(hand.playerId) && <Badge variant="secondary" className="ml-2">Turn</Badge>}
                 </span>
                 <span className="text-sm text-muted-foreground">{hand.cards.length} Cards</span>
               </div>
              {/* Display opponent cards face down */}
              <div className="flex items-center space-x-[-50px] justify-center min-h-[100px]">
                {hand.cards.map((_, index) => (
                  <CardComponent key={`opponent-${hand.playerId}-${index}`} card={null} isFaceDown={true} />
                ))}
                 {hand.cards.length === 0 && <div className="text-muted-foreground italic">Empty Hand</div>}
              </div>
            </div>
          ))}
        </div>


        {/* Playing Area & Deck */}
        <div className="flex flex-col md:flex-row items-center md:items-start justify-around my-4 gap-8">
          <DeckComponent
             remainingCards={deck.length}
             onDrawCard={() => drawCard(CURRENT_USER_PLAYER_ID)}
             isTurn={isPlayerTurn(CURRENT_USER_PLAYER_ID)}
           />
          <PlayingArea
            playedCards={playedCards}
            onDrop={handleDropOnPlayingArea}
            onDragOver={handleDragOver}
            numberOfPlayers={NUM_PLAYERS}
            currentPlayerId={CURRENT_USER_PLAYER_ID}
            currentTurnPlayerId={currentTurnPlayerId}
          />
          {/* Placeholder for discard pile or other elements */}
          <div className="w-24"></div>
        </div>


        {/* Current Player Hand */}
        <div className="mt-auto">
          <h2 className="text-lg font-semibold text-primary mb-2">Your Hand (Player {CURRENT_USER_PLAYER_ID})</h2>
          {currentPlayerHand && (
            <PlayerHandComponent
              playerId={CURRENT_USER_PLAYER_ID}
              cards={currentPlayerHand.cards}
              isCurrentPlayer={true}
              isTurn={isPlayerTurn(CURRENT_USER_PLAYER_ID)}
              onCardPlay={(card) => playCard(CURRENT_USER_PLAYER_ID, card)} // This might be triggered differently now (via drop)
              onDragOver={handleDragOver} // Allow dragging over hand (e.g., reordering - not implemented)
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); /* Handle drop on hand if needed */}} // Prevent default drop on hand for now
            />
          )}
        </div>


        {/* Game Status Footer */}
        <footer className="mt-6 p-4 bg-card rounded-lg shadow-inner">
          <UICard>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-secondary">
                <Info size={20} /> Game Status
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              {isPlayerTurn(CURRENT_USER_PLAYER_ID) ? (
                 <span className="text-primary font-bold animate-pulse">Your Turn!</span>
               ) : (
                 <span className="text-muted-foreground">Waiting for Player {currentTurnPlayerId}...</span>
               )}
               <span className="text-sm text-muted-foreground ml-auto">| {gameMessage}</span>

               <Tooltip>
                  <TooltipTrigger asChild>
                      <AlertCircle size={16} className="text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Drag cards from your hand to the center area to play.</p>
                     <p>Current Turn: Player {currentTurnPlayerId}</p>
                  </TooltipContent>
                </Tooltip>

            </CardContent>
          </UICard>
        </footer>
        {isDragging && (
           <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 pointer-events-none flex items-center justify-center text-white text-2xl font-bold">
             Dragging...
           </div>
        )}
      </div>
    </TooltipProvider>
  );
}
