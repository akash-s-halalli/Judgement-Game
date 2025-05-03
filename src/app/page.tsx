// src/app/page.tsx
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card as UICard, CardContent, CardHeader, CardTitle, CardDescription as UICardDescription } from '@/components/ui/card';
import { Swords, UserPlus, LogOut, Copy, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase'; // Import Firestore instance
import { collection, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, Timestamp, deleteDoc, where, query, getDocs } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

// Game stages: 'enterName' -> 'lobby' -> 'gameLobby' -> 'game' (future)
type GameStage = 'enterName' | 'lobby' | 'gameLobby' | 'game';

interface RoomData {
  hostName: string;
  players: string[];
  createdAt: Timestamp;
  // Add game state properties later
}

// Simple room code generation utility (excluding 'O' and '0', 'I', 'L')
const generateRoomCode = (length = 4): string => {
  const characters = 'ABCDEFGHJKMNPQRSTUVWXYZ123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// Function to check if a room code exists in Firestore
const doesRoomExist = async (code: string): Promise<boolean> => {
    const roomRef = doc(db, 'rooms', code);
    const docSnap = await getDoc(roomRef);
    return docSnap.exists();
};


export default function GamePage() {
  const [gameStage, setGameStage] = useState<GameStage>('enterName');
  const [playerName, setPlayerName] = useState<string>('');
  const [joinRoomCode, setJoinRoomCode] = useState<string>('');
  const [currentRoomCode, setCurrentRoomCode] = useState<string | null>(null); // Room the player is currently in
  const [roomData, setRoomData] = useState<RoomData | null>(null); // Holds real-time data from Firestore
  const [gameMessage, setGameMessage] = useState<string>('Enter your name to start.');
  const [isJoinGameDialogOpen, setIsJoinGameDialogOpen] = useState<boolean>(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { toast } = useToast();
  const unsubscribeRef = useRef<Unsubscribe | null>(null); // Ref to store the Firestore listener unsubscribe function


  // --- Firestore Listener Effect ---
  useEffect(() => {
    // If we are in the game lobby and have a room code, listen for changes
    if (gameStage === 'gameLobby' && currentRoomCode) {
      setIsLoading(true); // Start loading while fetching initial data
      const roomRef = doc(db, 'rooms', currentRoomCode);

      // Store the unsubscribe function returned by onSnapshot
      unsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as RoomData;
          setRoomData(data);
          // Update game message based on who is host
           if (data.hostName === playerName) {
             setGameMessage(`Share code ${currentRoomCode} to invite players! Waiting for players...`);
           } else {
             setGameMessage(`Joined lobby ${currentRoomCode}. Waiting for host "${data.hostName}" to start...`);
           }
        } else {
          // Room deleted or doesn't exist anymore
          toast({
            title: "Lobby Closed",
            description: `Lobby ${currentRoomCode} is no longer available.`,
            variant: "destructive",
          });
          setGameStage('lobby'); // Go back to lobby selection
          setCurrentRoomCode(null);
          setRoomData(null);
        }
         setIsLoading(false); // Stop loading after data is fetched/updated
      }, (error) => {
        console.error("Error listening to room changes:", error);
        toast({
          title: "Connection Error",
          description: "Could not sync lobby data. Please try again.",
          variant: "destructive",
        });
        setIsLoading(false);
        // Optionally handle going back to lobby
        setGameStage('lobby');
        setCurrentRoomCode(null);
        setRoomData(null);
      });

      // Cleanup function: Unsubscribe when component unmounts or roomCode/gameStage changes
      return () => {
        if (unsubscribeRef.current) {
          console.log("Unsubscribing from Firestore listener for room:", currentRoomCode);
          unsubscribeRef.current();
          unsubscribeRef.current = null; // Clear the ref
        }
      };
    } else {
       // Ensure cleanup if we leave the gameLobby stage without the effect running its cleanup
       if (unsubscribeRef.current) {
          console.log("Cleaning up listener outside effect for room:", currentRoomCode);
          unsubscribeRef.current();
          unsubscribeRef.current = null;
       }
       setRoomData(null); // Clear room data if not in game lobby
    }
  }, [gameStage, currentRoomCode, toast, playerName]); // Add playerName dependency


  // --- Name Handling ---
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = playerName.trim();
    if (trimmedName) {
      setPlayerName(trimmedName); // Store the trimmed name
      setGameStage('lobby');
      setGameMessage(`Welcome, ${trimmedName}! Create a game or join one.`);
    } else {
      toast({
        title: "Invalid Name",
        description: "Please enter a valid name.",
        variant: "destructive",
      });
      setGameMessage('Please enter a valid name.');
    }
  };

  // --- Lobby Actions ---
  const handleCreateGame = async () => {
      setIsLoading(true);
      setGameMessage("Creating game lobby...");

      let newRoomCode = '';
      let exists = true;
      let attempts = 0;
      const maxAttempts = 10; // Prevent infinite loop

      // Generate a unique room code
      while (exists && attempts < maxAttempts) {
          newRoomCode = generateRoomCode();
          exists = await doesRoomExist(newRoomCode);
          attempts++;
      }

      if (attempts >= maxAttempts) {
          console.error("Failed to generate a unique room code after multiple attempts.");
          toast({
              title: "Creation Failed",
              description: "Could not create a unique lobby. Please try again.",
              variant: "destructive",
          });
          setIsLoading(false);
          setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
          return;
      }

      const roomRef = doc(db, 'rooms', newRoomCode);
      const initialRoomData: RoomData = {
          hostName: playerName,
          players: [playerName],
          createdAt: Timestamp.now(),
      };

      try {
          await setDoc(roomRef, initialRoomData);
          console.log(`${playerName} created game ${newRoomCode}.`);
          setCurrentRoomCode(newRoomCode); // Set the current room code
          // setRoomData(initialRoomData); // Set initial data locally (will be overwritten by listener)
          setGameStage('gameLobby');
          // Message will be set by the listener effect
          setHasCopied(false); // Reset copy status
          toast({
              title: "Lobby Created!",
              description: `Room code: ${newRoomCode}`,
          });
      } catch (error) {
          console.error("Error creating game room:", error);
          toast({
              title: "Creation Failed",
              description: "Could not create the game lobby. Please check your connection.",
              variant: "destructive",
          });
          setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
      } finally {
          setIsLoading(false);
      }
  };


  const handleJoinGameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const codeToJoin = joinRoomCode.trim().toUpperCase();

    if (!codeToJoin) {
      toast({
        title: "Invalid Code",
        description: "Please enter a room code.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setGameMessage(`Attempting to join lobby ${codeToJoin}...`);
    setIsJoinGameDialogOpen(false); // Close dialog immediately

    const roomRef = doc(db, 'rooms', codeToJoin);

    try {
      const docSnap = await getDoc(roomRef);

      if (docSnap.exists()) {
         const currentRoomData = docSnap.data() as RoomData;
         // Check if player is already in the lobby (e.g., rejoined after disconnect)
          if (currentRoomData.players.includes(playerName)) {
              console.log(`${playerName} is rejoining lobby ${codeToJoin}.`);
              // Already in lobby, just transition state
          } else {
              // Add player to the room
              await updateDoc(roomRef, {
                  players: arrayUnion(playerName)
              });
              console.log(`${playerName} joined game ${codeToJoin}.`);
          }

        setCurrentRoomCode(codeToJoin); // Set the joined room code
        setGameStage('gameLobby');
        // Game message and room data will be updated by the Firestore listener
        setJoinRoomCode(''); // Clear input field
        toast({
          title: "Joined Lobby!",
          description: `Successfully joined lobby ${codeToJoin}.`,
        });

      } else {
        console.log(`Room ${codeToJoin} does not exist.`);
        toast({
          title: "Join Failed",
          description: `Lobby ${codeToJoin} not found. Check the code and try again.`,
          variant: "destructive",
        });
        setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
      }
    } catch (error) {
      console.error("Error joining game room:", error);
      toast({
        title: "Join Failed",
        description: "Could not join the lobby. Please check your connection.",
        variant: "destructive",
      });
       setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Game Lobby Actions ---
    const handleLeaveLobby = async () => {
      if (!currentRoomCode || !playerName) return;

      setIsLoading(true);
      setGameMessage("Leaving lobby...");

      const roomRef = doc(db, 'rooms', currentRoomCode);

      try {
          const docSnap = await getDoc(roomRef);
          if (docSnap.exists()) {
              const currentData = docSnap.data() as RoomData;

              // Check if the leaving player is the host
              if (currentData.hostName === playerName) {
                   // If host leaves, delete the entire room
                   await deleteDoc(roomRef);
                   console.log(`Host ${playerName} left, deleting room ${currentRoomCode}.`);
                   toast({
                       title: "Lobby Closed",
                       description: "You left the lobby as the host, closing it.",
                   });
              } else {
                  // If a regular player leaves, remove them from the players array
                  await updateDoc(roomRef, {
                      players: arrayRemove(playerName)
                  });
                  console.log(`${playerName} left lobby ${currentRoomCode}.`);
                   toast({
                       title: "Left Lobby",
                       description: `You have left lobby ${currentRoomCode}.`,
                   });
              }
          }
      } catch (error) {
          console.error("Error leaving lobby:", error);
          toast({
              title: "Leave Failed",
              description: "Could not properly leave the lobby. Please try again.",
              variant: "destructive",
          });
          // Still attempt to reset local state even if Firebase fails
      } finally {
          // Always reset local state regardless of Firebase success/failure
          if (unsubscribeRef.current) {
              unsubscribeRef.current(); // Stop listening to changes
              unsubscribeRef.current = null;
          }
          setGameStage('lobby');
          setCurrentRoomCode(null);
          setRoomData(null); // Clear local room data
          setGameMessage(`Welcome back, ${playerName}! Create a game or join one.`);
          setIsLoading(false);
      }
  };


  const handleCopyToClipboard = useCallback(() => {
    if (currentRoomCode) {
      navigator.clipboard.writeText(currentRoomCode).then(() => {
        setHasCopied(true);
        toast({
          title: "Copied!",
          description: "Room code copied to clipboard.",
        });
        setTimeout(() => setHasCopied(false), 2000); // Reset icon
      }).catch(err => {
        console.error('Failed to copy room code: ', err);
        toast({
          title: "Copy Failed",
          description: "Could not copy room code. Please copy manually.",
          variant: "destructive",
        });
      });
    }
  }, [currentRoomCode, toast]);

  // --- Game Logic Placeholders ---
  const handleStartGame = async () => {
       if (!currentRoomCode || !roomData || roomData.hostName !== playerName) {
           console.warn("Only the host can start the game.");
           return;
       }
       if (roomData.players.length < 2) { // Example: require at least 2 players
           toast({
               title: "Cannot Start Game",
               description: "Need at least 2 players to start.",
               variant: "destructive",
           });
           return;
       }

       setIsLoading(true);
       setGameMessage("Starting game...");

       const roomRef = doc(db, 'rooms', currentRoomCode);
       try {
           // Update the room document to indicate the game has started
           // Add other game state initialization here (dealing cards, setting turn, etc.)
           await updateDoc(roomRef, {
               gameStarted: true,
               // Add initial game state fields...
           });
           console.log(`Game started in room ${currentRoomCode} by host ${playerName}`);
           // The Firestore listener will eventually update the state to 'game'
           // setGameStage('game'); // Transition happens based on listener update potentially
       } catch (error) {
           console.error("Error starting game:", error);
           toast({
               title: "Start Game Failed",
               description: "Could not start the game. Please try again.",
               variant: "destructive",
           });
           setGameMessage(`Failed to start game. Waiting for players...`); // Revert message
       } finally {
           setIsLoading(false); // Loading indicator off
       }
   };

  // --- Render Logic ---

  const renderEnterName = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
      <UICard className="w-full max-w-md shadow-2xl">
        <CardHeader>
          <CardTitle className="text-4xl font-bold text-primary text-center">Judgement</CardTitle>
          <UICardDescription className="text-center text-muted-foreground pt-2">The virtual card game for remote friends.</UICardDescription>
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
                placeholder="Your Name"
                className="text-lg"
                required
                autoFocus
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full text-lg py-3" size="lg" disabled={isLoading}>
               {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enter Lobby
            </Button>
            {gameMessage && gameMessage.includes('valid name') && <p className="text-sm text-center text-destructive pt-2">{gameMessage}</p>}
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
          <UICardDescription className="text-center text-muted-foreground pt-2">
             {isLoading ? <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> : null}
             {gameMessage}
          </UICardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
          <Button onClick={handleCreateGame} className="w-full text-lg py-3" size="lg" variant="secondary" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2" />} Create Game
          </Button>

          <Dialog open={isJoinGameDialogOpen} onOpenChange={setIsJoinGameDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full text-lg py-3" size="lg" variant="outline" disabled={isLoading}>
                 {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2" />} Join Game
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-primary">Join Game</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Enter the 4-character room code provided by your friend.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleJoinGameSubmit} className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="roomCode" className="text-right text-foreground">
                    Room Code
                  </Label>
                  <Input
                    id="roomCode"
                    value={joinRoomCode}
                    onChange={(e) => setJoinRoomCode(e.target.value)}
                    className="col-span-3 uppercase"
                    placeholder="CODE"
                    maxLength={4}
                    required
                    autoCapitalize="characters"
                    autoFocus
                    style={{ textTransform: 'uppercase' }}
                    disabled={isLoading}
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isLoading}>Cancel</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isLoading}>
                     {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     Join Game
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button variant="link" size="sm" onClick={() => { setGameStage('enterName'); setPlayerName(''); setGameMessage('Enter your name to start.'); }} disabled={isLoading}>
            Change Name
          </Button>
        </CardContent>
      </UICard>
       {/* Removed the developer note as functionality is now implemented */}
    </div>
  );

  const renderGameLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
      <UICard className="w-full max-w-lg shadow-2xl relative">
        {currentRoomCode && (
          <div className="absolute top-4 right-4 flex items-center space-x-2">
            <Badge variant="secondary" className="text-lg px-3 py-1 font-mono tracking-widest">{currentRoomCode}</Badge>
            <Button variant="ghost" size="icon" onClick={handleCopyToClipboard} className="h-8 w-8 text-muted-foreground hover:text-primary" disabled={isLoading}>
              {hasCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              <span className="sr-only">Copy Room Code</span>
            </Button>
          </div>
        )}
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary text-center">Game Lobby</CardTitle>
           <UICardDescription className="text-center text-muted-foreground pt-2">
             {isLoading && !roomData ? <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> : null}
             {gameMessage}
          </UICardDescription>
          {/* Removed local player list note */}
        </CardHeader>
        <CardContent className="flex flex-col space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-secondary mb-3 text-center">Players ({roomData?.players?.length ?? 0})</h3>
            <ul className="space-y-2 text-center max-h-60 overflow-y-auto px-2">
              {isLoading && !roomData ? (
                  <li className="text-lg text-muted-foreground italic p-2"> <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> Loading players...</li>
              ) : roomData?.players?.length ? (
                roomData.players.map((player, index) => (
                  <li key={index} className="text-lg text-foreground p-2 bg-muted/30 rounded-md truncate">
                    {player}
                     {player === roomData.hostName && <span className="text-accent font-semibold ml-1">(Host)</span>}
                     {player === playerName && player !== roomData.hostName && <span className="text-primary font-semibold ml-1">(You)</span>}
                  </li>
                ))
              ) : (
                 <li className="text-lg text-muted-foreground italic p-2">Waiting for players...</li>
              )}
               {/* Placeholder slots - optional visual sugar */}
               {roomData && roomData.players.length < 4 && Array.from({ length: 4 - roomData.players.length }).map((_, i) => (
                   <li key={`waiting-${i}`} className="text-lg text-muted-foreground italic p-2 bg-muted/10 rounded-md">
                       Waiting for player...
                   </li>
               ))}
            </ul>
          </div>

          <div className="flex justify-center space-x-4 pt-4">
            {/* Show Start Game button only to the host */}
            {roomData?.hostName === playerName && (
              <Button
                className="text-lg py-3 px-6"
                size="lg"
                disabled={isLoading || (roomData?.players?.length ?? 0) < 2} // Disable if loading or less than 2 players
                onClick={handleStartGame}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Start Game
              </Button>
            )}
            <Button onClick={handleLeaveLobby} className="text-lg py-3 px-6" size="lg" variant="outline" disabled={isLoading}>
               {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2" />}
               Leave Lobby
            </Button>
          </div>
        </CardContent>
      </UICard>
    </div>
  );

   // Placeholder for the actual game view
   const renderGame = () => (
     <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
        <UICard className="w-full max-w-4xl shadow-2xl">
          <CardHeader>
             <CardTitle className="text-3xl font-bold text-primary text-center">Game In Progress - Room: {currentRoomCode}</CardTitle>
             <UICardDescription className="text-center text-muted-foreground pt-2">
                Game logic and UI will go here. Current Players: {roomData?.players?.join(', ')}
             </UICardDescription>
          </CardHeader>
          <CardContent>
             {/* TODO: Add game board, player hands, scores, etc. */}
             <p className="text-center p-8 text-lg">Game content placeholder...</p>
             <div className="flex justify-center mt-4">
                {/* Add game-specific actions later */}
                {roomData?.hostName === playerName && (
                     <Button variant="destructive" onClick={() => alert("End game logic needed")} disabled={isLoading}>
                         {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                         End Game (Host Only - Placeholder)
                     </Button>
                )}
                 {/* Consider adding a general 'Leave Game' button - needs careful state management */}
             </div>
          </CardContent>
        </UICard>
     </div>
   );


  // Main component logic to switch between different game stages
  switch (gameStage) {
    case 'enterName':
      return renderEnterName();
    case 'lobby':
      return renderLobby();
    case 'gameLobby':
      // Add check for gameStarted field from Firestore data if it exists
      if (roomData?.gameStarted) {
        // If gameStarted is true in Firestore, immediately switch to game view
        // Ensure gameStage state also updates if necessary, maybe via the listener
        setGameStage('game'); // Force stage update
        return renderGame();
      }
      return renderGameLobby();
    case 'game':
       // Check if we somehow landed here without roomData (e.g., refresh, direct navigation)
       if (!roomData || !currentRoomCode) {
           // Redirect back or show loading/error
           setGameStage('lobby'); // Go back to lobby selection
           return renderLobby(); // Or a loading indicator
       }
      return renderGame();
    default:
      return renderEnterName();
  }
}
