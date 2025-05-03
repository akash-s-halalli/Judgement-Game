// src/app/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Card, PlayerHand as PlayerHandType } from '@/types/card';
import { createDeck, dealCards } from '@/lib/deck';
import { PlayerHandComponent } from '@/components/player-hand';
import { PlayingArea } from '@/components/playing-area';
import { DeckComponent } from '@/components/deck-component';
import { CardComponent } from '@/components/card-component';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card as UICard, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Info, Swords, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type GameStage = 'enterName' | 'lobby' | 'game';

const NUM_PLAYERS = 2; // Example: 2 players
const CARDS_PER_HAND = 7; // Example: 7 cards per hand
const CURRENT_USER_PLAYER_ID = 1; // Assume the user is Player 1 for now

export default function GamePage() {
  const [gameStage, setGameStage] = useState<GameStage>('enterName');
  const [playerName, setPlayerName] = useState<string>('');
  const [roomCode, setRoomCode] = useState<string>('');
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerHands, setPlayerHands] = useState<PlayerHandType[]>([]);
  const [playedCards, setPlayedCards] = useState<{ [playerId: number]: Card | null }>({});
  const [currentTurnPlayerId, setCurrentTurnPlayerId] = useState<number>(1);
  const [gameMessage, setGameMessage] = useState<string>('Enter your name to start.');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isJoinGameDialogOpen, setIsJoinGameDialogOpen] = useState<boolean>(false);


  // --- Name Handling ---
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim()) {
      setGameStage('lobby');
      setGameMessage(`Welcome, ${playerName}! Choose an option.`);
    } else {
      setGameMessage('Please enter a valid name.');
    }
  };

  // --- Lobby Actions ---
  const handleCreateGame = () => {
    // Placeholder for lobby/game creation logic
    console.log(`${playerName} is creating a game...`);
    // For now, directly start the game
    initializeGame();
    setGameStage('game');
  };

  const handleJoinGameSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (roomCode.trim()) {
          // Placeholder for joining game logic
          console.log(`${playerName} is joining game with code: ${roomCode}`);
          setIsJoinGameDialogOpen(false); // Close dialog
          // For now, simulate joining by starting a game
          initializeGame();
          setGameStage('game');
          setGameMessage(`Joined game with code ${roomCode}. Player 1's turn.`);
      } else {
          // Handle empty room code if needed
          console.error("Room code cannot be empty");
      }
  };

  // --- Game Initialization ---
  const initializeGame = useCallback(() => {
    const newDeck = createDeck();
    const { dealtHands, remainingDeck } = dealCards(newDeck, NUM_PLAYERS, CARDS_PER_HAND);
    setDeck(remainingDeck);
    setPlayerHands(dealtHands);
    setPlayedCards(Object.fromEntries(Array.from({length: NUM_PLAYERS}, (_, i) => [i + 1, null])));
    setCurrentTurnPlayerId(1);
    setGameMessage('Game started. Player 1\'s turn.');
  }, []);

  // --- Core Game Logic (Existing) ---

  const isPlayerTurn = (playerId: number): boolean => {
    return playerId === currentTurnPlayerId;
  };

  const playCard = (playerId: number, card: Card) => {
    if (!isPlayerTurn(playerId)) {
      setGameMessage("It's not your turn!");
      return;
    }

    const handIndex = playerHands.findIndex(hand => hand.playerId === playerId);
    if (handIndex === -1) return;

    const currentHand = playerHands[handIndex];
    const cardIndex = currentHand.cards.findIndex(c => c.id === card.id);
    if (cardIndex === -1) {
      setGameMessage("Invalid card.");
      return;
    }

    const updatedHandCards = currentHand.cards.filter(c => c.id !== card.id);
    const updatedHands = [...playerHands];
    updatedHands[handIndex] = { ...currentHand, cards: updatedHandCards };
    setPlayerHands(updatedHands);

    setPlayedCards(prev => ({ ...prev, [playerId]: card }));

    const nextPlayerId = (currentTurnPlayerId % NUM_PLAYERS) + 1;
    setCurrentTurnPlayerId(nextPlayerId);
    setGameMessage(`Player ${playerId} played ${card.rank} of ${card.suit}. Player ${nextPlayerId}'s turn.`);

    if (Object.values(playedCards).filter(c => c !== null).length === NUM_PLAYERS -1) {
      setTimeout(() => {
         setGameMessage(`Round finished! Player ${nextPlayerId}'s turn.`);
         setPlayedCards(Object.fromEntries(Array.from({length: NUM_PLAYERS}, (_, i) => [i + 1, null])));
      }, 1500);
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

    const handIndex = playerHands.findIndex(hand => hand.playerId === playerId);
    if (handIndex === -1) return;

    const drawnCard = deck[0];
    const remainingDeck = deck.slice(1);
    setDeck(remainingDeck);

    const updatedHandCards = [...playerHands[handIndex].cards, drawnCard];
    const updatedHands = [...playerHands];
    updatedHands[handIndex] = { ...playerHands[handIndex], cards: updatedHandCards };
    setPlayerHands(updatedHands);

    const nextPlayerId = (currentTurnPlayerId % NUM_PLAYERS) + 1;
    setCurrentTurnPlayerId(nextPlayerId);
    setGameMessage(`Player ${playerId} drew a card. Player ${nextPlayerId}'s turn.`);
  };


  // --- Drag and Drop Handlers (Existing) ---

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragging(true);
  };

 const handleDropOnPlayingArea = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const cardId = e.dataTransfer.getData('text/plain');
    const cardDataString = e.dataTransfer.getData('application/json');

    if (!cardDataString) return;

    try {
      const card: Card = JSON.parse(cardDataString);
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

  const renderEnterName = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
      <UICard className="w-full max-w-md shadow-2xl">
        <CardHeader>
          <CardTitle className="text-4xl font-bold text-primary text-center">Judgement</CardTitle>
          <CardContent className="text-center text-muted-foreground pt-2">The virtual card game</CardContent>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleNameSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="playerName" className="text-lg text-foreground">Enter Your Name:</Label>
              <Input
                id="playerName"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Player Name"
                className="text-lg"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full text-lg py-3" size="lg">
              Continue
            </Button>
             {gameMessage && <p className="text-sm text-center text-destructive pt-2">{gameMessage.includes('valid name') ? gameMessage : ''}</p>}
          </form>
        </CardContent>
      </UICard>
    </div>
  );

 const renderLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
      <UICard className="w-full max-w-md shadow-2xl">
        <CardHeader>
           <CardTitle className="text-3xl font-bold text-primary text-center">Welcome, {playerName}!</CardTitle>
           <CardContent className="text-center text-muted-foreground pt-2">{gameMessage}</CardContent>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
           <Button onClick={handleCreateGame} className="w-full text-lg py-3" size="lg" variant="secondary">
            <Swords className="mr-2" /> Create Game
           </Button>

           <Dialog open={isJoinGameDialogOpen} onOpenChange={setIsJoinGameDialogOpen}>
             <DialogTrigger asChild>
               <Button className="w-full text-lg py-3" size="lg" variant="outline">
                 <UserPlus className="mr-2" /> Join Game
               </Button>
             </DialogTrigger>
             <DialogContent className="sm:max-w-[425px]">
               <DialogHeader>
                 <DialogTitle>Join Game</DialogTitle>
                 <DialogDescription>
                   Enter the room code provided by your friend to join their game.
                 </DialogDescription>
               </DialogHeader>
               <form onSubmit={handleJoinGameSubmit} className="grid gap-4 py-4">
                 <div className="grid grid-cols-4 items-center gap-4">
                   <Label htmlFor="roomCode" className="text-right">
                     Room Code
                   </Label>
                   <Input
                     id="roomCode"
                     value={roomCode}
                     onChange={(e) => setRoomCode(e.target.value)}
                     className="col-span-3"
                     placeholder="Enter code..."
                     required
                   />
                 </div>
                 <DialogFooter>
                     <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                     </DialogClose>
                   <Button type="submit">Join Game</Button>
                 </DialogFooter>
               </form>
             </DialogContent>
           </Dialog>

        </CardContent>
      </UICard>
    </div>
  );

  const renderGame = () => {
      const currentPlayerHand = playerHands.find(hand => hand.playerId === CURRENT_USER_PLAYER_ID);
      const opponentHands = playerHands.filter(hand => hand.playerId !== CURRENT_USER_PLAYER_ID);

      return (
        <TooltipProvider>
          <div className="flex flex-col min-h-screen bg-background p-4 md:p-8 font-sans">
            <header className="mb-4 flex justify-between items-center">
              <h1 className="text-3xl font-bold text-primary">Judgement</h1>
              {/* Maybe show player name here? */}
              <Button onClick={() => setGameStage('lobby')} variant="outline">Back to Lobby</Button> {/* Simplified reset */}
            </header>

            {/* Opponent Area */}
            <div className="mb-6">
               <h2 className="text-lg font-semibold text-secondary mb-2">Opponent(s)</h2>
              {opponentHands.map(hand => (
                <div key={hand.playerId} className="mb-4 p-4 border border-muted rounded-lg bg-card/80">
                   <div className="flex items-center justify-between mb-2">
                     <span className={isPlayerTurn(hand.playerId) ? 'text-primary font-bold' : 'text-muted-foreground'}>
                       Player {hand.playerId} {/* Consider showing opponent names if available */}
                      {isPlayerTurn(hand.playerId) && <Badge variant="secondary" className="ml-2">Turn</Badge>}
                     </span>
                     <span className="text-sm text-muted-foreground">{hand.cards.length} Cards</span>
                   </div>
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
              <div className="w-24"></div> {/* Placeholder */}
            </div>


            {/* Current Player Hand */}
            <div className="mt-auto">
              <h2 className="text-lg font-semibold text-primary mb-2">{playerName || `Player ${CURRENT_USER_PLAYER_ID}`}'s Hand</h2>
              {currentPlayerHand && (
                <PlayerHandComponent
                  playerId={CURRENT_USER_PLAYER_ID}
                  cards={currentPlayerHand.cards}
                  isCurrentPlayer={true}
                  isTurn={isPlayerTurn(CURRENT_USER_PLAYER_ID)}
                  onCardPlay={(card) => playCard(CURRENT_USER_PLAYER_ID, card)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onDragEnd={handleDragEnd} // Pass drag end handler
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


  // Switch rendering based on game stage
  switch (gameStage) {
    case 'enterName':
      return renderEnterName();
    case 'lobby':
      return renderLobby();
    case 'game':
      return renderGame();
    default:
      return renderEnterName(); // Default to name entry
  }
}
