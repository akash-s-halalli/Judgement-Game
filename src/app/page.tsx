
// src/app/page.tsx
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card as UICard, CardContent, CardHeader, CardTitle, CardDescription as UICardDescription } from '@/components/ui/card';
import { Swords, UserPlus, LogOut, Copy, Check, Loader2, Crown } from 'lucide-react';
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
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, Timestamp, deleteDoc, where, query, getDocs, runTransaction } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { Card, PlayerHand } from '@/types/cards'; // Import card types
import { generateDeck, adjustDeckForPlayers, shuffleDeck } from '@/lib/game-logic'; // Import game logic functions
import CardComponent from '@/components/CardComponent'; // Import CardComponent

// Game stages: 'enterName' -> 'lobby' -> 'gameLobby' -> 'game'
type GameStage = 'enterName' | 'lobby' | 'gameLobby' | 'game';

interface Player {
  id: string;
  name: string;
}

interface RoomData {
  hostId: string;
  hostName: string;
  players: Player[];
  createdAt: Timestamp;
  gameStarted?: boolean;
  currentRound?: number;
  deck?: Card[]; // The current state of the deck
  playerHands?: { [playerId: string]: Card[] }; // Hands dealt to players
  // Add more game state properties later (e.g., current turn, scores, trump suit)
}

// LocalStorage keys
const LS_PLAYER_NAME = 'judgement_playerName';
const LS_PLAYER_ID = 'judgement_playerId';
const LS_GAME_STAGE = 'judgement_gameStage';
const LS_CURRENT_ROOM_CODE = 'judgement_currentRoomCode';

// Simple room code generation utility
const generateRoomCode = (length = 4): string => {
  const characters = 'ABCDEFGHJKMNPQRSTUVWXYZ123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const doesRoomExist = async (code: string): Promise<boolean> => {
    const roomRef = doc(db, 'rooms', code);
    const docSnap = await getDoc(roomRef);
    return docSnap.exists();
};


export default function GamePage() {
  const [gameStage, setGameStage] = useState<GameStage>('enterName');
  const [playerName, setPlayerName] = useState<string>('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [joinRoomCode, setJoinRoomCode] = useState<string>('');
  const [currentRoomCode, setCurrentRoomCode] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [gameMessage, setGameMessage] = useState<string>('Enter your name to start.');
  const [isJoinGameDialogOpen, setIsJoinGameDialogOpen] = useState<boolean>(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(true); // General loading state
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isLeaving, setIsLeaving] = useState<boolean>(false); // Loading for leaving lobby/game
  const [isEnding, setIsEnding] = useState<boolean>(false); // Loading for host ending game
  const [isLoadedFromStorage, setIsLoadedFromStorage] = useState<boolean>(false); // Flag for storage load
  const { toast } = useToast();
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  // --- State Restoration from localStorage ---
  useEffect(() => {
    // Only run on the client after initial mount
    if (typeof window !== 'undefined') {
      console.log("Attempting to restore state from localStorage...");
      const savedPlayerName = localStorage.getItem(LS_PLAYER_NAME);
      const savedPlayerId = localStorage.getItem(LS_PLAYER_ID);
      const savedGameStage = localStorage.getItem(LS_GAME_STAGE) as GameStage | null;
      const savedRoomCode = localStorage.getItem(LS_CURRENT_ROOM_CODE);

      if (savedPlayerId) {
        setPlayerId(savedPlayerId);
        console.log("Restored playerId:", savedPlayerId);
      } else {
        // Generate a new player ID if none exists
        const newPlayerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        setPlayerId(newPlayerId);
        localStorage.setItem(LS_PLAYER_ID, newPlayerId);
        console.log("Generated new playerId:", newPlayerId);
      }

      if (savedPlayerName) {
        setPlayerName(savedPlayerName);
        console.log("Restored playerName:", savedPlayerName);
      }

      if (savedGameStage) {
        // Basic validation - ensure the stage makes sense with other data
        if (savedGameStage === 'gameLobby' || savedGameStage === 'game') {
            if (savedPlayerName && savedPlayerId && savedRoomCode) {
                 setGameStage(savedGameStage);
                 setCurrentRoomCode(savedRoomCode);
                 console.log("Restored gameStage:", savedGameStage, "and roomCode:", savedRoomCode);
            } else {
                // Inconsistent state, reset to lobby or enterName
                console.warn("Inconsistent state found in localStorage, resetting to 'lobby'.");
                setGameStage('lobby');
                localStorage.setItem(LS_GAME_STAGE, 'lobby');
                localStorage.removeItem(LS_CURRENT_ROOM_CODE);
            }
        } else if (savedGameStage === 'lobby') {
             if (savedPlayerName && savedPlayerId) {
                setGameStage('lobby');
                console.log("Restored gameStage: lobby");
             } else {
                 console.warn("Inconsistent state for 'lobby', resetting to 'enterName'.");
                 setGameStage('enterName');
                 localStorage.setItem(LS_GAME_STAGE, 'enterName');
             }
        } else { // enterName
            setGameStage('enterName');
            console.log("Restored gameStage: enterName");
        }

      } else {
         // Default to enterName if no stage saved
         setGameStage('enterName');
         localStorage.setItem(LS_GAME_STAGE, 'enterName');
         console.log("No gameStage found, defaulting to enterName.");
      }

      // Set messages based on restored state (after stage is set)
      if (savedGameStage === 'lobby' && savedPlayerName) {
          setGameMessage(`Welcome back, ${savedPlayerName}! Create or join a game.`);
      } else if ((savedGameStage === 'gameLobby' || savedGameStage === 'game') && savedRoomCode) {
          // Message will be updated by the Firestore listener shortly
          setGameMessage(`Reconnecting to ${savedGameStage === 'gameLobby' ? 'lobby' : 'game'} ${savedRoomCode}...`);
      } else {
          setGameMessage('Enter your name to start.');
      }

      setIsLoadedFromStorage(true); // Indicate loading from storage is complete
      setIsLoading(false); // Stop initial loading indicator
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs once on mount

  // --- State Persistence to localStorage ---
  useEffect(() => {
    if (isLoadedFromStorage && typeof window !== 'undefined') {
        console.log("Persisting playerName to localStorage:", playerName);
        if (playerName) {
            localStorage.setItem(LS_PLAYER_NAME, playerName);
        } else {
             localStorage.removeItem(LS_PLAYER_NAME);
        }
    }
  }, [playerName, isLoadedFromStorage]);

  useEffect(() => {
    // Player ID is set once initially and persisted, shouldn't change often
    if (isLoadedFromStorage && typeof window !== 'undefined' && playerId) {
       console.log("Persisting playerId to localStorage:", playerId);
       localStorage.setItem(LS_PLAYER_ID, playerId);
    }
   }, [playerId, isLoadedFromStorage]);


  useEffect(() => {
    if (isLoadedFromStorage && typeof window !== 'undefined') {
      console.log("Persisting gameStage to localStorage:", gameStage);
      localStorage.setItem(LS_GAME_STAGE, gameStage);
    }
  }, [gameStage, isLoadedFromStorage]);

  useEffect(() => {
    if (isLoadedFromStorage && typeof window !== 'undefined') {
      console.log("Persisting currentRoomCode to localStorage:", currentRoomCode);
      if (currentRoomCode) {
        localStorage.setItem(LS_CURRENT_ROOM_CODE, currentRoomCode);
      } else {
        localStorage.removeItem(LS_CURRENT_ROOM_CODE);
      }
    }
  }, [currentRoomCode, isLoadedFromStorage]);


  // --- Firestore Listener Effect ---
  useEffect(() => {
    // Wait until loaded from storage and necessary IDs are available
    if (!isLoadedFromStorage || !playerId) {
        console.log("Firestore listener waiting for storage load or playerId.");
        return;
    }

    const cleanupListener = () => {
        if (unsubscribeRef.current) {
            console.log("Cleaning up existing Firestore listener for room:", currentRoomCode);
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
    };

    cleanupListener(); // Clean up previous listener before setting a new one

    if ((gameStage === 'gameLobby' || gameStage === 'game') && currentRoomCode) {
      // Show loading only if we don't have roomData yet for this room
      // Avoid setting isLoading(true) if we already have data, prevents flicker on quick updates
      if (!roomData || roomData.players.length === 0) setIsLoading(true);
      console.log(`Attaching Firestore listener for room: ${currentRoomCode}`);
      const roomRef = doc(db, 'rooms', currentRoomCode);

      unsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as RoomData;
          setRoomData(data); // Update local room data state
          console.log("Received room update:", data);

          // --- State Synchronization & Message Updates ---
          const currentPlayerInRoom = data.players.some(p => p.id === playerId);

          if (!currentPlayerInRoom && (gameStage === 'gameLobby' || gameStage === 'game')) {
               // Current player is no longer in this room (e.g., kicked, left on another device, game ended)
               console.warn(`Player ${playerId} no longer in room ${currentRoomCode}. Redirecting to lobby.`);
               toast({ title: "Removed from Room", description: `You are no longer in room ${currentRoomCode}.`, variant: "destructive" });
               setGameStage('lobby');
               setCurrentRoomCode(null);
               setRoomData(null); // Clear stale data
               setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
               setIsLoading(false);
               cleanupListener(); // Detach listener after resetting state
               return; // Stop further processing for this snapshot
          }

          // Handle transitions based on gameStarted flag
          if (data.gameStarted && gameStage === 'gameLobby') {
              console.log(`Game started detected in room ${currentRoomCode}. Transitioning to 'game' stage.`);
              setGameStage('game'); // This will persist via useEffect
              setGameMessage(`Game in progress in room ${currentRoomCode}! Round ${data.currentRound || 'N/A'}`);
          } else if (!data.gameStarted && gameStage === 'game') {
              // Game ended or reset while we were in 'game' stage
              console.log(`Game no longer marked as started in room ${currentRoomCode}. Returning to 'gameLobby'.`);
              toast({ title: "Game Ended", description: `The game in room ${currentRoomCode} has ended. Returning to lobby.` });
              setGameStage('gameLobby'); // Move back to lobby
              // Message will be updated below based on host status
          }

           // Update messages based on the current (potentially changed) stage
           if (gameStage === 'gameLobby') { // Update lobby message if still in lobby
               if (playerId === data.hostId) {
                   setGameMessage(`Share code ${currentRoomCode} to invite players! Waiting for players...`);
               } else {
                   setGameMessage(`Joined lobby ${currentRoomCode}. Waiting for host "${data.hostName}" to start...`);
               }
           } else if (gameStage === 'game') { // Update game message
                setGameMessage(`Game in progress! Round ${data.currentRound || 'N/A'}`);
                // Add more game-specific messages later (e.g., whose turn)
           }


        } else {
          // Room deleted or doesn't exist anymore
          console.log(`Room ${currentRoomCode} not found or deleted.`);
          // Only show toast and reset if we were actively supposed to be in that room
          if (gameStage === 'gameLobby' || gameStage === 'game') {
              toast({
                title: "Room Closed",
                description: `Room ${currentRoomCode} is no longer available.`,
                variant: "destructive",
              });
              setGameStage('lobby'); // Go back to lobby selection
              setCurrentRoomCode(null);
              setRoomData(null); // Clear stale data
              setGameMessage(`Welcome back, ${playerName}! Create a game or join one.`);
              cleanupListener(); // Detach listener after resetting state
          }
        }
         setIsLoading(false); // Stop loading after data is fetched/updated or determined non-existent
      }, (error) => {
        console.error("Error listening to room changes:", error);
        toast({
          title: "Connection Error",
          description: "Could not sync room data. Please check your connection.",
          variant: "destructive",
        });
        // Attempt to reset to a safe state
        if (gameStage === 'gameLobby' || gameStage === 'game') {
             setGameStage('lobby');
             setCurrentRoomCode(null);
             setRoomData(null);
             setGameMessage(`Welcome back, ${playerName}! Error connecting to room.`);
             cleanupListener(); // Detach listener after resetting state
        }
        setIsLoading(false);
      });

    } else {
        // Not in gameLobby or game stage, ensure loading is off
        setIsLoading(false);
        // Cleanup listener if it exists for some reason
        cleanupListener();
    }

    // Cleanup: Ensure listener is removed when dependencies change or component unmounts.
    return cleanupListener;
    // Dependencies: stage, room code, player ID, isLoadedFromStorage (to ensure it runs after restoration)
  }, [gameStage, currentRoomCode, playerId, isLoadedFromStorage, toast, playerName]); // Removed roomData to avoid re-triggering listener unnecessarily


  // --- Name Handling ---
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = playerName.trim();
    if (trimmedName && playerId) {
      setPlayerName(trimmedName);
      setGameStage('lobby');
      setGameMessage(`Welcome, ${trimmedName}! Create a game or join one.`);
      // localStorage updates are handled by useEffect hooks
    } else if (!trimmedName) {
      toast({
        title: "Invalid Name",
        description: "Please enter a valid name.",
        variant: "destructive",
      });
      setGameMessage('Please enter a valid name.');
    } else {
         toast({
           title: "Initialization",
           description: "Player ID not ready yet, please wait...",
           variant: "default",
         });
    }
  };

  // --- Lobby Actions ---
  const handleCreateGame = async () => {
      if (!playerName || !playerId) {
           toast({ title: "Error", description: "Player name or ID is missing.", variant: "destructive" });
           return;
      }

      setIsCreating(true);
      setGameMessage("Creating game lobby...");
      setIsLoading(true); // Use general loading indicator

      let newRoomCode = '';
      let exists = true;
      let attempts = 0;
      const maxAttempts = 10;

      while (exists && attempts < maxAttempts) {
          newRoomCode = generateRoomCode();
          exists = await doesRoomExist(newRoomCode);
          attempts++;
          if (exists) {
              console.warn(`Room code ${newRoomCode} already exists. Attempt ${attempts}.`);
              await new Promise(resolve => setTimeout(resolve, 50)); // Small delay before retrying
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
          setIsLoading(false); // Stop loading on failure
          setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
          return;
      }

      const roomRef = doc(db, 'rooms', newRoomCode);
      const initialPlayerData: Player = { id: playerId, name: playerName };
      const initialRoomData: RoomData = {
          hostId: playerId,
          hostName: playerName,
          players: [initialPlayerData],
          createdAt: Timestamp.now(),
          gameStarted: false,
      };

      try {
          await setDoc(roomRef, initialRoomData);
          console.log(`Firestore document created for lobby ${newRoomCode} by host ${playerName} (${playerId}).`);

          // Set local state AFTER successful Firestore write
          setCurrentRoomCode(newRoomCode); // Triggers listener useEffect
          setGameStage('gameLobby'); // Triggers listener + persistence useEffect
          setHasCopied(false); // Reset copy state for new lobby
          toast({
              title: "Lobby Created!",
              description: `Room code: ${newRoomCode}`,
          });
          // Message and isLoading=false will be handled by the Firestore listener

      } catch (error) {
          console.error("Error writing initial room data to Firestore:", error);
          toast({
              title: "Creation Failed",
              description: "Could not save the lobby data. Please try again.",
              variant: "destructive",
          });
          // Reset state if creation fails
          setGameStage('lobby');
          setCurrentRoomCode(null);
          setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
          setIsLoading(false); // Stop loading on failure
      } finally {
          setIsCreating(false); // Turn off specific creating spinner
          // setIsLoading will be turned off by the listener or if creation failed
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

    setIsJoining(true);
    setGameMessage(`Attempting to join lobby ${codeToJoin}...`);
    setIsLoading(true); // Use general loading indicator
    setIsJoinGameDialogOpen(false); // Close dialog immediately

    const roomRef = doc(db, 'rooms', codeToJoin);
    const joiningPlayer: Player = { id: playerId, name: playerName };

    try {
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(roomRef);

            if (!docSnap.exists()) {
                throw new Error("Room not found");
            }

            const currentRoomData = docSnap.data() as RoomData;

            if (currentRoomData.gameStarted) {
                throw new Error("Game already started");
            }

            const playerIndex = currentRoomData.players.findIndex(p => p.id === playerId);

            if (playerIndex === -1) {
                 // Check max players (optional, e.g., 4)
                 if (currentRoomData.players.length >= 4) {
                    throw new Error("Lobby is full");
                 }
                 const updatedPlayers = [...currentRoomData.players, joiningPlayer];
                 transaction.update(roomRef, { players: updatedPlayers });
                 console.log(`${playerName} (${playerId}) joining lobby ${codeToJoin}. Firestore update scheduled.`);
            } else {
                 console.log(`${playerName} (${playerId}) is already in lobby ${codeToJoin}. No Firestore update needed.`);
            }
        });

        // Transaction successful OR player was already in room
        setCurrentRoomCode(codeToJoin); // Triggers listener useEffect
        setGameStage('gameLobby'); // Triggers listener + persistence useEffect
        setJoinRoomCode(''); // Clear input field
        toast({
          title: "Joined Lobby!",
          description: `Successfully joined lobby ${codeToJoin}.`,
        });
        // Listener will update roomData, message, and set isLoading=false

    } catch (error: any) {
      console.error("Error joining game room:", error);
      let description = "Could not join the lobby. Please check your connection and try again.";
      if (error.message === "Room not found") {
          description = `Lobby ${codeToJoin} not found. Check the code and try again.`;
      } else if (error.message === "Game already started") {
          description = `Cannot join lobby ${codeToJoin}, the game has already started.`;
      } else if (error.message === "Lobby is full") {
          description = `Lobby ${codeToJoin} is full. Cannot join.`;
      }
      toast({
        title: "Join Failed",
        description: description,
        variant: "destructive",
      });
      // Reset state on failure
      setGameStage('lobby');
      setCurrentRoomCode(null);
      setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
      setIsLoading(false); // Stop loading on failure
    } finally {
      setIsJoining(false); // Turn off specific joining spinner
      // setIsLoading handled by listener or error case
    }
  };

   // --- Common Reset Logic ---
   const resetToLobby = (message?: string) => {
        if (unsubscribeRef.current) {
            console.log("Detaching listener during resetToLobby for room:", currentRoomCode);
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
        setGameStage('lobby');
        setCurrentRoomCode(null);
        setRoomData(null); // Clear local room data
        setGameMessage(message || `Welcome back, ${playerName}! Create a game or join one.`);
        setIsLoading(false); // Ensure loading is off
        setIsLeaving(false); // Ensure leaving state is off
        setIsEnding(false); // Ensure ending state is off
        // localStorage updates are handled by useEffects
    };


   // --- Backend Leave Logic (Transaction) ---
   const performLeaveTransaction = async (roomCode: string, playerIdToLeave: string, playerNameForLog: string) => {
        const roomRef = doc(db, 'rooms', roomCode);
        try {
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(roomRef);
                if (!docSnap.exists()) {
                    console.log(`Room ${roomCode} already deleted or not found while ${playerNameForLog} trying to leave. No backend action needed.`);
                    return; // Exit transaction, nothing to update
                }

                const currentData = docSnap.data() as RoomData;
                const isHostLeaving = currentData.hostId === playerIdToLeave;
                const players = currentData.players;
                const leavingPlayerIndex = players.findIndex(p => p.id === playerIdToLeave);

                if (isHostLeaving) {
                    // Host leaving: Delete the room document entirely
                    console.log(`Host ${playerNameForLog} (${playerIdToLeave}) leaving, deleting room ${roomCode}.`);
                    transaction.delete(roomRef);
                } else if (leavingPlayerIndex !== -1) {
                    // Regular player leaving: Remove from players array
                    const updatedPlayers = players.filter(p => p.id !== playerIdToLeave);
                    console.log(`${playerNameForLog} (${playerIdToLeave}) leaving room ${roomCode}. Updating players array.`);
                    transaction.update(roomRef, { players: updatedPlayers });
                } else {
                    // Player not found in the list (already left?)
                    console.log(`${playerNameForLog} (${playerIdToLeave}) was not found in the players list of room ${roomCode}. No backend update needed.`);
                }
            });
            console.log(`Successfully processed leave action for ${playerNameForLog} in room ${roomCode}.`);
            return true; // Indicate success
        } catch (error) {
            console.error(`Error performing leave transaction for ${playerNameForLog} in room ${roomCode}:`, error);
            toast({
                title: "Leave Error",
                description: "Could not update the room on the server. You have left locally.",
                variant: "destructive",
            });
            return false; // Indicate failure
        }
    };


    // --- Leave Lobby / Game Handler ---
    const handleLeaveRoom = async () => {
      if (!currentRoomCode || !playerId || !playerName) {
          console.warn("Attempted to leave room without necessary info.");
          return;
      }

      setIsLeaving(true);
      setIsLoading(true); // General loading indicator while leaving
      const leavingRoomCode = currentRoomCode;
      const leavingPlayerId = playerId;
      const leavingPlayerName = playerName;
      const wasHost = roomData?.hostId === leavingPlayerId; // Check host status before resetting local data

      // 1. Optimistically update UI and local state
      const previousStage = gameStage; // Remember if leaving from lobby or game
      resetToLobby("Leaving room..."); // Resets stage, roomCode, roomData, listener, and sets message

      // 2. Perform backend update
      const success = await performLeaveTransaction(leavingRoomCode, leavingPlayerId, leavingPlayerName);

      // 3. Show appropriate toast based on outcome and previous state
      if (success) {
          if (wasHost) {
               toast({
                   title: previousStage === 'game' ? "Game Ended & Room Closed" : "Lobby Closed",
                   description: `You left the ${previousStage === 'game' ? 'game' : 'lobby'} as the host, closing room ${leavingRoomCode}.`,
               });
          } else {
               toast({
                   title: previousStage === 'game' ? "Left Game" : "Left Lobby",
                   description: `You have left room ${leavingRoomCode}.`,
               });
          }
      }
       // If !success, error toast is shown inside performLeaveTransaction

      // 4. Update final message and ensure loading states are off
      resetToLobby(); // Call again to set the final welcome message and ensure all loading is off
    };


     // --- Host End Game Handler ---
    const handleEndGame = async () => {
        if (!currentRoomCode || !playerId || !roomData || roomData.hostId !== playerId) {
            toast({ title: "Action Denied", description: "Only the host can end the game.", variant: "destructive" });
            return;
        }
        if (!roomData.gameStarted) {
             toast({ title: "Action Denied", description: "The game hasn't started yet.", variant: "destructive" });
             return;
        }

        setIsEnding(true);
        setIsLoading(true); // General loading indicator
        const endingRoomCode = currentRoomCode;
        const endingPlayerId = playerId;
        const endingPlayerName = playerName;
        console.log(`Host ${endingPlayerName} (${endingPlayerId}) initiating end game for room ${endingRoomCode}.`);

        // 1. Update backend: Delete the room document
        const roomRef = doc(db, 'rooms', endingRoomCode);
        try {
            await deleteDoc(roomRef);
            console.log(`Successfully deleted room ${endingRoomCode} by host action.`);

            // 2. Update local state (similar to leaving)
            resetToLobby(`You ended the game and closed room ${endingRoomCode}.`);
            toast({
                title: "Game Ended & Room Closed",
                description: `You ended the game in room ${endingRoomCode}.`,
            });

        } catch (error) {
            console.error(`Error deleting room ${endingRoomCode} during end game action:`, error);
            toast({
                title: "End Game Failed",
                description: "Could not close the room on the server. Please try leaving manually.",
                variant: "destructive",
            });
            // Reset loading states even on error
             setIsEnding(false);
             setIsLoading(false);
             // Keep the user in the game view locally, maybe show an error message
             setGameMessage(`Error ending game. Try leaving manually.`);
        }
        // No finally block needed here as resetToLobby handles loading states on success
    };


  const handleCopyToClipboard = useCallback(async () => {
    if (!currentRoomCode) return;

    try {
        // Use Clipboard API - Requires HTTPS or localhost for security
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
        // Check if running in a secure context (HTTPS or localhost)
        if (window.isSecureContext === false) {
            description = "Clipboard access requires a secure connection (HTTPS or localhost). Please copy the code manually.";
        } else if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
            description = "Clipboard access denied by browser settings or policy. Please copy the code manually.";
        } else if (!navigator.clipboard) {
             description = "Clipboard API not available in this browser. Please copy the code manually."
        }

        toast({
            title: "Copy Failed",
            description: description,
            variant: "destructive",
        });
         setHasCopied(false); // Ensure button resets
    }
}, [currentRoomCode, toast]);


  // --- Game Logic ---
  const handleStartGame = async () => {
       if (!currentRoomCode || !roomData || !playerId || roomData.hostId !== playerId) {
           toast({ title:"Action Denied", description: "Only the host can start the game.", variant: "destructive"});
           return;
       }
       const numPlayers = roomData.players.length;
       if (numPlayers < 2) {
           toast({
               title: "Cannot Start Game",
               description: "Need at least 2 players to start.",
               variant: "destructive",
           });
           return;
       }
       // Optional: Add max player limit check if needed (e.g., 4 or 6)
       // if (numPlayers > 4) { ... }

       setIsLoading(true); // Use general loading indicator
       setGameMessage("Starting game... Preparing deck...");

       const roomRef = doc(db, 'rooms', currentRoomCode);
       try {
           // 1. Generate and Prepare Deck
           const initialDeck = generateDeck();
           const adjustedDeck = adjustDeckForPlayers(initialDeck, numPlayers);
           const shuffledDeck = shuffleDeck(adjustedDeck);

           // 2. TODO: Deal Cards (Logic to distribute cards will be added later)
           // For now, just store the prepared deck in Firestore.
           // We'll deal in the first round logic later.
           const initialPlayerHands: { [playerId: string]: Card[] } = {};
            roomData.players.forEach(p => {
                initialPlayerHands[p.id] = []; // Initialize empty hands
            });


           // 3. Update Firestore with game state
           await updateDoc(roomRef, {
               gameStarted: true,
               currentRound: 1, // Assuming game starts at round 1
               deck: shuffledDeck, // Store the shuffled, adjusted deck
               playerHands: initialPlayerHands, // Store empty hands initially
               // ... other initial game state like scores, bids, trump etc. ...
           });

           console.log(`Game started flag set, deck prepared and stored in room ${currentRoomCode} by host ${playerName} (${playerId})`);
           // Listener will detect gameStarted: true and trigger UI transition.
           // Listener will set isLoading=false
       } catch (error) {
           console.error("Error starting game:", error);
           toast({
               title: "Start Game Failed",
               description: "Could not start the game. Please try again.",
               variant: "destructive",
           });
           setGameMessage(`Failed to start game. Waiting for players...`);
           setIsLoading(false); // Stop loading only on error
       }
       // setIsLoading handled by listener transition or error
   };

    // --- Full Reset Function ---
    const handleResetAndEnterName = () => {
        // Leave room if currently in one (without clearing storage yet)
        if (currentRoomCode && playerId) {
             // Using handleLeaveRoom will attempt backend update, which might be slow/unnecessary here.
             // Just reset local state and clear storage.
             console.log("Resetting: Clearing local state and storage.");
        }

        // Clear all relevant local storage
        if (typeof window !== 'undefined') {
            localStorage.removeItem(LS_PLAYER_NAME);
            localStorage.removeItem(LS_PLAYER_ID);
            localStorage.removeItem(LS_GAME_STAGE);
            localStorage.removeItem(LS_CURRENT_ROOM_CODE);
            console.log("Cleared all game state from localStorage.");
        }

        // Detach listener if active
         if (unsubscribeRef.current) {
             console.log("Detaching listener during full reset.");
             unsubscribeRef.current();
             unsubscribeRef.current = null;
         }


        // Reset local state variables
        setPlayerName('');
        setPlayerId(null); // Will trigger regeneration in initial useEffect
        setGameStage('enterName');
        setCurrentRoomCode(null);
        setRoomData(null);
        setGameMessage('Enter your name to start.');
        setIsLoading(false); // Ensure loading is off
        setIsLoadedFromStorage(false); // Reset storage loaded flag
        setIsCreating(false);
        setIsJoining(false);
        setIsLeaving(false);
        setIsEnding(false);

        // Regenerate player ID immediately if needed
        if (typeof window !== 'undefined' && !localStorage.getItem(LS_PLAYER_ID)) {
             const newPlayerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
             setPlayerId(newPlayerId);
             localStorage.setItem(LS_PLAYER_ID, newPlayerId);
             console.log("Regenerated new playerId after reset:", newPlayerId);
        }
        // Mark as loaded from storage again to allow persistence useEffects to run correctly after reset
        setIsLoadedFromStorage(true);
    };


  // --- Render Logic ---
  const isActionLoading = isCreating || isJoining || isLeaving || isEnding || isLoading;

  // Initial loading screen while restoring state or if hydration warning suppression is needed
   if (!isLoadedFromStorage) { // Only show initial load screen before storage is checked
     return (
       <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
         <Loader2 className="h-16 w-16 animate-spin text-primary" />
         <p className="mt-4 text-lg text-muted-foreground">Loading game...</p>
       </div>
     );
   }


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
                disabled={!playerId} // Should be enabled quickly after initial load
              />
            </div>
            <Button type="submit" className="w-full text-lg py-3" size="lg" disabled={isActionLoading || !playerName.trim() || !playerId}>
               {(!playerId) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {/* Show loader only if playerId isn't ready */}
              Enter Lobby
            </Button>
            {!playerId && <p className="text-sm text-center text-muted-foreground pt-2">Initializing...</p>}
            {gameMessage && gameMessage.includes('valid name') && <p className="text-sm text-center text-destructive pt-2">{gameMessage}</p>}
             {/* Button to fully reset state */}
             <Button variant="link" size="sm" onClick={handleResetAndEnterName} disabled={isActionLoading}>
                 Reset / Change Name
             </Button>
          </form>
        </CardContent>
      </UICard>
    </div>
  );

  const renderLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
      <UICard className="w-full max-w-md shadow-2xl">
        <CardHeader>
          {/* Display name might be loading briefly */}
          <CardTitle className="text-3xl font-bold text-primary text-center">Welcome, {playerName || '...'}!</CardTitle>
          <UICardDescription className="text-center text-muted-foreground pt-2 min-h-[20px]">
             {/* Show general loading indicator if any major action is in progress */}
             {(isLoading || isCreating || isJoining) ? <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> : null}
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
                 {/* No spinner here, spinner shows on submit */}
                 <UserPlus className="mr-2" /> Join Game
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
                    disabled={isJoining} // Disable only while the join request is active
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isJoining}>Cancel</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isJoining || !joinRoomCode.trim()}>
                     {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     Join Game
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Change Name button - now uses the full reset */}
          <Button variant="link" size="sm" onClick={handleResetAndEnterName} disabled={isActionLoading}>
             Change Name / Reset
          </Button>
        </CardContent>
      </UICard>
    </div>
  );

  const renderGameLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
      <UICard className="w-full max-w-lg shadow-2xl relative">
        {currentRoomCode && (
          <div className="absolute top-4 right-4 flex items-center space-x-2 z-10">
            <Badge variant="secondary" className="text-lg px-3 py-1 font-mono tracking-widest">{currentRoomCode}</Badge>
            <Button variant="ghost" size="icon" onClick={handleCopyToClipboard} className="h-8 w-8 text-muted-foreground hover:text-primary" disabled={isActionLoading || hasCopied} title="Copy Room Code">
              {hasCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              <span className="sr-only">Copy Room Code</span>
            </Button>
          </div>
        )}
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary text-center">Game Lobby</CardTitle>
           <UICardDescription className="text-center text-muted-foreground pt-2 min-h-[20px]">
             {/* Show loading if explicitly loading OR if roomData hasn't arrived yet and we expect it */}
             {(isLoading && (!roomData || roomData.players.length === 0)) ? <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> : null}
             {gameMessage}
          </UICardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-secondary mb-3 text-center">Players ({roomData?.players?.length ?? 0} / 4)</h3> {/* Assuming max 4 */}
            <div className="max-h-60 overflow-y-auto px-2 border rounded-md bg-muted/20 py-2">
              <ul className="space-y-2 text-center">
                {/* Show loading indicator inside list ONLY when loading AND no data */}
                {isLoading && (!roomData || roomData.players.length === 0) ? (
                    <li className="text-lg text-muted-foreground italic p-2"> <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> Loading players...</li>
                ) : roomData?.players?.length ? (
                  roomData.players.map((player) => (
                    <li key={player.id} className="text-lg text-foreground p-2 bg-muted/30 rounded-md truncate flex items-center justify-center space-x-2">
                       {player.id === roomData.hostId && <Crown size={18} className="text-accent inline-block" aria-label="Host"/>}
                       <span>{player.name}</span>
                       {playerId && player.id === playerId && <span className="text-primary font-semibold ml-1">(You)</span>}
                    </li>
                  ))
                ) : (
                   /* Show "Waiting..." only if not loading and no players */
                   !isLoading && <li className="text-lg text-muted-foreground italic p-2">Waiting for players...</li>
                )}
                 {/* Placeholder slots */}
                 {roomData && roomData.players.length < 4 && Array.from({ length: 4 - roomData.players.length }).map((_, i) => (
                     <li key={`waiting-${i}`} className="text-lg text-muted-foreground italic p-2 bg-muted/10 rounded-md">
                         Waiting for player...
                     </li>
                 ))}
              </ul>
            </div> {/* End player list container */}
          </div>

          <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-4 pt-4">
            {playerId && roomData?.hostId === playerId && (
              <Button
                className="text-lg py-3 px-6 w-full sm:w-auto"
                size="lg"
                disabled={isActionLoading || (roomData?.players?.length ?? 0) < 2}
                onClick={handleStartGame}
              >
                {/* Show general loading spinner if starting */}
                {isLoading && gameMessage.startsWith("Starting game...") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2"/>}
                Start Game
              </Button>
            )}
            <Button
               onClick={handleLeaveRoom} // Use the unified leave function
               className="text-lg py-3 px-6 w-full sm:w-auto"
               size="lg"
               variant="outline"
               disabled={isLeaving || isLoading} // Disable if leaving or general loading
            >
               {isLeaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2" />}
               Leave Lobby
            </Button>
          </div>
        </CardContent>
      </UICard>
    </div>
  );

  // --- Game View ---
 const renderGame = () => {
   if (!roomData || !playerId || !playerName) return null; // Should be handled by the switch, but safe check

   const numPlayers = roomData.players.length;
   const currentPlayerIndex = roomData.players.findIndex(p => p.id === playerId);
   if (currentPlayerIndex === -1) {
        // This case should ideally be caught by the listener redirecting to lobby
        console.error("Current player not found in game room data!");
        // Maybe force a redirect here as a fallback
        resetToLobby("Error: Not found in game.");
        return null;
   }


   const getPlayerPosition = (index: number, totalPlayers: number, currentIndex: number) => {
       const positionIndex = (index - currentIndex + totalPlayers) % totalPlayers;
       const angleIncrement = 360 / totalPlayers;
       let angle = 180 - (positionIndex * angleIncrement); // Start from bottom (180 deg) and go counter-clockwise

       // Adjust angle slightly for better layout near top/bottom if needed
       if (totalPlayers > 2) {
            if (positionIndex === 0) angle = 180; // Current player always at bottom center
            else if (positionIndex === Math.floor(totalPlayers / 2) && totalPlayers % 2 === 0) angle = 0; // Player opposite at top center (for even players)
            else if (positionIndex === Math.ceil(totalPlayers / 2) && totalPlayers > 2) angle = 0; // Top player for odd > 2
       } else if (totalPlayers === 2) {
           if (positionIndex === 0) angle = 180; // Bottom
           if (positionIndex === 1) angle = 0;   // Top
       }


       // Convert angle to radians for trig functions
       const angleRad = angle * (Math.PI / 180);

       // Calculate position based on ellipse (adjust rx, ry for desired shape)
       const rx = 40; // Horizontal radius percentage
       const ry = 35; // Vertical radius percentage increased slightly
       const x = 50 + rx * Math.cos(angleRad); // Center X + radius * cos(angle)
       const y = 50 + ry * Math.sin(angleRad); // Center Y + radius * sin(angle)

       return {
           left: `${x}%`,
           top: `${y}%`,
           transform: `translate(-50%, -50%)`, // Center the element
       };
   };

   const renderPlayerSeat = (player: Player, index: number) => {
     const positionStyle = getPlayerPosition(index, numPlayers, currentPlayerIndex);
     const isCurrentUser = player.id === playerId;
     const playerHand = roomData.playerHands ? roomData.playerHands[player.id] : [];

     return (
       <div
         key={player.id}
         className={`absolute p-2 rounded-lg shadow-md flex flex-col items-center min-w-[120px] ${isCurrentUser ? 'bg-primary/20 border-2 border-primary' : 'bg-card/90'}`}
         style={positionStyle}
       >
         <span className={`font-semibold truncate max-w-[100px] ${isCurrentUser ? 'text-primary-foreground' : 'text-card-foreground'}`}>
             {player.id === roomData.hostId && <Crown size={16} className="text-accent inline-block mr-1 mb-0.5" aria-label="Host"/>}
             {player.name} {isCurrentUser ? '(You)' : ''}
         </span>
         {/* Placeholder for cards - Render facedown for opponents, faceup for current player */}
         <div className="flex mt-1 space-x-[-25px] justify-center min-h-[60px] items-center px-1">
            {playerHand && playerHand.length > 0 ? (
                playerHand.map((card, cardIndex) => (
                   <CardComponent
                       key={`${player.id}-card-${cardIndex}`}
                       card={isCurrentUser ? card : null} // Show card details only for current user
                       isFaceDown={!isCurrentUser} // Face down for others
                       style={{ zIndex: cardIndex }} // Basic overlap effect
                   />
                ))
            ) : (
                 // Show card backs representing hand size for opponents, or empty state
                 isCurrentUser ? (
                     <div className="text-xs text-muted-foreground italic mt-1">Empty Hand</div>
                 ) : (
                      // Simulate hand size with face-down cards (using deck size for now as placeholder)
                      Array.from({ length: roomData.deck ? Math.floor(52 / numPlayers) : 3 }).map((_, i) => ( // Placeholder length
                          <CardComponent key={`${player.id}-facedown-${i}`} card={null} isFaceDown={true} style={{ zIndex: i }} />
                      ))
                 )
            )}

         </div>
       </div>
     );
   };

   return (
     <div className="flex flex-col h-screen bg-gradient-to-br from-background to-card p-4 relative overflow-hidden">
       {/* Game Info Header */}
       <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-20 p-2 bg-card/80 rounded-lg shadow">
           <Badge variant="secondary">Room: {currentRoomCode}</Badge>
           <div className="text-center">
               <h2 className="text-xl font-bold text-primary">Judgement</h2>
               <p className="text-sm text-muted-foreground">Round {roomData.currentRound ?? 'N/A'}</p>
               {/* Add more info: Trump, Bids, Scores */}
           </div>
           <div className="space-x-2">
             {/* Leave Game Button */}
             <Button variant="outline" size="sm" onClick={handleLeaveRoom} disabled={isActionLoading}>
                  {isLeaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Leave Game
              </Button>
             {/* End Game Button (Host Only) */}
             {playerId === roomData.hostId && (
                  <Button variant="destructive" size="sm" onClick={handleEndGame} disabled={isActionLoading}>
                      {isEnding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      End Game
                  </Button>
             )}
           </div>
       </div>

       {/* Game Table Area */}
       <div className="flex-grow flex items-center justify-center mt-[70px] mb-[60px]"> {/* Adjust margins for header/footer */}
         <div className="relative w-[85vw] h-[70vh] border-4 border-primary/50 rounded-[50%] bg-gradient-radial from-card via-card/80 to-transparent shadow-xl"> {/* Gradient background */}
           {/* Center Area for Deck/Played Cards */}
           <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center space-y-2 z-10">
                {/* Deck pile */}
               <div className="relative flex items-center justify-center w-18 h-26">
                   {roomData.deck && roomData.deck.length > 0 ? (
                       // Show top card face down
                      <CardComponent card={null} isFaceDown={true} />
                   ) : (
                       <div className="w-16 h-24 border-2 border-dashed border-muted-foreground rounded flex items-center justify-center text-muted-foreground text-xs">Deck Empty</div>
                   )}
                   {/* Deck count badge */}
                  {roomData.deck && roomData.deck.length > 0 && (
                     <Badge variant="secondary" className="absolute -top-2 -right-2 px-1.5 py-0.5 text-xs">
                         {roomData.deck?.length ?? 0}
                     </Badge>
                   )}

               </div>
               <span className="text-xs text-muted-foreground mt-1">Deck</span>
               {/* TODO: Add area for played cards (trick pile) */}
           </div>

           {/* Player Seats */}
           {roomData.players.map((player, index) => renderPlayerSeat(player, index))}

         </div>
       </div>

       {/* Current Player's Hand Area (fixed at bottom) */}
       <div className="absolute bottom-0 left-0 right-0 p-4 bg-card/80 shadow-inner z-20 flex flex-col items-center">
          <span className="text-lg font-bold text-primary mb-2">{playerName} (You)</span>
          <div className="flex space-x-[-35px] justify-center items-end h-[110px]"> {/* Adjust height as needed */}
              {roomData.playerHands && roomData.playerHands[playerId] && roomData.playerHands[playerId].length > 0 ? (
                  roomData.playerHands[playerId].map((card, index) => (
                      <CardComponent
                         key={`my-card-${index}`}
                         card={card}
                         isFaceDown={false}
                         style={{ zIndex: index }}
                         className="hover:-translate-y-2 transition-transform duration-150 cursor-pointer" // Add hover effect
                         // onClick={() => handlePlayCard(card)} // TODO: Add play card logic
                      />
                  ))
              ) : (
                  <div className="text-muted-foreground italic text-center w-full">Your hand is empty</div>
              )}
          </div>
           {/* TODO: Add Bid/Play action buttons here */}
       </div>
     </div>
   );
 };


  // --- Stage Switching Logic ---

  // Handle initial loading state more cleanly
   if (!isLoadedFromStorage) {
     return (
       <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
         <Loader2 className="h-16 w-16 animate-spin text-primary" />
         <p className="mt-4 text-lg text-muted-foreground">Loading game...</p>
       </div>
     );
   }

  switch (gameStage) {
    case 'enterName':
      // If somehow name is already set, but stage is enterName, move to lobby
      if (playerName && playerId) {
          console.warn("In enterName stage but playerName exists, redirecting to lobby.");
          // Ensure stage is actually changed
          if (gameStage !== 'lobby') {
             setGameStage('lobby');
             setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
          }
          // Render lobby directly if state update is synchronous enough, or return loading/null
          return renderLobby(); // Assuming state updates reasonably quickly
      }
      return renderEnterName();
    case 'lobby':
       // Ensure player name and ID are set before showing lobby
       if (!playerName || !playerId) {
           console.warn("Attempted to render lobby without name or ID. Redirecting to enterName.");
           handleResetAndEnterName(); // Use the reset function to ensure clean state
           return renderEnterName(); // Show enter name screen after reset
       }
       return renderLobby();
    case 'gameLobby':
       // Ensure core data is present for game lobby
        if (!playerName || !playerId || !currentRoomCode) {
            console.warn("Attempted to render gameLobby without necessary data. Redirecting to lobby.");
            resetToLobby(playerName ? `Welcome back, ${playerName}! Please rejoin or create a game.` : 'Please enter your name.');
            return renderLobby(); // Show lobby after reset
        }
       // Listener handles transition to 'game' and potential kick/redirect
       return renderGameLobby();
    case 'game':
       // Ensure core data is present for game
       if (!roomData || !currentRoomCode || !playerId || !playerName) {
           console.warn("Attempted to render game stage without necessary data. Redirecting to lobby.");
           resetToLobby(playerName ? `Welcome back, ${playerName}! Please rejoin or create a game.` : 'Please enter your name.');
           return renderLobby(); // Show lobby after reset
       }
       // Check if current player is actually part of this game room (using latest roomData)
       if (!roomData.players.some(p => p.id === playerId)) {
           console.warn(`Player ${playerId} (${playerName}) is not in room ${currentRoomCode}. Redirecting.`);
            toast({ title: "Not in Room", description: "You were removed or the game changed.", variant: "destructive"});
            resetToLobby(playerName ? `Welcome back, ${playerName}! Please rejoin or create a game.` : 'Please enter your name.');
            return renderLobby(); // Show lobby after reset
       }
       return renderGame();
    default:
      console.error("Unrecognized game stage:", gameStage, "Resetting to enterName.");
      handleResetAndEnterName();
      return renderEnterName(); // Show enter name after full reset
  }
}

