
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
import { Card, PlayerHands, Suit, Rank, suitOrder, rankOrder } from '@/types/cards'; // Import card types and hand structure
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
  deck?: Card[]; // The current state of the deck in the center (usually empty after dealing)
  playerHands?: PlayerHands; // Use the specific type for hands
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
  const [tempPlayerName, setTempPlayerName] = useState<string>(''); // Temporary state for input
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
  const [isStartingGame, setIsStartingGame] = useState<boolean>(false); // Specific loading for starting game
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

      let activePlayerId = savedPlayerId;
      if (!activePlayerId) {
        activePlayerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        localStorage.setItem(LS_PLAYER_ID, activePlayerId);
        console.log("Generated new playerId:", activePlayerId);
      }
      setPlayerId(activePlayerId);
      if(savedPlayerId) console.log("Restored playerId:", activePlayerId);


      if (savedPlayerName) {
        setPlayerName(savedPlayerName);
        setTempPlayerName(savedPlayerName); // Also set temp name for input field consistency if needed
        console.log("Restored playerName:", savedPlayerName);
      }

      let currentStage: GameStage = 'enterName'; // Default stage

      if (savedGameStage) {
         // Stage-specific restoration logic
         if ((savedGameStage === 'gameLobby' || savedGameStage === 'game') && savedPlayerName && activePlayerId && savedRoomCode) {
              currentStage = savedGameStage;
              setCurrentRoomCode(savedRoomCode);
              console.log("Restoring stage:", currentStage, "and roomCode:", savedRoomCode);
         } else if (savedGameStage === 'lobby' && savedPlayerName && activePlayerId) {
              currentStage = 'lobby';
              console.log("Restoring stage: lobby");
         } else if (savedGameStage === 'enterName') {
              if (savedPlayerName && activePlayerId) {
                  // Has name but stuck on enterName? Move to lobby.
                  currentStage = 'lobby';
                  console.warn("Restored 'enterName' stage but playerName exists, moving to 'lobby'.");
                  localStorage.setItem(LS_GAME_STAGE, 'lobby'); // Correct storage
              } else {
                  currentStage = 'enterName';
                  console.log("Restoring stage: enterName");
              }
         } else {
             // Fallback if saved stage is invalid or inconsistent with other data
              currentStage = savedPlayerName ? 'lobby' : 'enterName';
              console.warn("Inconsistent state found in localStorage, resetting to stage:", currentStage);
              localStorage.setItem(LS_GAME_STAGE, currentStage);
              localStorage.removeItem(LS_CURRENT_ROOM_CODE); // Clean up room code if state is inconsistent
              setCurrentRoomCode(null);
         }
      } else {
          // No stage saved, determine based on whether name exists
          currentStage = savedPlayerName ? 'lobby' : 'enterName';
          localStorage.setItem(LS_GAME_STAGE, currentStage);
          console.log(`No gameStage found, defaulting to ${currentStage}.`);
      }

      setGameStage(currentStage); // Set the determined stage


      // Set messages based on restored state
      if (currentStage === 'lobby' && savedPlayerName) {
          setGameMessage(`Welcome back, ${savedPlayerName}! Create or join a game.`);
      } else if ((currentStage === 'gameLobby' || currentStage === 'game') && savedRoomCode) {
          setGameMessage(`Reconnecting to ${currentStage === 'gameLobby' ? 'lobby' : 'game'} ${savedRoomCode}...`);
      } else {
          setGameMessage('Enter your name to start.');
      }

      setIsLoadedFromStorage(true);
      setIsLoading(false);
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

    cleanupListener();

    if ((gameStage === 'gameLobby' || gameStage === 'game') && currentRoomCode) {
      if (!roomData || roomData.players.length === 0) setIsLoading(true);
      console.log(`Attaching Firestore listener for room: ${currentRoomCode}`);
      const roomRef = doc(db, 'rooms', currentRoomCode);

      unsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as RoomData;
          setRoomData(data);
          console.log("Received room update:", data);

          const currentPlayerInRoom = data.players.some(p => p.id === playerId);

          if (!currentPlayerInRoom && (gameStage === 'gameLobby' || gameStage === 'game')) {
               console.warn(`Player ${playerId} no longer in room ${currentRoomCode}. Redirecting to lobby.`);
               toast({ title: "Removed from Room", description: `You are no longer in room ${currentRoomCode}.`, variant: "destructive" });
               resetToLobby(`Welcome back, ${playerName}! Create or join a game.`);
               setIsLoading(false); // Ensure loading is off
               cleanupListener();
               return;
          }

          if (data.gameStarted && gameStage === 'gameLobby') {
              console.log(`Game started detected in room ${currentRoomCode}. Transitioning to 'game' stage.`);
              setGameStage('game');
              setGameMessage(`Game in progress in room ${currentRoomCode}! Round ${data.currentRound || 'N/A'}`);
          } else if (!data.gameStarted && gameStage === 'game') {
              console.log(`Game no longer marked as started in room ${currentRoomCode}. Returning to 'gameLobby'.`);
              toast({ title: "Game Ended", description: `The game in room ${currentRoomCode} has ended. Returning to lobby.` });
              setGameStage('gameLobby');
          }

           if (gameStage === 'gameLobby') {
               if (playerId === data.hostId) {
                   setGameMessage(`Share code ${currentRoomCode} to invite players! Waiting for players...`);
               } else {
                   setGameMessage(`Joined lobby ${currentRoomCode}. Waiting for host "${data.hostName}" to start...`);
               }
           } else if (gameStage === 'game') {
                setGameMessage(`Game in progress! Round ${data.currentRound || 'N/A'}`);
           }


        } else {
          console.log(`Room ${currentRoomCode} not found or deleted.`);
          if (gameStage === 'gameLobby' || gameStage === 'game') {
              toast({
                title: "Room Closed",
                description: `Room ${currentRoomCode} is no longer available.`,
                variant: "destructive",
              });
              resetToLobby(`Welcome back, ${playerName}! Create a game or join one.`);
              cleanupListener();
          }
        }
         setIsLoading(false);
      }, (error) => {
        console.error("Error listening to room changes:", error);
        toast({
          title: "Connection Error",
          description: "Could not sync room data. Please check your connection.",
          variant: "destructive",
        });
        if (gameStage === 'gameLobby' || gameStage === 'game') {
             resetToLobby(`Welcome back, ${playerName}! Error connecting to room.`);
             cleanupListener();
        }
        setIsLoading(false); // Ensure loading is off on error
        setIsCreating(false); // Reset specific loading flags on error
        setIsJoining(false);
      });

    } else {
        setIsLoading(false);
        cleanupListener();
    }

    return cleanupListener;
  }, [gameStage, currentRoomCode, playerId, isLoadedFromStorage, toast, playerName]); // Dependencies


  // --- Name Handling ---
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = tempPlayerName.trim();
    if (trimmedName && playerId) {
      setPlayerName(trimmedName); // Set the actual playerName state
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
              await new Promise(resolve => setTimeout(resolve, 50));
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
          playerHands: { [playerId]: [] },
          deck: [],
      };

      try {
          await setDoc(roomRef, initialRoomData);
          console.log(`Firestore document created for lobby ${newRoomCode} by host ${playerName} (${playerId}).`);

          setCurrentRoomCode(newRoomCode);
          setGameStage('gameLobby');
          setHasCopied(false);
          setIsCreating(false); // Turn off specific creating spinner
          toast({
              title: "Lobby Created!",
              description: `Room code: ${newRoomCode}`,
          });
          // Message and isLoading=false will be handled by the listener

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
          setIsCreating(false); // Stop creating spinner
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
                 if (currentRoomData.players.length >= 4) {
                    throw new Error("Lobby is full");
                 }
                 const updatedPlayers = [...currentRoomData.players, joiningPlayer];
                 const updatedPlayerHands: PlayerHands = { ...(currentRoomData.playerHands || {}), [playerId]: [] };
                 transaction.update(roomRef, {
                    players: updatedPlayers,
                    playerHands: updatedPlayerHands
                 });
                 console.log(`${playerName} (${playerId}) joining lobby ${codeToJoin}. Firestore update scheduled.`);
            } else {
                 console.log(`${playerName} (${playerId}) is already in lobby ${codeToJoin}. No Firestore update needed.`);
            }
        });

        setCurrentRoomCode(codeToJoin);
        setGameStage('gameLobby');
        setJoinRoomCode('');
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
        setIsStartingGame(false); // Ensure starting game state is off
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
                    return;
                }

                const currentData = docSnap.data() as RoomData;
                const isHostLeaving = currentData.hostId === playerIdToLeave;
                const players = currentData.players;
                const leavingPlayerIndex = players.findIndex(p => p.id === playerIdToLeave);

                if (isHostLeaving) {
                    console.log(`Host ${playerNameForLog} (${playerIdToLeave}) leaving, deleting room ${roomCode}.`);
                    transaction.delete(roomRef);
                } else if (leavingPlayerIndex !== -1) {
                    const updatedPlayers = players.filter(p => p.id !== playerIdToLeave);
                    const updatedPlayerHands = { ...(currentData.playerHands || {}) };
                    delete updatedPlayerHands[playerIdToLeave]; // Remove hand data

                    console.log(`${playerNameForLog} (${playerIdToLeave}) leaving room ${roomCode}. Updating players array and hands.`);
                    transaction.update(roomRef, {
                        players: updatedPlayers,
                        playerHands: updatedPlayerHands
                    });
                } else {
                    console.log(`${playerNameForLog} (${playerIdToLeave}) was not found in the players list of room ${roomCode}. No backend update needed.`);
                }
            });
            console.log(`Successfully processed leave action for ${playerNameForLog} in room ${roomCode}.`);
            return true;
        } catch (error) {
            console.error(`Error performing leave transaction for ${playerNameForLog} in room ${roomCode}:`, error);
            toast({
                title: "Leave Error",
                description: "Could not update the room on the server. You have left locally.",
                variant: "destructive",
            });
            return false;
        }
    };


    // --- Leave Lobby / Game Handler ---
    const handleLeaveRoom = async () => {
      if (!currentRoomCode || !playerId || !playerName) {
          console.warn("Attempted to leave room without necessary info.");
          return;
      }

      setIsLeaving(true);
      setIsLoading(true);
      const leavingRoomCode = currentRoomCode;
      const leavingPlayerId = playerId;
      const leavingPlayerName = playerName;
      const wasHost = roomData?.hostId === leavingPlayerId;
      const previousStage = gameStage;

      resetToLobby("Leaving room...");

      const success = await performLeaveTransaction(leavingRoomCode, leavingPlayerId, leavingPlayerName);

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

      resetToLobby(); // Set final message and turn off loaders
    };


     // --- Host End Game Handler ---
    const handleEndGame = async () => {
        if (!currentRoomCode || !playerId || !roomData || roomData.hostId !== playerId) {
            toast({ title: "Action Denied", description: "Only the host can end the game.", variant: "destructive" });
            return;
        }

        setIsEnding(true);
        setIsLoading(true);
        const endingRoomCode = currentRoomCode;
        const endingPlayerId = playerId;
        const endingPlayerName = playerName;
        console.log(`Host ${endingPlayerName} (${endingPlayerId}) initiating end game/close lobby for room ${endingRoomCode}.`);

        const roomRef = doc(db, 'rooms', endingRoomCode);
        try {
            await deleteDoc(roomRef);
            console.log(`Successfully deleted room ${endingRoomCode} by host action.`);
            resetToLobby(`You closed room ${endingRoomCode}.`);
            toast({
                title: roomData.gameStarted ? "Game Ended & Room Closed" : "Lobby Closed",
                description: `You closed room ${endingRoomCode}.`,
            });

        } catch (error) {
            console.error(`Error deleting room ${endingRoomCode} during end game action:`, error);
            toast({
                title: "End Game Failed",
                description: "Could not close the room on the server. Please try leaving manually.",
                variant: "destructive",
            });
             setIsEnding(false);
             setIsLoading(false);
             setGameMessage(`Error ending game. Try leaving manually.`);
        }
    };


  const handleCopyToClipboard = useCallback(async () => {
    if (!currentRoomCode) return;

    try {
        // Use the navigator.clipboard API which is generally preferred
        if (!navigator.clipboard) {
            // Fallback for older browsers or insecure contexts
            const textArea = document.createElement("textarea");
            textArea.value = currentRoomCode;
            textArea.style.position = "fixed"; // Prevent scrolling to bottom of page in MS Edge
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                const successful = document.execCommand('copy');
                if (!successful) throw new Error("Copy command failed");
                setHasCopied(true);
                toast({
                    title: "Copied!",
                    description: "Room code copied to clipboard.",
                });
                 setTimeout(() => setHasCopied(false), 2000);
            } catch (err) {
                 console.error('Fallback copy failed:', err);
                 throw new Error("Fallback copy failed"); // Re-throw to be caught below
            } finally {
                document.body.removeChild(textArea);
            }
            return;
        }

        await navigator.clipboard.writeText(currentRoomCode);
        setHasCopied(true);
        toast({
            title: "Copied!",
            description: "Room code copied to clipboard.",
        });
        setTimeout(() => setHasCopied(false), 2000);
    } catch (err: any) {
        console.error('Failed to copy room code:', err);
        let description = "Could not copy room code automatically. Please copy it manually.";
        // Check for specific errors related to clipboard permissions/availability
        if (typeof window !== 'undefined' && window.isSecureContext === false) {
            description = "Clipboard access requires a secure connection (HTTPS or localhost). Please copy the code manually.";
        } else if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
            description = "Clipboard access denied by browser settings or policy. Please copy the code manually.";
        } else if (err.message === "Clipboard API not available" || err.message === "Fallback copy failed") {
             description = "Clipboard API not available or fallback failed. Please copy the code manually."
        }

        toast({
            title: "Copy Failed",
            description: description,
            variant: "destructive",
        });
         setHasCopied(false);
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

       setIsStartingGame(true);
       setIsLoading(true);
       setGameMessage("Starting game... Preparing deck and dealing cards...");

       const roomRef = doc(db, 'rooms', currentRoomCode);
       try {
           const initialDeck = generateDeck();
           const adjustedDeck = adjustDeckForPlayers(initialDeck, numPlayers);
           const shuffledDeck = shuffleDeck(adjustedDeck);

           if (shuffledDeck.length % numPlayers !== 0) {
                throw new Error("Adjusted deck size is not divisible by the number of players.");
           }
           const cardsPerPlayer = shuffledDeck.length / numPlayers;

           console.log(`Starting game with ${numPlayers} players. Adjusted deck size: ${shuffledDeck.length}. Cards per player: ${cardsPerPlayer}`);

           const dealtHands: PlayerHands = {};
           const playerIds = roomData.players.map(p => p.id);

           playerIds.forEach(pId => {
               dealtHands[pId] = [];
           });

           for (let i = 0; i < shuffledDeck.length; i++) {
               const playerIndex = i % numPlayers;
               const currentPlayerId = playerIds[playerIndex];
               dealtHands[currentPlayerId].push(shuffledDeck[i]);
           }

           Object.values(dealtHands).forEach((hand, index) => {
                if (hand.length !== cardsPerPlayer) {
                    console.warn(`Warning: Hand size mismatch for player ${playerIds[index]} after dealing. Expected ${cardsPerPlayer}, got ${hand.length}.`);
                }
           });

           await updateDoc(roomRef, {
               gameStarted: true,
               currentRound: 1,
               deck: [],
               playerHands: dealtHands,
           });

           console.log(`Game started, cards dealt, and Firestore updated for room ${currentRoomCode} by host ${playerName} (${playerId})`);
           // Listener will detect gameStarted: true and trigger UI transition and set loading false.

       } catch (error: any) {
           console.error("Error starting game:", error);
           toast({
               title: "Start Game Failed",
               description: `Could not start the game. ${error.message || 'Please try again.'}`,
               variant: "destructive",
           });
           setGameMessage(`Failed to start game. Waiting for players...`);
           setIsLoading(false); // Stop loading only on error
           setIsStartingGame(false); // Turn off specific spinner on error
       } finally {
           setIsStartingGame(false); // Ensure spinner is off eventually. Loading controlled by listener on success.
       }
   };

    // --- Full Reset Function ---
    const handleResetAndEnterName = () => {
        if (currentRoomCode && playerId && playerName) {
             console.log("Resetting: Attempting to leave room (if any) and clearing local state/storage.");
             performLeaveTransaction(currentRoomCode, playerId, playerName).catch(err => {
                  console.warn("Error during background leave on reset:", err);
             });
        } else {
             console.log("Resetting: Clearing local state and storage.");
        }

        if (typeof window !== 'undefined') {
            localStorage.removeItem(LS_PLAYER_NAME);
            localStorage.removeItem(LS_PLAYER_ID);
            localStorage.removeItem(LS_GAME_STAGE);
            localStorage.removeItem(LS_CURRENT_ROOM_CODE);
            console.log("Cleared all game state from localStorage.");
        }

         if (unsubscribeRef.current) {
             console.log("Detaching listener during full reset.");
             unsubscribeRef.current();
             unsubscribeRef.current = null;
         }

        setPlayerName('');
        setTempPlayerName('');
        setPlayerId(null); // This will trigger regeneration in initial useEffect
        setGameStage('enterName');
        setCurrentRoomCode(null);
        setRoomData(null);
        setGameMessage('Enter your name to start.');
        setIsLoading(false);
        setIsLoadedFromStorage(false);
        setIsCreating(false);
        setIsJoining(false);
        setIsLeaving(false);
        setIsEnding(false);
        setIsStartingGame(false);

        if (typeof window !== 'undefined') {
            const existingId = localStorage.getItem(LS_PLAYER_ID);
            if (!existingId) {
                const newPlayerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                setPlayerId(newPlayerId);
                localStorage.setItem(LS_PLAYER_ID, newPlayerId);
                console.log("Regenerated new playerId after reset:", newPlayerId);
            } else {
                setPlayerId(existingId); // Restore existing ID if it wasn't cleared/is somehow still there
            }
             // Mark as loaded from storage after a short delay to allow state to settle
             setTimeout(() => setIsLoadedFromStorage(true), 50);
        }

    };


  // --- Render Logic ---
  // Combine all loading states that should disable user actions
  const isActionLoading = isCreating || isJoining || isLeaving || isEnding || isStartingGame || isLoading;

  // Initial loading screen while restoring state
   if (!isLoadedFromStorage) {
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
                value={tempPlayerName} // Bind to tempPlayerName
                onChange={(e) => setTempPlayerName(e.target.value)} // Update tempPlayerName
                placeholder="Your Name"
                className="text-lg"
                required
                autoFocus
                disabled={!playerId || isActionLoading} // Disable if no player ID or action loading
              />
            </div>
            <Button type="submit" className="w-full text-lg py-3" size="lg" disabled={isActionLoading || !tempPlayerName.trim() || !playerId}>
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
          <CardTitle className="text-3xl font-bold text-primary text-center">Welcome, {playerName || '...'}!</CardTitle>
          <UICardDescription className="text-center text-muted-foreground pt-2 min-h-[20px]">
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
                    disabled={isJoining}
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

          <Button variant="link" size="sm" onClick={handleResetAndEnterName} disabled={isActionLoading}>
             Change Name / Reset
          </Button>
        </CardContent>
      </UICard>
    </div>
  );

  const renderGameLobby = () => {
     // Check if we should show the loading state more intelligently
     const showLobbyLoading = isLoading && (!roomData || roomData.players.length === 0);

     return (
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
                         {showLobbyLoading ? <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> : null}
                         {gameMessage}
                     </UICardDescription>
                 </CardHeader>
                 <CardContent className="flex flex-col space-y-6">
                     <div>
                         <h3 className="text-xl font-semibold text-secondary mb-3 text-center">Players ({roomData?.players?.length ?? 0} / 4)</h3>
                         <div className="max-h-60 overflow-y-auto px-2 border rounded-md bg-muted/20 py-2">
                             <ul className="space-y-2 text-center">
                                 {showLobbyLoading ? (
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
                                     !isLoading && <li className="text-lg text-muted-foreground italic p-2">Waiting for players...</li>
                                 )}
                                 {roomData && roomData.players.length < 4 && Array.from({ length: 4 - roomData.players.length }).map((_, i) => (
                                     <li key={`waiting-${i}`} className="text-lg text-muted-foreground italic p-2 bg-muted/10 rounded-md">
                                         Waiting for player...
                                     </li>
                                 ))}
                             </ul>
                         </div>
                     </div>

                     <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-4 pt-4">
                         {playerId && roomData?.hostId === playerId && (
                             <Button
                                 className="text-lg py-3 px-6 w-full sm:w-auto"
                                 size="lg"
                                 disabled={isActionLoading || (roomData?.players?.length ?? 0) < 2}
                                 onClick={handleStartGame}
                                 variant="secondary"
                             >
                                 {isStartingGame ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2"/>}
                                 Start Game
                             </Button>
                         )}
                         {playerId && roomData?.hostId === playerId ? (
                             <Button
                                 onClick={handleEndGame}
                                 className="text-lg py-3 px-6 w-full sm:w-auto"
                                 size="lg"
                                 variant="destructive"
                                 disabled={isActionLoading}
                             >
                                 {isEnding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2" />}
                                 Close Lobby
                             </Button>
                         ) : (
                             <Button
                                 onClick={handleLeaveRoom}
                                 className="text-lg py-3 px-6 w-full sm:w-auto"
                                 size="lg"
                                 variant="outline"
                                 disabled={isActionLoading}
                             >
                                 {isLeaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2" />}
                                 Leave Lobby
                             </Button>
                         )}
                     </div>
                 </CardContent>
             </UICard>
         </div>
     );
   };


  // --- Game View ---
 const renderGame = () => {
   if (!roomData || !playerId || !playerName) return null;

   const numPlayers = roomData.players.length;
   const currentPlayerIndex = roomData.players?.findIndex(p => p.id === playerId) ?? -1;
   if (currentPlayerIndex === -1) {
        console.error("Current player not found in game room data!");
        resetToLobby("Error: Not found in game.");
        return null;
   }

   const playerOrder = roomData.players.map(p => p.id);
   const currentPlayerDisplayIndex = playerOrder.indexOf(playerId);

   const getPlayerPosition = (playerDisplayIndex: number, totalPlayers: number, localPlayerDisplayIndex: number) => {
       const relativeIndex = (playerDisplayIndex - localPlayerDisplayIndex + totalPlayers) % totalPlayers;
       const angleIncrement = 360 / totalPlayers;
       let angle = 180 - (relativeIndex * angleIncrement); // Start local player at bottom (180 deg)

        // Angle adjustments for better layout for specific player counts
        if (totalPlayers === 4) {
            angle = [180, 270, 0, 90][relativeIndex]; // Bottom, Left, Top, Right
        } else if (totalPlayers === 2) {
            angle = [180, 0][relativeIndex]; // Bottom, Top
        } else if (totalPlayers === 3) {
            angle = [180, 300, 60][relativeIndex]; // Bottom, Bottom-Left-ish, Bottom-Right-ish
        }
       // Add more cases for 5, 6 players if needed

       const angleRad = angle * (Math.PI / 180);
       const rx = 40; // Horizontal radius percentage
       const ry = 35; // Vertical radius percentage
       const x = 50 + rx * Math.cos(angleRad);
       const y = 50 + ry * Math.sin(angleRad);

       return {
           left: `${x}%`,
           top: `${y}%`,
           transform: `translate(-50%, -50%)`,
       };
   };

   const renderPlayerSeat = (player: Player, displayIndex: number) => {
     const positionStyle = getPlayerPosition(displayIndex, numPlayers, currentPlayerDisplayIndex);
     const isCurrentUser = player.id === playerId;
     const playerHand = roomData.playerHands ? roomData.playerHands[player.id] : [];
     const handSize = playerHand?.length ?? 0;

     return (
       <div
         key={player.id}
         className={`absolute p-2 rounded-lg shadow-md flex flex-col items-center min-w-[120px] ${isCurrentUser ? 'bg-primary/20 border-2 border-primary' : 'bg-card/90'}`}
         style={positionStyle}
       >
         <span className={`font-semibold truncate max-w-[100px] ${isCurrentUser ? 'text-primary-foreground' : 'text-card-foreground'}`}>
             {player.id === roomData.hostId && <Crown size={16} className="text-accent inline-block mr-1 mb-0.5" aria-label="Host"/>}
             {player.name}
         </span>
         <div className="flex mt-1 space-x-[-35px] justify-center min-h-[60px] items-center px-1">
            {handSize > 0 ? (
                !isCurrentUser ? (
                    Array.from({ length: Math.min(handSize, 7) }).map((_, cardIndex) => (
                       <CardComponent
                           key={`${player.id}-facedown-${cardIndex}`}
                           card={null}
                           isFaceDown={true}
                           style={{ zIndex: cardIndex }}
                           className="w-12 h-18"
                       />
                    ))
                ) : (
                    // Current user's hand is rendered at the bottom
                    <div className="text-xs text-muted-foreground italic mt-1">({handSize} cards)</div>
                )
            ) : (
                 <div className="text-xs text-muted-foreground italic mt-1">Empty Hand</div>
            )}
         </div>
       </div>
     );
   };

   const currentUserHand = roomData.playerHands?.[playerId] ?? [];

   return (
     <div className="flex flex-col h-screen bg-gradient-to-br from-background to-card p-4 relative overflow-hidden">
       {/* Game Info Header */}
       <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-20 p-2 bg-card/80 rounded-lg shadow">
           <Badge variant="secondary">Room: {currentRoomCode}</Badge>
           <div className="text-center">
               <h2 className="text-xl font-bold text-primary">Judgement</h2>
               <p className="text-sm text-muted-foreground">Round {roomData.currentRound ?? 'N/A'}</p>
           </div>
           <div className="space-x-2">
              {playerId && roomData.hostId === playerId ? (
                  <Button variant="destructive" size="sm" onClick={handleEndGame} disabled={isActionLoading}>
                     {isEnding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     End Game
                  </Button>
              ) : (
                  <Button variant="outline" size="sm" onClick={handleLeaveRoom} disabled={isActionLoading}>
                     {isLeaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     Leave Game
                  </Button>
              )}
           </div>
       </div>

       {/* Game Table Area */}
       <div className="flex-grow flex items-center justify-center mt-[70px] mb-[140px]">
         <div className="relative w-[85vw] h-[70vh] border-4 border-primary/50 rounded-[50%] bg-gradient-radial from-card via-card/80 to-transparent shadow-xl">
           {/* Center Area */}
           <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center space-y-2 z-10">
               <div className="relative flex items-center justify-center w-18 h-26">
                   {roomData.deck && roomData.deck.length > 0 ? (
                       <>
                         <CardComponent card={null} isFaceDown={true} />
                         <Badge variant="secondary" className="absolute -top-2 -right-2 px-1.5 py-0.5 text-xs">
                             {roomData.deck.length}
                         </Badge>
                       </>
                   ) : (
                       <div className="w-16 h-24 border-2 border-dashed border-muted-foreground rounded flex items-center justify-center text-muted-foreground text-xs text-center px-1">Deck Empty</div>
                   )}
               </div>
           </div>

           {/* Player Seats */}
           {playerOrder.map((pId, index) => {
                const player = roomData.players.find(p => p.id === pId);
                if (!player) return null;
                return renderPlayerSeat(player, index);
           })}

         </div>
       </div>

       {/* Current Player's Hand Area */}
       <div className="absolute bottom-0 left-0 right-0 p-4 bg-card/80 shadow-inner z-20 flex flex-col items-center h-[140px]">
          <span className="text-lg font-bold text-primary mb-2">{playerName} (You)</span>
          <div className="flex space-x-[-45px] justify-center items-end h-[110px] w-full overflow-x-auto px-4">
              {currentUserHand.length > 0 ? (
                  currentUserHand
                    .sort((a, b) => {
                       const suitValA = suitOrder[a.suit];
                       const suitValB = suitOrder[b.suit];
                       if (suitValA !== suitValB) return suitValA - suitValB;
                       return rankOrder[a.rank] - rankOrder[b.rank];
                    })
                    .map((card, index) => (
                      <CardComponent
                         key={`my-card-${card.suit}-${card.rank}-${index}`}
                         card={card}
                         isFaceDown={false}
                         style={{ zIndex: index }}
                         className="hover:-translate-y-2 transition-transform duration-150 cursor-pointer flex-shrink-0"
                      />
                  ))
              ) : (
                  <div className="text-muted-foreground italic text-center w-full pt-8">Your hand is empty</div>
              )}
          </div>
       </div>
     </div>
   );
 };


  // --- Stage Switching Logic ---

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
      if (playerName && playerId) {
          console.warn("In enterName stage but playerName exists, redirecting to lobby.");
          if (gameStage !== 'lobby') {
             setGameStage('lobby');
             setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
          }
          return renderLobby();
      }
      return renderEnterName();
    case 'lobby':
       if (!playerName || !playerId) {
           console.warn("Attempted to render lobby without name or ID. Redirecting to enterName.");
           handleResetAndEnterName();
           return renderEnterName();
       }
       return renderLobby();
    case 'gameLobby':
        if (!playerName || !playerId || !currentRoomCode) {
            console.warn("Attempted to render gameLobby without necessary data. Redirecting to lobby.");
            resetToLobby(playerName ? `Welcome back, ${playerName}! Please rejoin or create a game.` : 'Please enter your name.');
            return renderLobby();
        }
       return renderGameLobby();
    case 'game':
       if (!roomData || !currentRoomCode || !playerId || !playerName || !roomData.playerHands) {
           console.warn("Attempted to render game stage without necessary data. Redirecting to lobby.");
           resetToLobby(playerName ? `Welcome back, ${playerName}! Please rejoin or create a game.` : 'Please enter your name.');
            return renderLobby();
       }
       if (!roomData.players.some(p => p.id === playerId)) {
           console.warn(`Player ${playerId} (${playerName}) is not in room ${currentRoomCode}. Redirecting.`);
            toast({ title: "Not in Room", description: "You were removed or the game changed.", variant: "destructive"});
            resetToLobby(playerName ? `Welcome back, ${playerName}! Please rejoin or create a game.` : 'Please enter your name.');
            return renderLobby();
       }
       return renderGame();
    default:
      console.error("Unrecognized game stage:", gameStage, "Resetting to enterName.");
      handleResetAndEnterName();
      return renderEnterName();
  }
}
