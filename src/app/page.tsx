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

// Game stages: 'enterName' -> 'lobby' -> 'gameLobby' -> 'game' (future)
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
  // Add more game state properties later
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
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start loading until state is restored
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isLeaving, setIsLeaving] = useState<boolean>(false);
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
          setGameMessage(`Reconnecting to lobby ${savedRoomCode}...`);
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

    if (unsubscribeRef.current) {
      console.log("Cleaning up existing Firestore listener.");
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    // Don't clear roomData here immediately, let the listener handle updates or non-existence
    // setRoomData(null); // Clear data when listener might change (REMOVED - causes flicker on reload)

    if ((gameStage === 'gameLobby' || gameStage === 'game') && currentRoomCode) {
      // Show loading only if we don't have roomData yet for this room
      if (!roomData) setIsLoading(true);
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
               // Current player is no longer in this room (e.g., kicked, left on another device)
               console.warn(`Player ${playerId} no longer in room ${currentRoomCode}. Redirecting to lobby.`);
               toast({ title: "Removed from Lobby", description: `You are no longer in lobby ${currentRoomCode}.`, variant: "destructive" });
               setGameStage('lobby');
               setCurrentRoomCode(null);
               setRoomData(null); // Clear stale data
               // localStorage updates happen via state change useEffects
               setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
               setIsLoading(false);
               return; // Stop further processing for this snapshot
          }

          if (data.gameStarted && gameStage !== 'game') {
              console.log(`Game started detected in room ${currentRoomCode}. Transitioning to 'game' stage.`);
              setGameStage('game'); // This will persist via useEffect
              setGameMessage(`Game in progress in room ${currentRoomCode}!`);
          } else if (!data.gameStarted && gameStage === 'game') {
              // Game somehow ended or reset while we were in 'game' stage
              console.log(`Game no longer marked as started in room ${currentRoomCode}. Returning to 'gameLobby'.`);
              setGameStage('gameLobby'); // Move back to lobby
               // Set message based on host status (using updated data)
              if (playerId === data.hostId) {
                  setGameMessage(`Share code ${currentRoomCode} to invite players! Waiting for players...`);
              } else {
                  setGameMessage(`Joined lobby ${currentRoomCode}. Waiting for host "${data.hostName}" to start...`);
              }
          } else if (gameStage === 'gameLobby') { // Only update lobby message if still in lobby
               // Set message based on host status (using updated data)
              if (playerId === data.hostId) {
                  setGameMessage(`Share code ${currentRoomCode} to invite players! Waiting for players...`);
              } else {
                  setGameMessage(`Joined lobby ${currentRoomCode}. Waiting for host "${data.hostName}" to start...`);
              }
          } else if (gameStage === 'game') {
               // Update message for ongoing game if needed (e.g., round number)
               setGameMessage(`Game in progress! Round ${data.currentRound || 'N/A'}`);
          }

        } else {
          // Room deleted or doesn't exist anymore
          console.log(`Room ${currentRoomCode} not found or deleted.`);
          // Only show toast and reset if we were actively supposed to be in that room
          if (gameStage === 'gameLobby' || gameStage === 'game') {
              toast({
                title: "Lobby Closed",
                description: `Lobby ${currentRoomCode} is no longer available.`,
                variant: "destructive",
              });
              setGameStage('lobby'); // Go back to lobby selection
              setCurrentRoomCode(null);
              setRoomData(null); // Clear stale data
              // localStorage updates happen via state change useEffects
              setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
          }
        }
         setIsLoading(false); // Stop loading after data is fetched/updated or determined non-existent
      }, (error) => {
        console.error("Error listening to room changes:", error);
        toast({
          title: "Connection Error",
          description: "Could not sync lobby data. Please check your connection.",
          variant: "destructive",
        });
        // Attempt to reset to a safe state
        if (gameStage === 'gameLobby' || gameStage === 'game') {
             setGameStage('lobby');
             setCurrentRoomCode(null);
             setRoomData(null);
             setGameMessage(`Welcome back, ${playerName}! Error connecting to lobby.`);
        }
        setIsLoading(false);
      });

    } else {
        // Not in gameLobby or game stage, ensure loading is off
        setIsLoading(false);
        // If there's an active listener for some reason, clean it up
        if (unsubscribeRef.current) {
            console.log("Detaching listener as no longer in gameLobby/game stage.");
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
    }

    // Cleanup: Ensure listener is removed when dependencies change or component unmounts.
    return () => {
      if (unsubscribeRef.current) {
        console.log("Running cleanup: Unsubscribing from Firestore listener for room:", currentRoomCode);
        unsubscribeRef.current();
        unsubscribeRef.current = null; // Clear the ref
      }
    };
    // Dependencies: stage, room code, player ID, isLoadedFromStorage (to ensure it runs after restoration)
  }, [gameStage, currentRoomCode, playerId, isLoadedFromStorage, toast, playerName, roomData]); // Added playerName, roomData


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
      setIsLoading(true);

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
          setHasCopied(false);
          toast({
              title: "Lobby Created!",
              description: `Room code: ${newRoomCode}`,
          });
          // Message will be set by the listener

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
      } finally {
          setIsCreating(false);
          // setIsLoading will be turned off by the listener or if creation failed early
          if (!currentRoomCode && gameStage !== 'gameLobby') {
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

    setIsJoining(true);
    setIsLoading(true);
    setGameMessage(`Attempting to join lobby ${codeToJoin}...`);
    setIsJoinGameDialogOpen(false);

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
        setJoinRoomCode('');
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
      // setIsLoading handled by listener or error case
       if (!currentRoomCode && gameStage !== 'gameLobby') {
         setIsLoading(false);
       }
    }
  };

    // --- Game Lobby Actions ---
    const handleLeaveLobby = async (options: { clearLocalStorage?: boolean } = {}) => {
      const { clearLocalStorage = false } = options;
      if (!currentRoomCode || !playerId) return;

      setIsLeaving(true);
      setIsLoading(true);
      setGameMessage("Leaving lobby...");

      const roomRef = doc(db, 'rooms', currentRoomCode);
      const leavingPlayerId = playerId;
      const leavingPlayerName = playerName;
      const leavingRoomCode = currentRoomCode; // Capture code before resetting
       // Check host status based on potentially stale local data (best effort before transaction)
      const wasHost = roomData?.hostId === leavingPlayerId;

      // Immediately stop listening
      if (unsubscribeRef.current) {
          console.log("Detaching listener before leaving lobby action for room:", leavingRoomCode);
          unsubscribeRef.current();
          unsubscribeRef.current = null;
      }

      // Optimistically update local state first for faster UI response
      setGameStage('lobby');
      setCurrentRoomCode(null);
      setRoomData(null); // Clear local room data
      setGameMessage(`Welcome back, ${leavingPlayerName}! Create a game or join one.`);
      // Clear relevant localStorage items if requested (e.g., for a full logout/reset)
      if (clearLocalStorage && typeof window !== 'undefined') {
           localStorage.removeItem(LS_GAME_STAGE);
           localStorage.removeItem(LS_CURRENT_ROOM_CODE);
           // Optionally keep player name/ID? Or remove them too?
           // localStorage.removeItem(LS_PLAYER_NAME);
           // localStorage.removeItem(LS_PLAYER_ID);
           console.log("Cleared game stage and room code from localStorage.");
      }


      try {
          await runTransaction(db, async (transaction) => {
             const docSnap = await transaction.get(roomRef);
             if (!docSnap.exists()) {
                 console.log("Room already deleted or not found while trying to leave. No backend action needed.");
                 return; // Exit transaction
             }

             const currentData = docSnap.data() as RoomData;

             // Double-check host status with fresh data
             const isActuallyHost = currentData.hostId === leavingPlayerId;

             if (isActuallyHost) {
                  // Host leaving: Delete the room document
                  console.log(`Host ${leavingPlayerName} (${leavingPlayerId}) leaving, deleting room ${leavingRoomCode}.`);
                  transaction.delete(roomRef);
             } else {
                  // Regular player leaving: Remove from players array
                  const updatedPlayers = currentData.players.filter(p => p.id !== leavingPlayerId);
                  if (updatedPlayers.length < currentData.players.length) {
                      console.log(`${leavingPlayerName} (${leavingPlayerId}) leaving lobby ${leavingRoomCode}. Updating players array.`);
                      transaction.update(roomRef, { players: updatedPlayers });
                  } else {
                       console.log(`${leavingPlayerName} (${leavingPlayerId}) was not found in the players list of room ${leavingRoomCode}. No backend update needed.`);
                  }
             }
          });

          // Transaction successful (or room didn't exist)
          // Toast based on the initial check (wasHost) for user feedback consistency
          if (wasHost) {
               toast({
                   title: "Lobby Closed",
                   description: "You left the lobby as the host, closing it.",
               });
          } else {
               toast({
                   title: "Left Lobby",
                   description: `You have left lobby ${leavingRoomCode}.`,
               });
          }

      } catch (error) {
          console.error("Error performing leave lobby transaction:", error);
          toast({
              title: "Leave Error",
              description: "Could not update the lobby on the server. You have left locally.",
              variant: "destructive",
          });
          // Local state is already reset, so just inform the user
      } finally {
          // Reset loading states regardless of transaction outcome
          setIsLeaving(false);
          setIsLoading(false);
      }
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
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
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


  // --- Game Logic Placeholders ---
  const handleStartGame = async () => {
       if (!currentRoomCode || !roomData || !playerId || roomData.hostId !== playerId) {
           toast({ title:"Action Denied", description: "Only the host can start the game.", variant: "destructive"});
           return;
       }
       if (roomData.players.length < 2) {
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
           // TODO: Game Initialization Logic (shuffle, deal, set round, etc.)
           await updateDoc(roomRef, {
               gameStarted: true,
               currentRound: 1,
               // ... other initial game state ...
           });

           console.log(`Game started flag set in room ${currentRoomCode} by host ${playerName} (${playerId})`);
           // Listener will detect gameStarted: true and trigger UI transition.
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
        // Leave lobby if currently in one (without clearing storage yet)
        if (currentRoomCode && playerId) {
             handleLeaveLobby({ clearLocalStorage: false }); // Leave backend, keep localstorage for name/id
        }

        // Clear all relevant local storage
        if (typeof window !== 'undefined') {
            localStorage.removeItem(LS_PLAYER_NAME);
            localStorage.removeItem(LS_PLAYER_ID);
            localStorage.removeItem(LS_GAME_STAGE);
            localStorage.removeItem(LS_CURRENT_ROOM_CODE);
            console.log("Cleared all game state from localStorage.");
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

        // Regenerate player ID immediately if needed
        if (typeof window !== 'undefined' && !localStorage.getItem(LS_PLAYER_ID)) {
             const newPlayerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
             setPlayerId(newPlayerId);
             localStorage.setItem(LS_PLAYER_ID, newPlayerId);
             console.log("Regenerated new playerId after reset:", newPlayerId);
        }
        // Reload might be too disruptive, let the state reset handle it.
        // window.location.reload();
    };


  // --- Render Logic ---
  const isActionLoading = isCreating || isJoining || isLeaving || isLoading;

  // Initial loading screen while restoring state
   if (!isLoadedFromStorage && typeof window !== 'undefined') {
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
               {/* Use a more specific loading state if needed, or just isActionLoading */}
               {(!playerId || (isActionLoading && !isCreating && !isJoining)) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
             {/* Show general loading indicator if any action is in progress */}
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
                 {/* Show joining spinner only when actually joining */}
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
                    style={{ textTransform: 'uppercase' }}
                    disabled={isJoining} // Disable only when joining
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
             {/* Show loading if explicitly loading OR if roomData hasn't arrived yet */}
             {(isLoading && !roomData) ? <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> : null}
             {gameMessage}
          </UICardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-secondary mb-3 text-center">Players ({roomData?.players?.length ?? 0})</h3>
            <div className="max-h-60 overflow-y-auto px-2 border rounded-md bg-muted/20 py-2">
              <ul className="space-y-2 text-center">
                {/* Show loading indicator inside list ONLY when loading AND no data */}
                {isLoading && !roomData ? (
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
                {/* Show loading specific to starting game OR general loading */}
                {(isLoading && gameMessage === "Starting game...") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2"/>}
                Start Game
              </Button>
            )}
            <Button
               onClick={() => handleLeaveLobby()} // No options needed for normal leave
               className="text-lg py-3 px-6 w-full sm:w-auto"
               size="lg"
               variant="outline"
               disabled={isLeaving} // Disable specifically when leaving
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
                Players: {roomData?.players?.map(p => p.name).join(', ') ?? 'Loading...'}
             </UICardDescription>
          </CardHeader>
          <CardContent>
             <p className="text-center p-8 text-lg">Game content placeholder...</p>
             <p className="text-center text-muted-foreground">Current Round: {roomData?.currentRound ?? 'N/A'}</p>
             <div className="flex justify-center mt-4 space-x-4">
                {playerId && roomData?.hostId === playerId && (
                     <Button variant="destructive" onClick={() => alert("End game logic needed")} disabled={isLoading}>
                         {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                         End Game (Host)
                     </Button>
                )}
                 <Button variant="outline" onClick={() => alert("Leave game logic needed - Careful!")} disabled={isLoading}>
                     {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     Leave Game
                 </Button>
             </div>
          </CardContent>
        </UICard>
     </div>
   );


  // --- Stage Switching Logic ---

  // Handle initial state before hydration / storage load is complete
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
          setGameStage('lobby');
          setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
          // Let the switch re-render in the next cycle
          return null; // Or render lobby directly: return renderLobby();
      }
      return renderEnterName();
    case 'lobby':
       // Ensure player name and ID are set before showing lobby
       if (!playerName || !playerId) {
           console.warn("Attempted to render lobby without name or ID. Redirecting to enterName.");
           handleResetAndEnterName(); // Use the reset function to ensure clean state
           return renderEnterName();
       }
       return renderLobby();
    case 'gameLobby':
       // Ensure core data is present for game lobby
        if (!playerName || !playerId || !currentRoomCode) {
            console.warn("Attempted to render gameLobby without necessary data. Redirecting to lobby.");
            setGameStage('lobby');
            setCurrentRoomCode(null);
            setRoomData(null);
            setGameMessage(playerName ? `Welcome back, ${playerName}! Please rejoin or create a game.` : 'Please enter your name.');
            // LocalStorage updates handled by useEffect
            return renderLobby();
        }
       // Listener handles transition to 'game'
       return renderGameLobby();
    case 'game':
       // Ensure core data is present for game
       if (!roomData || !currentRoomCode || !playerId || !playerName) {
           console.warn("Attempted to render game stage without necessary data. Redirecting to lobby.");
           setGameStage('lobby');
           setCurrentRoomCode(null);
           setRoomData(null);
           setGameMessage(playerName ? `Welcome back, ${playerName}! Please rejoin or create a game.` : 'Please enter your name.');
           // LocalStorage updates handled by useEffect
           return renderLobby();
       }
       // Check if current player is actually part of this game room (using latest roomData)
       if (!roomData.players.some(p => p.id === playerId)) {
           console.warn(`Player ${playerId} (${playerName}) is not in room ${currentRoomCode}. Redirecting.`);
            toast({ title: "Not in Room", description: "You were removed or the game changed.", variant: "destructive"});
            setGameStage('lobby');
            setCurrentRoomCode(null);
            setRoomData(null);
            setGameMessage(playerName ? `Welcome back, ${playerName}! Please rejoin or create a game.` : 'Please enter your name.');
            // LocalStorage updates handled by useEffect
            return renderLobby();
       }
       return renderGame();
    default:
      console.warn("Unrecognized game stage:", gameStage, "Resetting to enterName.");
      handleResetAndEnterName();
      return renderEnterName();
  }
}
