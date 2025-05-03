// src/app/page.tsx
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card as UICard, CardContent, CardHeader, CardTitle, CardDescription as UICardDescription } from '@/components/ui/card';
import { Swords, UserPlus, LogOut, Copy, Check, Loader2, Crown } from 'lucide-react'; // Added Crown
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
import { collection, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, Timestamp, deleteDoc, where, query, getDocs, runTransaction } from 'firebase/firestore'; // Added runTransaction
import type { Unsubscribe } from 'firebase/firestore';

// Game stages: 'enterName' -> 'lobby' -> 'gameLobby' -> 'game' (future)
type GameStage = 'enterName' | 'lobby' | 'gameLobby' | 'game';

interface Player {
  id: string; // Unique ID, could be Firebase Auth UID in the future
  name: string;
}

interface RoomData {
  hostId: string; // Store host's unique ID
  hostName: string; // Keep host name for display
  players: Player[]; // Array of player objects
  createdAt: Timestamp;
  gameStarted?: boolean; // Optional flag to indicate game start
  currentRound?: number; // Added for game state
  // Add more game state properties later (e.g., bids, scores, deck, hands)
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
  const [playerId, setPlayerId] = useState<string | null>(null); // Initialize playerId as null
  const [joinRoomCode, setJoinRoomCode] = useState<string>('');
  const [currentRoomCode, setCurrentRoomCode] = useState<string | null>(null); // Room the player is currently in
  const [roomData, setRoomData] = useState<RoomData | null>(null); // Holds real-time data from Firestore
  const [gameMessage, setGameMessage] = useState<string>('Enter your name to start.');
  const [isJoinGameDialogOpen, setIsJoinGameDialogOpen] = useState<boolean>(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false); // General loading state
  const [isCreating, setIsCreating] = useState<boolean>(false); // Specific loading for create
  const [isJoining, setIsJoining] = useState<boolean>(false); // Specific loading for join
  const [isLeaving, setIsLeaving] = useState<boolean>(false); // Specific loading for leave
  const { toast } = useToast();
  const unsubscribeRef = useRef<Unsubscribe | null>(null); // Ref to store the Firestore listener unsubscribe function

  // --- Player ID Generation (Client-Side Only) ---
  useEffect(() => {
    // Generate a simple unique ID for the session on the client after hydration
    // In a real app, this would likely come from an authentication system
    setPlayerId(`player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  }, []); // Empty dependency array ensures this runs once on mount, only on the client


  // --- Firestore Listener Effect ---
  useEffect(() => {
    // Clean up previous listener if it exists
    if (unsubscribeRef.current) {
      console.log("Cleaning up existing Firestore listener.");
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
     setRoomData(null); // Clear data when listener might change

    // If we are in the game lobby, have a room code, and playerId is set, listen for changes
    if (gameStage === 'gameLobby' && currentRoomCode && playerId) {
      setIsLoading(true); // Indicate loading while attaching listener/fetching initial data
      console.log(`Attaching Firestore listener for room: ${currentRoomCode}`);
      const roomRef = doc(db, 'rooms', currentRoomCode);

      unsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as RoomData;
          setRoomData(data);
          console.log("Received room update:", data); // Log received data

          // Check if the game has started
          if (data.gameStarted) {
              console.log(`Game started detected in room ${currentRoomCode}. Transitioning to 'game' stage.`);
              setGameStage('game');
              setGameMessage(`Game in progress in room ${currentRoomCode}!`);
          } else if (playerId && data.hostId === playerId) { // Ensure playerId exists for comparison
             // Update game message based on host status
             setGameMessage(`Share code ${currentRoomCode} to invite players! Waiting for players...`);
           } else {
             setGameMessage(`Joined lobby ${currentRoomCode}. Waiting for host "${data.hostName}" to start...`);
           }
        } else {
          // Room deleted or doesn't exist anymore
          console.log(`Room ${currentRoomCode} not found or deleted.`);
          // Only show toast if we were actively in that room
          if (gameStage === 'gameLobby') {
              toast({
                title: "Lobby Closed",
                description: `Lobby ${currentRoomCode} is no longer available.`,
                variant: "destructive",
              });
          }
          setGameStage('lobby'); // Go back to lobby selection
          setCurrentRoomCode(null);
          // RoomData is already cleared at the start of the effect
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
        setGameStage('lobby');
        setCurrentRoomCode(null);
        // RoomData is already cleared
      });

    } else {
        setIsLoading(false); // Ensure loading is off if not in gameLobby
    }

    // Enhanced Cleanup: Ensure listener is removed when dependencies change
    // or component unmounts.
    return () => {
      if (unsubscribeRef.current) {
        console.log("Running cleanup: Unsubscribing from Firestore listener for room:", currentRoomCode);
        unsubscribeRef.current();
        unsubscribeRef.current = null; // Clear the ref
      }
    };
    // Dependencies: stage, room code, player ID (to ensure listener attaches correctly after ID generation)
  }, [gameStage, currentRoomCode, playerId, toast]);


  // --- Name Handling ---
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = playerName.trim();
    if (trimmedName && playerId) { // Ensure playerId is also set
      setPlayerName(trimmedName); // Store the trimmed name
      setGameStage('lobby');
      setGameMessage(`Welcome, ${trimmedName}! Create a game or join one.`);
    } else if (!trimmedName) {
      toast({
        title: "Invalid Name",
        description: "Please enter a valid name.",
        variant: "destructive",
      });
      setGameMessage('Please enter a valid name.');
    } else {
         // This might happen briefly before the useEffect sets the playerId
         toast({
           title: "Initialization",
           description: "Generating player ID, please wait...",
           variant: "default",
         });
         // Optionally disable the button until playerId is set
    }
  };

  // --- Lobby Actions ---
  const handleCreateGame = async () => {
      if (!playerName || !playerId) {
           toast({ title: "Error", description: "Player name or ID is missing.", variant: "destructive" });
           return;
      }

      setIsCreating(true); // Use specific loading state
      setGameMessage("Creating game lobby...");
      setIsLoading(true); // Also set general loading

      let newRoomCode = '';
      let exists = true;
      let attempts = 0;
      const maxAttempts = 10;

      // 1. Generate a unique room code
      while (exists && attempts < maxAttempts) {
          newRoomCode = generateRoomCode();
          exists = await doesRoomExist(newRoomCode);
          attempts++;
          if (exists) {
              console.warn(`Room code ${newRoomCode} already exists. Attempt ${attempts}.`);
          }
      }

      if (attempts >= maxAttempts && exists) {
          console.error("Failed to generate a unique room code after multiple attempts.");
          toast({
              title: "Creation Failed",
              description: "Could not create a unique lobby code. Please try again.",
              variant: "destructive",
          });
          setIsCreating(false);
          setIsLoading(false);
          setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
          return;
      }

      // 2. Prepare initial room data (moved before optimistic UI for safety)
      const roomRef = doc(db, 'rooms', newRoomCode);
      const initialPlayerData: Player = { id: playerId, name: playerName };
      const initialRoomData: RoomData = {
          hostId: playerId,
          hostName: playerName,
          players: [initialPlayerData],
          createdAt: Timestamp.now(),
          gameStarted: false, // Explicitly set gameStarted to false
      };

      // 3. Write to Firestore FIRST
      try {
          await setDoc(roomRef, initialRoomData);
          console.log(`Firestore document created for lobby ${newRoomCode} by host ${playerName} (${playerId}).`);

          // 4. Optimistic UI Update (AFTER successful Firestore write)
          console.log(`Generated unique room code: ${newRoomCode}`);
          setCurrentRoomCode(newRoomCode); // This triggers the listener useEffect
          setGameStage('gameLobby');
          setHasCopied(false);
          toast({
              title: "Lobby Created!",
              description: `Room code: ${newRoomCode}`,
          });
          // Message will be set by the listener once data arrives

      } catch (error) {
          console.error("Error writing initial room data to Firestore:", error);
          toast({
              title: "Creation Failed",
              description: "Could not save the lobby data. Please try again.",
              variant: "destructive",
          });
          // Revert potentially attempted UI changes (though they happen after success now)
          setGameStage('lobby');
          setCurrentRoomCode(null);
          setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
      } finally {
          // 5. Finalize loading state
          setIsCreating(false);
          // setIsLoading will be turned off by the listener after data loads or if creation failed early
          if (!currentRoomCode) { // Ensure loading is off if creation failed before setting code
            setIsLoading(false);
          }
      }
  };


  const handleJoinGameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName || !playerId) {
         toast({ title: "Error", description: "Player name or ID is missing.", variant: "destructive" });
         return;
    }

    const codeToJoin = joinRoomCode.trim().toUpperCase();

    if (!codeToJoin) {
      toast({ title: "Invalid Code", description: "Please enter a room code.", variant: "destructive" });
      return;
    }

    setIsJoining(true); // Use specific loading state
    setIsLoading(true); // Also set general loading
    setGameMessage(`Attempting to join lobby ${codeToJoin}...`);
    setIsJoinGameDialogOpen(false);

    const roomRef = doc(db, 'rooms', codeToJoin);
    const joiningPlayer: Player = { id: playerId, name: playerName };

    try {
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(roomRef);

            if (!docSnap.exists()) {
                throw new Error("Room not found"); // Throw error to be caught below
            }

            const currentRoomData = docSnap.data() as RoomData;

            // Check if game has already started
            if (currentRoomData.gameStarted) {
                throw new Error("Game already started");
            }

            // Check if player is already in the lobby
            const playerIndex = currentRoomData.players.findIndex(p => p.id === playerId);

            if (playerIndex === -1) {
                 // Player not in lobby, add them
                 const updatedPlayers = [...currentRoomData.players, joiningPlayer];
                 transaction.update(roomRef, { players: updatedPlayers });
                 console.log(`${playerName} (${playerId}) joining lobby ${codeToJoin}. Firestore update scheduled.`);
            } else {
                 // Player already in lobby (e.g., rejoining) - No update needed, but log it.
                 console.log(`${playerName} (${playerId}) is already in lobby ${codeToJoin}. No Firestore update needed.`);
            }
        });

        // Transaction successful OR player was already in room
        console.log(`Transaction successful for joining room ${codeToJoin}. Setting local state.`);
        setCurrentRoomCode(codeToJoin); // This triggers the listener useEffect
        setGameStage('gameLobby');
        setJoinRoomCode(''); // Clear input field
        toast({
          title: "Joined Lobby!",
          description: `Successfully joined lobby ${codeToJoin}.`,
        });
        // Listener will update roomData and message

    } catch (error: any) {
      console.error("Error joining game room:", error);
      let description = "Could not join the lobby. Please check your connection and try again.";
      if (error.message === "Room not found") {
          description = `Lobby ${codeToJoin} not found. Check the code and try again.`;
      } else if (error.message === "Game already started") {
          description = `Cannot join lobby ${codeToJoin}, the game has already started.`;
      }
      toast({
        title: "Join Failed",
        description: description,
        variant: "destructive",
      });
      setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
      // Ensure local state is clean
      setCurrentRoomCode(null);
      setGameStage('lobby');
    } finally {
      setIsJoining(false);
      // setIsLoading will be turned off by the listener after data loads or if join failed
       if (!currentRoomCode) { // Ensure loading is off if join failed before setting code
         setIsLoading(false);
       }
    }
  };

  // --- Game Lobby Actions ---
    const handleLeaveLobby = async () => {
      if (!currentRoomCode || !playerId) return;

      setIsLeaving(true); // Use specific loading state
      setIsLoading(true); // General loading
      setGameMessage("Leaving lobby...");

      const roomRef = doc(db, 'rooms', currentRoomCode);
      const leavingPlayerId = playerId; // Capture current playerId
      const leavingPlayerName = playerName; // Capture current playerName
      const wasHost = roomData?.hostId === leavingPlayerId; // Check if current player was the host based on local data

      // Immediately stop listening to prevent conflicts
      if (unsubscribeRef.current) {
          console.log("Detaching listener before leaving lobby action for room:", currentRoomCode);
          unsubscribeRef.current();
          unsubscribeRef.current = null;
      }

      try {
          await runTransaction(db, async (transaction) => {
             const docSnap = await transaction.get(roomRef);
             if (!docSnap.exists()) {
                 console.log("Room already deleted or not found while trying to leave. No action needed.");
                 return; // Exit transaction if room doesn't exist
             }

             const currentData = docSnap.data() as RoomData;

             if (currentData.hostId === leavingPlayerId) {
                  // Host leaving: Delete the room document
                  console.log(`Host ${leavingPlayerName} (${leavingPlayerId}) leaving, deleting room ${currentRoomCode}.`);
                  transaction.delete(roomRef);
                  // Toast will be shown outside transaction
             } else {
                  // Regular player leaving: Remove from players array
                  const updatedPlayers = currentData.players.filter(p => p.id !== leavingPlayerId);
                  // Only update if the player was actually in the list
                  if (updatedPlayers.length < currentData.players.length) {
                      console.log(`${leavingPlayerName} (${leavingPlayerId}) leaving lobby ${currentRoomCode}. Updating players array.`);
                      transaction.update(roomRef, { players: updatedPlayers });
                  } else {
                       console.log(`${leavingPlayerName} (${leavingPlayerId}) was not found in the players list of room ${currentRoomCode}. No update needed.`);
                  }
                  // Toast will be shown outside transaction
             }
          });

          // Transaction successful
          if (wasHost) {
               toast({
                   title: "Lobby Closed",
                   description: "You left the lobby as the host, closing it.",
               });
          } else {
               toast({
                   title: "Left Lobby",
                   description: `You have left lobby ${currentRoomCode}.`,
               });
          }

      } catch (error) {
          console.error("Error leaving lobby:", error);
          toast({
              title: "Leave Failed",
              description: "Could not properly leave the lobby. Please try again.",
              variant: "destructive",
          });
          // Attempt to re-attach listener if leave fails? Maybe not, could cause issues.
          // For now, we proceed to reset local state.
      } finally {
          // Always reset local state after attempting to leave, regardless of success/failure
          console.log("Resetting local state after leave attempt.");
          setGameStage('lobby');
          setCurrentRoomCode(null);
          setRoomData(null); // Clear local room data
          setGameMessage(`Welcome back, ${playerName}! Create a game or join one.`);
          setIsLeaving(false);
          setIsLoading(false); // Turn off general loading
      }
  };


  const handleCopyToClipboard = useCallback(async () => {
    if (!currentRoomCode) return;

    try {
        // Use Clipboard API
        await navigator.clipboard.writeText(currentRoomCode);
        setHasCopied(true);
        toast({
            title: "Copied!",
            description: "Room code copied to clipboard.",
        });
        setTimeout(() => setHasCopied(false), 2000); // Reset icon
    } catch (err: any) {
        console.error('Failed to copy room code:', err);
        let description = "Could not copy room code automatically. Please copy it manually.";
        // Check for specific error types if needed (e.g., permissions)
        if (err.name === 'NotAllowedError') {
            description = "Clipboard access denied. Please copy the code manually.";
        } else if (!navigator.clipboard) {
             description = "Clipboard API not available. Please copy the code manually."
        }

        toast({
            title: "Copy Failed",
            description: description,
            variant: "destructive",
        });
         setHasCopied(false); // Ensure button resets even on failure
    }
}, [currentRoomCode, toast]);


  // --- Game Logic Placeholders ---
  const handleStartGame = async () => {
       // Use roomData directly from state, updated by the listener
       if (!currentRoomCode || !roomData || !playerId || roomData.hostId !== playerId) { // Added playerId check
           console.warn("Only the host can start the game.");
           toast({ title:"Action Denied", description: "Only the host can start the game.", variant: "destructive"});
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

       setIsLoading(true); // Indicate starting game process
       setGameMessage("Starting game...");

       const roomRef = doc(db, 'rooms', currentRoomCode);
       try {
           // --- TODO: Game Initialization Logic ---
           // 1. Shuffle deck
           // 2. Determine number of rounds based on players
           // 3. Deal initial hands for round 1
           // 4. Set the starting player/turn order
           // 5. Update Firestore with gameStarted: true and initial game state
           // Example update:
           await updateDoc(roomRef, {
               gameStarted: true,
               currentRound: 1,
               // initialHands: {...}, // Store dealt hands (consider security implications)
               // currentPlayerTurn: roomData.players[0].id, // Example: first player starts
               // scores: roomData.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}), // Initialize scores
               // bids: {}, // Initialize bids for the round
               // tricksTaken: {}, // Initialize tricks taken
           });
           // --- End of TODO ---

           console.log(`Game started flag set in room ${currentRoomCode} by host ${playerName} (${playerId})`);
           // The Firestore listener will detect gameStarted: true and trigger the UI transition to 'game' stage.
           // No need to call setGameStage('game') here directly.
       } catch (error) {
           console.error("Error starting game:", error);
           toast({
               title: "Start Game Failed",
               description: "Could not start the game. Please try again.",
               variant: "destructive",
           });
           setGameMessage(`Failed to start game. Waiting for players...`); // Revert message
           setIsLoading(false); // Stop loading on error
       }
       // No finally setIsLoading(false) here - the listener handles the UI transition which implies loading is done
   };

  // --- Render Logic ---

  // Combined loading state check
  const isActionLoading = isCreating || isJoining || isLeaving || isLoading;


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
                disabled={!playerId} // Disable input until playerId is generated
              />
            </div>
            <Button type="submit" className="w-full text-lg py-3" size="lg" disabled={isActionLoading || !playerName.trim() || !playerId}>
               {isActionLoading || !playerId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enter Lobby
            </Button>
            {/* Informative message while playerId is generating */}
            {!playerId && <p className="text-sm text-center text-muted-foreground pt-2">Initializing...</p>}
            {/* Error message display */}
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
          <UICardDescription className="text-center text-muted-foreground pt-2 min-h-[20px]"> {/* Added min-height */}
             {isActionLoading ? <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> : null}
             {gameMessage}
          </UICardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
          <Button onClick={handleCreateGame} className="w-full text-lg py-3" size="lg" variant="secondary" disabled={isActionLoading}>
            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2" />} Create Game
          </Button>

          <Dialog open={isJoinGameDialogOpen} onOpenChange={setIsJoinGameDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full text-lg py-3" size="lg" variant="outline" disabled={isActionLoading}>
                 {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2" />} Join Game
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
                    style={{ textTransform: 'uppercase' }} // Ensure uppercase visually
                    disabled={isActionLoading} // Disable when any action is loading
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isActionLoading}>Cancel</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isActionLoading || !joinRoomCode.trim()}>
                     {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     Join Game
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Removed Change Name & ID button as ID generation is now automatic */}
          {/* <Button variant="link" size="sm" onClick={() => { setGameStage('enterName'); setPlayerName(''); setPlayerId(null); setGameMessage('Enter your name to start.'); }} disabled={isActionLoading}>
            Change Name
          </Button> */}
        </CardContent>
      </UICard>
    </div>
  );

  const renderGameLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
      <UICard className="w-full max-w-lg shadow-2xl relative">
        {currentRoomCode && (
          <div className="absolute top-4 right-4 flex items-center space-x-2 z-10"> {/* Ensure z-index */}
            <Badge variant="secondary" className="text-lg px-3 py-1 font-mono tracking-widest">{currentRoomCode}</Badge>
            <Button variant="ghost" size="icon" onClick={handleCopyToClipboard} className="h-8 w-8 text-muted-foreground hover:text-primary" disabled={isActionLoading || hasCopied} title="Copy Room Code">
              {hasCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              <span className="sr-only">Copy Room Code</span>
            </Button>
          </div>
        )}
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary text-center">Game Lobby</CardTitle>
           <UICardDescription className="text-center text-muted-foreground pt-2 min-h-[20px]"> {/* Added min-height */}
             {/* Show loading only if explicitly loading OR if roomData hasn't arrived yet */}
             {(isLoading || !roomData) && gameStage === 'gameLobby' ? <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> : null}
             {gameMessage}
          </UICardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-secondary mb-3 text-center">Players ({roomData?.players?.length ?? 0})</h3>
            {/* Use ScrollArea for potentially long player lists */}
            <div className="max-h-60 overflow-y-auto px-2 border rounded-md bg-muted/20 py-2">
              <ul className="space-y-2 text-center">
                {/* Show loading indicator inside the list only when loading and no data */}
                {isLoading && !roomData && gameStage === 'gameLobby' ? (
                    <li className="text-lg text-muted-foreground italic p-2"> <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> Loading players...</li>
                ) : roomData?.players?.length ? (
                  roomData.players.map((player) => ( // Use player object
                    <li key={player.id} className="text-lg text-foreground p-2 bg-muted/30 rounded-md truncate flex items-center justify-center space-x-2">
                       {player.id === roomData.hostId && <Crown size={18} className="text-accent inline-block" aria-label="Host"/>}
                       <span>{player.name}</span>
                       {/* Ensure playerId exists before comparison */}
                       {playerId && player.id === playerId && <span className="text-primary font-semibold ml-1">(You)</span>}
                    </li>
                  ))
                ) : (
                   /* Only show "Waiting..." if not loading and no players */
                   !isLoading && <li className="text-lg text-muted-foreground italic p-2">Waiting for players...</li>
                )}
                 {/* Placeholder slots - optional visual sugar (Only show if data exists and count < 4) */}
                 {roomData && roomData.players.length < 4 && Array.from({ length: 4 - roomData.players.length }).map((_, i) => (
                     <li key={`waiting-${i}`} className="text-lg text-muted-foreground italic p-2 bg-muted/10 rounded-md">
                         Waiting for player...
                     </li>
                 ))}
              </ul>
            </div> {/* End ScrollArea */}
          </div>

          <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-4 pt-4">
            {/* Show Start Game button only to the host */}
            {playerId && roomData?.hostId === playerId && ( // Ensure playerId exists
              <Button
                className="text-lg py-3 px-6 w-full sm:w-auto" // Adjust width for mobile
                size="lg"
                disabled={isActionLoading || (roomData?.players?.length ?? 0) < 2} // Disable if loading or less than 2 players
                onClick={handleStartGame}
              >
                {/* Show loading specific to starting game OR general loading */}
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2"/>}
                Start Game
              </Button>
            )}
            <Button
               onClick={handleLeaveLobby}
               className="text-lg py-3 px-6 w-full sm:w-auto" // Adjust width for mobile
               size="lg"
               variant="outline"
               disabled={isLeaving || isLoading} // Disable specifically when leaving or general loading
            >
               {isLeaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2" />}
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
                {/* Display player names from roomData */}
                Players: {roomData?.players?.map(p => p.name).join(', ') ?? 'Loading...'}
             </UICardDescription>
          </CardHeader>
          <CardContent>
             {/* TODO: Add game board, player hands, scores, bidding UI, play area, etc. */}
             <p className="text-center p-8 text-lg">Game content placeholder...</p>
             <p className="text-center text-muted-foreground">Current Round: {roomData?.currentRound ?? 'N/A'}</p>
             {/* Example: Display Scores */}
             {/* <div className="mt-4">
                 <h4 className="text-center font-semibold">Scores</h4>
                 <ul className="text-center">
                     {roomData?.scores && Object.entries(roomData.scores).map(([pId, score]) => (
                         <li key={pId}>{roomData.players.find(p => p.id === pId)?.name}: {score}</li>
                     ))}
                 </ul>
             </div> */}
             <div className="flex justify-center mt-4 space-x-4">
                 {/* Button for host to end game prematurely (Needs backend logic) */}
                {playerId && roomData?.hostId === playerId && ( // Ensure playerId exists
                     <Button variant="destructive" onClick={() => alert("End game logic needed")} disabled={isLoading}>
                         {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                         End Game (Host)
                     </Button>
                )}
                 {/* Button for players to leave ongoing game (Needs careful state handling) */}
                 <Button variant="outline" onClick={() => alert("Leave game logic needed - Careful!")} disabled={isLoading}>
                     {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     Leave Game
                 </Button>
             </div>
          </CardContent>
        </UICard>
     </div>
   );


  // Main component logic to switch between different game stages

  // Handle initial loading state where playerId might not be ready yet
  if (playerId === null && gameStage === 'enterName') {
      return renderEnterName(); // Show the name entry screen, but the button/input might be disabled
  }


  switch (gameStage) {
    case 'enterName':
      return renderEnterName();
    case 'lobby':
       // Ensure player name and ID are set before showing lobby
       if (!playerName || !playerId) {
           console.warn("Attempted to render lobby without name or ID. Redirecting to enterName.");
           setGameStage('enterName');
           setGameMessage("Please enter your name to start.");
           return renderEnterName(); // Go back to name entry
       }
       return renderLobby();
    case 'gameLobby':
       // Ensure core data is present for game lobby
        if (!playerName || !playerId || !currentRoomCode) {
            console.warn("Attempted to render gameLobby without necessary data. Redirecting to lobby.");
            setGameStage('lobby');
            setCurrentRoomCode(null); // Clear potentially invalid room code
            setRoomData(null);
            setGameMessage(`Welcome back, ${playerName}! Please rejoin or create a game.`);
            return renderLobby(); // Go back to lobby selection
        }
       // Listener handles transition to 'game' if roomData.gameStarted is true
       return renderGameLobby();
    case 'game':
       // Check if we somehow landed here without roomData or essential IDs
       if (!roomData || !currentRoomCode || !playerId || !playerName) {
           console.warn("Attempted to render game stage without necessary data. Redirecting to lobby.");
           // Attempt to recover state or redirect
           setGameStage('lobby'); // Go back to lobby selection
           setCurrentRoomCode(null); // Clear potentially invalid room code
           setRoomData(null);
           // Show a message or just render lobby
           setGameMessage(playerName ? `Welcome back, ${playerName}! Please rejoin or create a game.` : 'Please enter your name.');
           return renderLobby(); // Or a loading indicator first
       }
       // Check if current player is actually part of this game room
       if (!roomData.players.some(p => p.id === playerId)) {
           console.warn(`Player ${playerId} (${playerName}) is not in room ${currentRoomCode}. Redirecting.`);
            toast({ title: "Not in Room", description: "You are not part of this game.", variant: "destructive"});
            setGameStage('lobby');
            setCurrentRoomCode(null);
            setRoomData(null);
            setGameMessage(`Welcome back, ${playerName}! Please rejoin or create a game.`);
            return renderLobby();
       }
       return renderGame();
    default:
      // Fallback to enterName if stage is unrecognized or player ID isn't ready
      if (playerId === null) {
        return renderEnterName();
      }
      setGameStage('enterName'); // Reset to a known good state
      setGameMessage('Enter your name to start.');
      return renderEnterName();
  }
}
