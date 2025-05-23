// src/app/page.tsx
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card as UICard, CardContent, CardHeader, CardTitle, CardDescription as UICardDescription } from '@/components/ui/card';
import { Swords, UserPlus, LogOut, Copy, Check, Loader2, Crown, Minus, Plus, Target, Spade, Diamond, Hand } from 'lucide-react'; // Added Hand icon
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
import { Card, PlayerHands, Suit, Rank, suitOrder, rankOrder, GamePhase } from '@/types/cards'; // Import card types and hand structure
import { generateDeck, adjustDeckForInitialDeal, shuffleDeck, removeRandomCards, removeCardsBetweenRounds, isValidLastPlayerBid, calculateScore } from '@/lib/game-logic'; // Import game logic functions
import CardComponent from '@/components/CardComponent'; // Import CardComponent
import { cn } from '@/lib/utils';

// Game stages: 'enterName' -> 'lobby' -> 'gameLobby' -> 'game'
type ScreenStage = 'enterName' | 'lobby' | 'gameLobby' | 'game';

interface Player {
  id: string;
  name: string;
}

// Bids structure: { [playerId: string]: number | null } (null means not bid yet)
interface Bids {
    [playerId: string]: number | null;
}

// Scores structure: { [playerId: string]: number }
interface Scores {
    [playerId: string]: number;
}

// Current trick structure
interface CurrentTrick {
    leadingSuit: Suit | null;
    cardsPlayed: { playerId: string, card: Card }[];
    winner: string | null; // Player ID of the trick winner
}

interface RoomData {
  hostId: string;
  hostName: string;
  players: Player[];
  createdAt: Timestamp;
  gameStarted?: boolean;
  currentRound?: number | null; // Number of cards to be dealt/in hand this round
  totalRounds?: number | null; // Initial number of cards dealt (max tricks in round 1)
  roundNumber?: number | null; // Which round it is (1st, 2nd, etc.)
  currentPhase?: GamePhase | null;
  cardsDealt?: boolean; // Flag indicating if cards for the current round have been dealt
  currentPlayerTurn?: string | null; // Player ID whose turn it is (for dealing, bidding or playing)
  playerOrder?: string[]; // Fixed order for turns within a round
  startingPlayerIndex?: number; // Index in playerOrder who starts the round/bidding/dealing
  bids?: Bids;
  scores?: Scores;
  tricksWon?: { [playerId: string]: number }; // Tricks won in the *current* round
  currentTrick?: CurrentTrick | null; // State of the current trick being played
  trumpSuit?: Suit | null;
  remainingDeck?: Card[]; // Cards left in the deck for the *current* round deal
  playerHands?: PlayerHands; // Use the specific type for hands
  deadDeck?: Card[]; // Cards removed from the deck for the *current* round deal
  // Add more game state properties later (e.g., trump suit changes)
}

// LocalStorage keys
const LS_PLAYER_NAME = 'judgement_playerName';
const LS_PLAYER_ID = 'judgement_playerId';
const LS_GAME_STAGE = 'judgement_gameStage'; // This now refers to ScreenStage
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
  const [screenStage, setScreenStage] = useState<ScreenStage>('enterName'); // Renamed from gameStage
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
  const [isCreating, setIsCreating] = useState<boolean>(false); // Ensure initial value is set
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isLeaving, setIsLeaving] = useState<boolean>(false); // Loading for leaving lobby/game
  const [isEnding, setIsEnding] = useState<boolean>(false); // Loading for host ending game
  const [isStartingGame, setIsStartingGame] = useState<boolean>(false); // Specific loading for starting game
  const [isDealing, setIsDealing] = useState<boolean>(false); // Specific loading for dealing cards
  const [isLoadedFromStorage, setIsLoadedFromStorage] = useState<boolean>(false); // Flag for storage load
  const { toast } = useToast();
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

   // Bidding state
   const [currentBid, setCurrentBid] = useState<number>(0);
   const [isSubmittingBid, setIsSubmittingBid] = useState<boolean>(false);


  // Combine all loading states that should disable user actions
  // Note: Placed earlier because it's used in renderEnterName logic
  const isActionLoading = isCreating || isJoining || isLeaving || isEnding || isStartingGame || isLoading || isSubmittingBid || isDealing;


  // --- State Restoration from localStorage ---
  useEffect(() => {
    // Only run on the client after initial mount
    if (typeof window !== 'undefined') {
      // console.log("Attempting to restore state from localStorage..."); // Reduce log noise
      const savedPlayerName = localStorage.getItem(LS_PLAYER_NAME);
      const savedPlayerId = localStorage.getItem(LS_PLAYER_ID);
      const savedScreenStage = localStorage.getItem(LS_GAME_STAGE) as ScreenStage | null;
      const savedRoomCode = localStorage.getItem(LS_CURRENT_ROOM_CODE);

      let activePlayerId = savedPlayerId;
      if (!activePlayerId) {
        activePlayerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        localStorage.setItem(LS_PLAYER_ID, activePlayerId);
        // console.log("Generated new playerId:", activePlayerId);
      }
      setPlayerId(activePlayerId);
      // if(savedPlayerId) console.log("Restored playerId:", activePlayerId);


      if (savedPlayerName) {
        setPlayerName(savedPlayerName);
        setTempPlayerName(savedPlayerName); // Also set temp name for input field consistency if needed
        // console.log("Restored playerName:", savedPlayerName);
      }

      let currentStage: ScreenStage = 'enterName'; // Default stage

      if (savedScreenStage) {
         // Stage-specific restoration logic
         if ((savedScreenStage === 'gameLobby' || savedScreenStage === 'game') && savedPlayerName && activePlayerId && savedRoomCode) {
              currentStage = savedScreenStage;
              setCurrentRoomCode(savedRoomCode);
              // console.log("Restoring stage:", currentStage, "and roomCode:", savedRoomCode);
         } else if (savedScreenStage === 'lobby' && savedPlayerName && activePlayerId) {
              currentStage = 'lobby';
              // console.log("Restoring stage: lobby");
         } else if (savedScreenStage === 'enterName') {
              if (savedPlayerName && activePlayerId) {
                  // Has name but stuck on enterName? Move to lobby.
                  currentStage = 'lobby';
                  console.warn("Restored 'enterName' stage but playerName exists, moving to 'lobby'.");
                  localStorage.setItem(LS_GAME_STAGE, 'lobby'); // Correct storage
              } else {
                  currentStage = 'enterName';
                  // console.log("Restoring stage: enterName");
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
          // console.log(`No gameStage found, defaulting to ${currentStage}.`);
      }

      setScreenStage(currentStage); // Set the determined stage


      // Set messages based on restored state
      if (currentStage === 'lobby' && savedPlayerName) {
          setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
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
        // console.log("Persisting playerName to localStorage:", playerName);
        if (playerName) {
            localStorage.setItem(LS_PLAYER_NAME, playerName);
        } else {
             localStorage.removeItem(LS_PLAYER_NAME);
        }
    }
  }, [playerName, isLoadedFromStorage]);

  useEffect(() => {
    if (isLoadedFromStorage && typeof window !== 'undefined' && playerId) {
      //  console.log("Persisting playerId to localStorage:", playerId);
       localStorage.setItem(LS_PLAYER_ID, playerId);
    }
   }, [playerId, isLoadedFromStorage]);


  useEffect(() => {
    if (isLoadedFromStorage && typeof window !== 'undefined') {
      // console.log("Persisting gameStage to localStorage:", screenStage);
      localStorage.setItem(LS_GAME_STAGE, screenStage);
    }
  }, [screenStage, isLoadedFromStorage]);

  useEffect(() => {
    if (isLoadedFromStorage && typeof window !== 'undefined') {
      // console.log("Persisting currentRoomCode to localStorage:", currentRoomCode);
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
        // console.log("Firestore listener waiting for storage load or playerId.");
        return;
    }

    const cleanupListener = () => {
        if (unsubscribeRef.current) {
            // console.log("Cleaning up existing Firestore listener for room:", currentRoomCode);
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
    };

    cleanupListener();

    if ((screenStage === 'gameLobby' || screenStage === 'game') && currentRoomCode) {
      // Only set loading if we don't have room data or it's empty
      if (!roomData || roomData.players.length === 0) setIsLoading(true);
      // console.log(`Attaching Firestore listener for room: ${currentRoomCode}`);
      const roomRef = doc(db, 'rooms', currentRoomCode);

      unsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as RoomData;
          const previousRoomData = roomData; // Store previous state for comparison
          setRoomData(data);
          // console.log("Received room update:", data);

          const currentPlayerInRoom = data.players.some(p => p.id === playerId);

          // --- Kick out logic ---
          if (!currentPlayerInRoom && (screenStage === 'gameLobby' || screenStage === 'game')) {
              // Check if the game is still in progress
              if (data.gameStarted) {
                  // If game is in progress, try to rejoin
                  const player: Player = { id: playerId, name: playerName };
                  const updatedPlayers = [...data.players, player];
                  const updatedPlayerOrder = [...data.playerOrder ?? [], playerId];
                  const updatedPlayerHands = { ...(data.playerHands || {}), [playerId]: [] };
                  const updatedScores = { ...(data.scores || {}), [playerId]: 0 };
                  const updatedBids = { ...(data.bids || {}), [playerId]: null };
                  const updatedTricksWon = { ...(data.tricksWon || {}), [playerId]: 0 };

                  // Update the room with the rejoining player
                  updateDoc(roomRef, {
                      players: updatedPlayers,
                      playerOrder: updatedPlayerOrder,
                      playerHands: updatedPlayerHands,
                      scores: updatedScores,
                      bids: updatedBids,
                      tricksWon: updatedTricksWon,
                  }).then(() => {
                      console.log(`Player ${playerName} rejoined game ${currentRoomCode}`);
                      toast({
                          title: "Rejoined Game",
                          description: "Successfully rejoined the game in progress.",
                          duration: 500
                      });
                  }).catch((error) => {
                      console.error("Error rejoining game:", error);
                      toast({
                          title: "Rejoin Failed",
                          description: "Could not rejoin the game. Please try again.",
                          variant: "destructive",
                          duration: 500
                      });
                      resetToLobby(`Welcome back, ${playerName}! Create or join a game.`);
                  });
              } else {
                  // If game hasn't started, allow rejoining lobby
                  const player: Player = { id: playerId, name: playerName };
                  const updatedPlayers = [...data.players, player];
                  const updatedPlayerOrder = [...data.playerOrder ?? [], playerId];

                  updateDoc(roomRef, {
                      players: updatedPlayers,
                      playerOrder: updatedPlayerOrder,
                  }).then(() => {
                      console.log(`Player ${playerName} rejoined lobby ${currentRoomCode}`);
                      toast({
                          title: "Rejoined Lobby",
                          description: "Successfully rejoined the lobby.",
                          duration: 500
                      });
                  }).catch((error) => {
                      console.error("Error rejoining lobby:", error);
                      toast({
                          title: "Rejoin Failed",
                          description: "Could not rejoin the lobby. Please try again.",
                          variant: "destructive",
                          duration: 500
                      });
                      resetToLobby(`Welcome back, ${playerName}! Create or join a game.`);
                  });
              }
              return;
          }

          // --- Screen Stage transitions based on gameStarted ---
          if (data.gameStarted && screenStage === 'gameLobby') {
              console.log(`Game started detected in room ${currentRoomCode}. Transitioning to 'game' screen.`);
              setScreenStage('game');
              // Message updated below based on game phase
          } else if (!data.gameStarted && screenStage === 'game' && previousRoomData?.gameStarted) {
              // Only transition back if the game was previously started (avoids flicker on initial load)
              console.log(`Game no longer marked as started in room ${currentRoomCode}. Returning to 'gameLobby'.`);
              toast({ title: "Game Ended", description: `The game in room ${currentRoomCode} has ended. Returning to lobby.` });
              setScreenStage('gameLobby');
               // Message updated below
          }

           // --- Update Game Message based on current screen and game phase ---
           if (screenStage === 'gameLobby') {
               if (playerId === data.hostId) {
                   setGameMessage(`Share code ${currentRoomCode} to invite players! Waiting for players...`);
               } else {
                   setGameMessage(`Joined lobby ${currentRoomCode}. Waiting for host "${data.hostName}" to start...`);
               }
           } else if (screenStage === 'game' && data.currentPhase) {
                // Messages for different game phases
                 let phaseMessage = `Round ${data.roundNumber ?? 'N/A'} (${data.currentRound ?? 'N/A'} cards). `;
                 const isMyTurn = data.currentPlayerTurn === playerId;
                 const currentTurnPlayer = data.players.find(p => p.id === data.currentPlayerTurn);
                 const turnPlayerName = currentTurnPlayer ? currentTurnPlayer.name : 'Someone';

                 switch(data.currentPhase) {
                      case 'dealing':
                          phaseMessage += `${isMyTurn ? 'Your turn to deal cards.' : `Waiting for ${turnPlayerName} to deal.`}`;
                          break;
                     case 'bidding':
                          phaseMessage += `Bidding phase. ${isMyTurn ? 'Your turn to bid.' : `Waiting for ${turnPlayerName} to bid.`}`;
                          break;
                     case 'playing':
                          phaseMessage += `Playing phase. ${isMyTurn ? 'Your turn to play.' : `Waiting for ${turnPlayerName} to play.`}`;
                          break;
                     case 'scoring':
                          phaseMessage += `Scoring round ${data.roundNumber ?? 'N/A'}.`;
                          // Optionally add: `Next round starts soon...`
                          break;
                    case 'gameOver':
                          phaseMessage = `Game Over! Calculating final scores...`;
                          break;
                    default:
                          phaseMessage += "Waiting...";
                 }
                 setGameMessage(phaseMessage);

           } else if (screenStage === 'game' && !data.currentPhase) {
               setGameMessage(`Game starting in room ${currentRoomCode}...`); // Initial game message
           }


        } else {
          console.log(`Room ${currentRoomCode} not found or deleted.`);
          // --- Room deleted logic ---
          if (screenStage === 'gameLobby' || screenStage === 'game') {
              toast({
                title: "Room Closed",
                description: `Room ${currentRoomCode} is no longer available.`,
                variant: "destructive",
              });
              resetToLobby(playerName ? `Welcome back, ${playerName}! Create a game or join one.` : 'Enter your name');
              cleanupListener();
          }
        }
         setIsLoading(false); // Stop loading after processing update or finding room doesn't exist
      }, (error) => {
        console.error("Error listening to room changes:", error);
        toast({
          title: "Connection Error",
          description: "Could not sync room data. Please check your connection.",
          variant: "destructive",
        });
        if (screenStage === 'gameLobby' || screenStage === 'game') {
             resetToLobby(playerName ? `Welcome back, ${playerName}! Error connecting to room.` : 'Enter your name');
             cleanupListener();
        }
        setIsLoading(false); // Ensure loading is off on error
        setIsCreating(false); // Reset specific loading flags on error
        setIsJoining(false);
      });

    } else {
        // Not in a game or lobby screen
        setIsLoading(false);
        cleanupListener();
        setRoomData(null); // Clear room data if not in a relevant stage
    }

    // Cleanup function
    return cleanupListener;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenStage, currentRoomCode, playerId, isLoadedFromStorage, toast, playerName]); // Dependencies


  // --- Name Handling ---
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempPlayerName(e.target.value);
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = tempPlayerName.trim();
    if (trimmedName && playerId) {
      setPlayerName(trimmedName);
      setScreenStage('lobby');
      setGameMessage(`Welcome, ${trimmedName}! Create a game or join one.`);
    } else if (!trimmedName) {
      toast({
        title: "Invalid Name",
        description: "Please enter a valid name.",
        variant: "destructive",
        duration: 500
      });
      setGameMessage('Please enter a valid name.');
    } else {
         toast({
           title: "Initialization",
           description: "Player ID not ready yet, please wait...",
           variant: "default",
           duration: 500
         });
    }
  };

  // --- Lobby Actions ---
  const handleCreateGame = async () => {
      if (!playerName || !playerId) {
           toast({ 
             title: "Error", 
             description: "Player name or ID is missing.", 
             variant: "destructive",
             duration: 500
           });
           return;
      }

      setIsCreating(true);
      setGameMessage("Creating game lobby...");
      setIsLoading(true);

      let newRoomCode = '';
      let exists = true;
      let attempts = 0;
      const maxAttempts = 10;

      // --- Unique Room Code Generation ---
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
              duration: 500
          });
          setIsCreating(false);
          setIsLoading(false);
          setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
          return;
      }
      // --- End Unique Room Code Generation ---


      const roomRef = doc(db, 'rooms', newRoomCode);
      const initialPlayerData: Player = { id: playerId, name: playerName };
      const initialScores: Scores = { [playerId]: 0 };
      const initialBids: Bids = { [playerId]: null };
      const initialTricksWon: { [playerId: string]: number } = { [playerId]: 0 };


      // --- Initial Room Data ---
      // We use null for Firestore compatibility where 'undefined' is not supported.
      const initialRoomData: RoomData = {
          hostId: playerId,
          hostName: playerName,
          players: [initialPlayerData],
          createdAt: Timestamp.now(),
          gameStarted: false,
          currentRound: null,
          totalRounds: null,
          roundNumber: null,
          currentPhase: null,
          cardsDealt: false, // Explicitly false initially
          currentPlayerTurn: null,
          playerOrder: [playerId],
          startingPlayerIndex: 0,
          bids: initialBids,
          scores: initialScores,
          tricksWon: initialTricksWon,
          currentTrick: null,
          trumpSuit: Suit.Spades, // Default trump
          remainingDeck: [], // Will be set when game starts
          playerHands: { [playerId]: [] }, // Initialize host hand
          deadDeck: [], // Initialize dead deck
      };
      // --- End Initial Room Data ---

      try {
          await setDoc(roomRef, initialRoomData);
          console.log(`Firestore document created for lobby ${newRoomCode} by host ${playerName} (${playerId}).`);

          setCurrentRoomCode(newRoomCode);
          setScreenStage('gameLobby');
          setHasCopied(false);
          // Message and isLoading=false will be handled by the listener updating roomData
          toast({
              title: "Lobby Created!",
              description: `Room code: ${newRoomCode}`,
          });

      } catch (error: any) {
          console.error("Error writing initial room data to Firestore:", error);
          toast({
              title: "Creation Failed",
              description: `Could not save the lobby data. ${error.message || 'Please try again.'}`,
              variant: "destructive",
          });
          // Reset state if creation fails
          setScreenStage('lobby');
          setCurrentRoomCode(null);
          setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
          // setIsLoading(false); // Listener should handle this, but set explicitly on error
      } finally {
          // Ensure spinners are off regardless of success/failure
          setIsCreating(false);
          setIsLoading(false);
      }
  };


  const handleJoinGameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName || !playerId) {
         toast({ 
           title: "Error", 
           description: "Player name or ID is missing.", 
           variant: "destructive",
           duration: 500
         });
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
        // --- Join Transaction ---
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
            const maxPlayers = 6; // Set max players

            if (playerIndex === -1) { // Player not already in the room
                 if (currentRoomData.players.length >= maxPlayers) { // Check if lobby is full
                    throw new Error(`Lobby is full (${maxPlayers} players max)`);
                 }
                 // Add the new player
                 const updatedPlayers = [...currentRoomData.players, joiningPlayer];
                 const updatedPlayerOrder = [...currentRoomData.playerOrder ?? [], playerId]; // Add to order
                 // Initialize data for the new player
                 const updatedPlayerHands = { ...(currentRoomData.playerHands || {}), [playerId]: [] };
                 const updatedScores = { ...(currentRoomData.scores || {}), [playerId]: 0 };
                 const updatedBids = { ...(currentRoomData.bids || {}), [playerId]: null };
                 const updatedTricksWon = { ...(currentRoomData.tricksWon || {}), [playerId]: 0 };

                 transaction.update(roomRef, {
                    players: updatedPlayers,
                    playerOrder: updatedPlayerOrder,
                    playerHands: updatedPlayerHands,
                    scores: updatedScores,
                    bids: updatedBids,
                    tricksWon: updatedTricksWon,
                 });
                 console.log(`${playerName} (${playerId}) joining lobby ${codeToJoin}. Firestore update scheduled.`);
            } else {
                 // Player is already in the room, no update needed
                 console.log(`${playerName} (${playerId}) is already in lobby ${codeToJoin}. No Firestore update needed.`);
            }
        });
        // --- End Join Transaction ---

        setCurrentRoomCode(codeToJoin);
        setScreenStage('gameLobby');
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
      } else if (error.message.includes("Lobby is full")) { // Catch specific error message
          description = error.message; // Use the detailed message from the transaction
      }
      toast({
        title: "Join Failed",
        description: description,
        variant: "destructive",
      });
      // Reset state on failure
      setScreenStage('lobby');
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
            // console.log("Detaching listener during resetToLobby for room:", currentRoomCode);
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
        setScreenStage('lobby');
        setCurrentRoomCode(null);
        setRoomData(null); // Clear local room data
        setGameMessage(message || (playerName ? `Welcome back, ${playerName}! Create a game or join one.` : 'Enter your name.'));
        setIsLoading(false); // Ensure loading is off
        setIsLeaving(false); // Ensure leaving state is off
        setIsEnding(false); // Ensure ending state is off
        setIsStartingGame(false); // Ensure starting game state is off
        setIsDealing(false); // Ensure dealing state is off
        // localStorage updates are handled by useEffects for stage and room code
    };


   // --- Backend Leave Logic (Transaction) ---
   const performLeaveTransaction = async (roomCode: string, playerIdToLeave: string, playerNameForLog: string) => {
        const roomRef = doc(db, 'rooms', roomCode);
        try {
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(roomRef);
                if (!docSnap.exists()) {
                    console.log(`Room ${roomCode} already deleted or not found while ${playerNameForLog} trying to leave. No backend action needed.`);
                    return; // Exit transaction gracefully if room is gone
                }

                const currentData = docSnap.data() as RoomData;
                const isHostLeaving = currentData.hostId === playerIdToLeave;
                const players = currentData.players;
                const leavingPlayerIndex = players.findIndex(p => p.id === playerIdToLeave);

                if (isHostLeaving) {
                    // Option 1: Delete the room if host leaves
                    console.log(`Host ${playerNameForLog} (${playerIdToLeave}) leaving, deleting room ${roomCode}.`);
                    transaction.delete(roomRef);
                     // Option 2: Assign a new host (if > 1 player left) - More complex
                    /*
                    if (currentData.players.length > 1) {
                        const remainingPlayers = currentData.players.filter(p => p.id !== playerIdToLeave);
                        const newHost = remainingPlayers[0]; // Simple: first remaining player becomes host
                        const updatedPlayerOrder = currentData.playerOrder?.filter(id => id !== playerIdToLeave) ?? [];
                        // Remove leaving player's data
                        const { [playerIdToLeave]: _, ...remainingHands } = currentData.playerHands || {};
                        const { [playerIdToLeave]: __, ...remainingScores } = currentData.scores || {};
                        const { [playerIdToLeave]: ___, ...remainingBids } = currentData.bids || {};
                        const { [playerIdToLeave]: ____, ...remainingTricksWon } = currentData.tricksWon || {};

                        transaction.update(roomRef, {
                            hostId: newHost.id,
                            hostName: newHost.name,
                            players: remainingPlayers,
                            playerOrder: updatedPlayerOrder,
                            playerHands: remainingHands,
                            scores: remainingScores,
                            bids: remainingBids,
                            tricksWon: remainingTricksWon,
                        });
                        console.log(`Host ${playerNameForLog} left ${roomCode}. New host assigned: ${newHost.name} (${newHost.id}).`);
                    } else {
                        // Only host was left, delete the room
                        console.log(`Host ${playerNameForLog} was last player in ${roomCode}, deleting room.`);
                        transaction.delete(roomRef);
                    }
                    */

                } else if (leavingPlayerIndex !== -1) {
                    // Non-host player leaving
                    const updatedPlayers = players.filter(p => p.id !== playerIdToLeave);
                    const updatedPlayerOrder = currentData.playerOrder?.filter(id => id !== playerIdToLeave) ?? [];

                     // Remove leaving player's data carefully
                    const { [playerIdToLeave]: _, ...remainingHands } = currentData.playerHands || {};
                    const { [playerIdToLeave]: __, ...remainingScores } = currentData.scores || {};
                    const { [playerIdToLeave]: ___, ...remainingBids } = currentData.bids || {};
                    const { [playerIdToLeave]: ____, ...remainingTricksWon } = currentData.tricksWon || {};


                    console.log(`${playerNameForLog} (${playerIdToLeave}) leaving room ${roomCode}. Updating players and associated data.`);
                    transaction.update(roomRef, {
                        players: updatedPlayers,
                        playerOrder: updatedPlayerOrder,
                        playerHands: remainingHands,
                        scores: remainingScores,
                        bids: remainingBids,
                        tricksWon: remainingTricksWon,
                        // Reset currentPlayerTurn if the leaving player was the current player
                        ...(currentData.currentPlayerTurn === playerIdToLeave && { currentPlayerTurn: null }), // Or advance turn logic if needed
                    });
                } else {
                    // Player already gone, maybe due to race condition
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
          toast({ 
            title: "Error", 
            description: "Cannot leave room without necessary information.", 
            variant: "destructive",
            duration: 500
          });
          return;
      }

      setIsLeaving(true);
      setIsLoading(true); // Indicate loading state
      const leavingRoomCode = currentRoomCode;
      const leavingPlayerId = playerId;
      const leavingPlayerName = playerName;
      const wasHost = roomData?.hostId === leavingPlayerId; // Check before resetting roomData
      const previousScreenStage = screenStage;

      // Immediately reset the local state to 'lobby'
      resetToLobby("Leaving room..."); // Show intermediate message

      // Perform the backend leave operation
      const success = await performLeaveTransaction(leavingRoomCode, leavingPlayerId, leavingPlayerName);

      // Update toast and final message based on success and role
      if (success) {
          if (wasHost) {
               toast({
                   title: previousScreenStage === 'game' ? "Game Ended & Room Closed" : "Lobby Closed",
                   description: `You left the ${previousScreenStage === 'game' ? 'game' : 'lobby'} as the host, closing room ${leavingRoomCode}.`,
               });
          } else {
               toast({
                   title: previousScreenStage === 'game' ? "Left Game" : "Left Lobby",
                   description: `You have left room ${leavingRoomCode}.`,
               });
          }
          // Set final lobby message after successful leave
          resetToLobby(); // Use default lobby message

      } else {
            // If backend failed, the user is already locally in the lobby.
            // The error toast is shown in performLeaveTransaction.
            // We might want a more specific message here?
           resetToLobby(`Error leaving room ${leavingRoomCode}. Please try creating/joining again.`);
      }

      // Ensure loading states are off regardless of outcome
      setIsLeaving(false);
      setIsLoading(false);
    };


     // --- Host End Game / Close Lobby Handler ---
    const handleEndGame = async () => {
        if (!currentRoomCode || !playerId || !roomData || roomData.hostId !== playerId) {
            toast({ 
              title: "Action Denied", 
              description: "Only the host can end the game or close the lobby.", 
              variant: "destructive",
              duration: 500
            });
            return;
        }

        setIsEnding(true);
        setIsLoading(true);
        const endingRoomCode = currentRoomCode;
        const endingPlayerId = playerId;
        const endingPlayerName = playerName;
        const wasGameStarted = roomData.gameStarted; // Check before potential reset
        console.log(`Host ${endingPlayerName} (${endingPlayerId}) initiating end game/close lobby for room ${endingRoomCode}.`);

        const roomRef = doc(db, 'rooms', endingRoomCode);
        try {
            // Simply delete the room document
            await deleteDoc(roomRef);
            console.log(`Successfully deleted room ${endingRoomCode} by host action.`);

            // Since the room is deleted, the listener will trigger a reset for all players.
            // We can show a local toast immediately for the host.
            resetToLobby(`You closed room ${endingRoomCode}.`); // Reset host's state locally
            toast({
                title: wasGameStarted ? "Game Ended & Room Closed" : "Lobby Closed",
                description: `You closed room ${endingRoomCode}.`,
            });

        } catch (error) {
            console.error(`Error deleting room ${endingRoomCode} during end game action:`, error);
            toast({
                title: "Action Failed",
                description: "Could not close the room on the server. Please try leaving manually.",
                variant: "destructive",
            });
             // Keep host in the potentially broken room state? Or force reset?
             // Let's force reset locally but indicate error.
             resetToLobby(`Error closing room ${endingRoomCode}. Try leaving manually.`);
        } finally {
             // Ensure loading states are turned off
             setIsEnding(false);
             setIsLoading(false);
        }
    };


  // --- Copy to Clipboard ---
  const handleCopyToClipboard = useCallback(async () => {
    if (!currentRoomCode) return;

    try {
        await navigator.clipboard.writeText(currentRoomCode);
        setHasCopied(true);
        toast({
            title: "Copied!",
            description: "Room code copied to clipboard.",
            duration: 500
        });
        setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
        toast({
            title: "Copy Failed",
            description: "Could not copy room code automatically. Please copy it manually.",
            variant: "destructive",
            duration: 500
        });
    }
  }, [currentRoomCode]);


  // --- Game Logic ---
  const handleStartGame = async () => {
       if (!currentRoomCode || !roomData || !playerId || roomData.hostId !== playerId) {
           toast({ 
             title:"Action Denied", 
             description: "Only the host can start the game.", 
             variant: "destructive",
             duration: 500
           });
           return;
       }
       const numPlayers = roomData.players.length;
       if (numPlayers < 3 || numPlayers > 6) {
           toast({
               title: "Cannot Start Game",
               description: `Judgement requires 3 to 6 players. You have ${numPlayers}.`,
               variant: "destructive",
               duration: 500
           });
           return;
       }

       setIsStartingGame(true);
       setIsLoading(true);
       setGameMessage("Starting game... Preparing deck...");

       const roomRef = doc(db, 'rooms', currentRoomCode);
       try {
           // --- Deck Preparation ---
           const initialDeck = generateDeck();
           
           // Calculate how many cards to remove to make it divisible by number of players
           const cardsToRemove = initialDeck.length % numPlayers;
           
           // Remove cards in order (2 of clubs, 3 of clubs, etc.)
           if (cardsToRemove > 0) {
               const cardsToRemoveList = [];
               for (let i = 2; i <= 2 + cardsToRemove - 1; i++) {
                   cardsToRemoveList.push({ rank: i.toString(), suit: Suit.Clubs });
               }
               
               // Remove the specified cards
               for (const cardToRemove of cardsToRemoveList) {
                   const index = initialDeck.findIndex(card => 
                       card.rank === cardToRemove.rank && card.suit === cardToRemove.suit
                   );
                   if (index !== -1) {
                       initialDeck.splice(index, 1);
                   }
               }
           }
           
           const shuffledDeck = shuffleDeck(initialDeck);
           const cardsPerPlayer = Math.floor(shuffledDeck.length / numPlayers);

           console.log(`Starting game with ${numPlayers} players. Round 1 cards per player: ${cardsPerPlayer}. Deck size: ${shuffledDeck.length}`);
           // --- End Deck Preparation ---

           // --- Dealing Setup (Not Dealing Yet) ---
           const playerIds = roomData.players.map(p => p.id);
           const shuffledPlayerOrder = [...playerIds].sort(() => Math.random() - 0.5); // Simple shuffle for player order
           const startingPlayerIndex = 0; // First player in shuffled order starts dealing/bidding
           const initialPlayerHands: PlayerHands = {};
           playerIds.forEach(id => {
               initialPlayerHands[id] = []; // Initialize empty hands
           });
           // --- End Dealing Setup ---

           // --- Initialize Game State for Round 1 ---
           const initialBids: Bids = {};
           const initialTricksWon: { [playerId: string]: number } = {};
           const initialScores: Scores = {};
           playerIds.forEach(id => {
               initialBids[id] = null; // No bids yet
               initialTricksWon[id] = 0; // No tricks won yet
               initialScores[id] = 0; // Start with 0 points
           });

           // Update Firestore with initial game state (NO CARDS DEALT YET)
           await updateDoc(roomRef, {
               gameStarted: true,
               currentRound: cardsPerPlayer, // Number of cards to be dealt
               totalRounds: cardsPerPlayer, // Initial max tricks
               roundNumber: 1,
               currentPhase: 'dealing', // Start with dealing phase
               cardsDealt: false, // Cards are NOT dealt yet
               trumpSuit: Suit.Spades,
               remainingDeck: shuffledDeck, // Store the full deck to be dealt
               playerHands: initialPlayerHands, // Empty hands
               playerOrder: shuffledPlayerOrder,
               startingPlayerIndex: startingPlayerIndex,
               currentPlayerTurn: shuffledPlayerOrder[startingPlayerIndex], // First player's turn to DEAL
               bids: initialBids,
               tricksWon: initialTricksWon,
               scores: initialScores,
               currentTrick: null,
           });
           // --- End Initialize Game State ---

           console.log(`Game started, deck prepared, Firestore updated for room ${currentRoomCode}. Waiting for ${shuffledPlayerOrder[startingPlayerIndex]} to deal.`);
           // Listener will detect gameStarted: true, update local roomData, trigger UI transition, and set loading false.

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
           // Ensure spinner is off eventually. Loading is controlled by listener on success.
           setIsStartingGame(false);
       }
   };

   // --- Handle Card Dealing ---
   const handleDealCards = async () => {
        if (!roomData || !playerId || roomData.currentPlayerTurn !== playerId || roomData.currentPhase !== 'dealing' || !currentRoomCode || !roomData.remainingDeck || roomData.cardsDealt) {
            toast({ 
              title: "Cannot Deal", 
              description: "It's not your turn to deal, or cards are already dealt.", 
              variant: "destructive",
              duration: 500
            });
            return;
        }

        setIsDealing(true);
        const roomRef = doc(db, 'rooms', currentRoomCode);
        const deckToDeal = roomData.remainingDeck!;
        const numPlayers = roomData.players.length;
        const cardsPerPlayer = roomData.currentRound!;
        const playerIds = roomData.playerOrder!; // Use the established player order

        if (deckToDeal.length !== cardsPerPlayer * numPlayers) {
            toast({ title: "Deal Error", description: `Deck size (${deckToDeal.length}) mismatch for ${numPlayers} players needing ${cardsPerPlayer} cards each.`, variant: "destructive" });
            setIsDealing(false);
            return;
        }

        try {
            const dealtHands: PlayerHands = {};
            playerIds.forEach(pId => { dealtHands[pId] = []; });

            // Simulate dealing card by card
            const dealingDeck = [...deckToDeal]; // Work with a copy
            for (let i = 0; i < dealingDeck.length; i++) {
                const playerIndex = i % numPlayers;
                const currentPlayerId = playerIds[playerIndex];
                dealtHands[currentPlayerId]!.push(dealingDeck[i]);
            }

            // Verify hand sizes (optional sanity check)
            Object.values(dealtHands).forEach((hand, index) => {
                 if (hand && hand.length !== cardsPerPlayer) {
                     console.warn(`Warning: Hand size mismatch for player ${playerIds[index]} after dealing. Expected ${cardsPerPlayer}, got ${hand.length}.`);
                 }
            });

            // Determine next player (who starts bidding) - it's the same player who dealt in this logic, then we advance in bid submit
            const nextPlayerTurn = playerIds[roomData.startingPlayerIndex ?? 0]; // The starting player also starts bidding

            await updateDoc(roomRef, {
                playerHands: dealtHands,
                remainingDeck: [], // Deck is now empty for this round
                cardsDealt: true, // Mark cards as dealt
                currentPhase: 'bidding', // Transition to bidding phase
                currentPlayerTurn: nextPlayerTurn, // Set bidding turn
            });

            console.log(`Player ${playerName} dealt ${cardsPerPlayer} cards each. Starting bidding phase. Turn: ${nextPlayerTurn}`);
            toast({ title: "Cards Dealt", description: "Bidding phase begins." });

        } catch (error) {
            console.error("Error dealing cards:", error);
            toast({ title: "Deal Error", description: "Could not deal cards. Please try again.", variant: "destructive" });
        } finally {
            setIsDealing(false);
        }
   };


   // --- Bidding Logic ---
   const handleBidChange = (amount: number) => {
       const maxBid = roomData?.currentRound ?? 0;
       const newBid = Math.max(0, Math.min(maxBid, currentBid + amount));
       setCurrentBid(newBid);
   };

   const handleBidSubmit = async () => {
        if (!roomData || !playerId || roomData.currentPlayerTurn !== playerId || roomData.currentPhase !== 'bidding' || !currentRoomCode) {
            toast({ 
              title: "Not your turn", 
              description: "Wait for your turn to bid.", 
              variant: "destructive",
              duration: 500
            });
            return;
        }
        if (currentBid < 0 || currentBid > (roomData.currentRound ?? 0)) {
            toast({ 
                title: "Invalid Bid", 
                description: `Bid must be between 0 and ${roomData.currentRound}.`, 
                variant: "destructive",
                duration: 500 // 0.5 seconds
            });
            return;
        }

        // Check last player rule if applicable
        const playerOrder = roomData.playerOrder!;
        const biddingPlayerIndex = playerOrder.indexOf(playerId);
        const isLastPlayer = biddingPlayerIndex === playerOrder.length - 1;
        const cardsPerPlayer = roomData.currentRound!;
        
        if (isLastPlayer && cardsPerPlayer > 5) {
            const bidsMadeSoFar = Object.values(roomData.bids ?? {}).filter(bid => bid !== null);
            const currentTotalBids = bidsMadeSoFar.reduce((sum, bid) => sum + (bid ?? 0), 0);
            const totalCards = cardsPerPlayer * playerOrder.length;
            
            if (!isValidLastPlayerBid(currentBid, currentTotalBids, totalCards, cardsPerPlayer)) {
                toast({
                    title: "Last Player Rule",
                    description: `Your bid (${currentBid}) would make the total bids equal to the number of tricks (${totalCards}). Please choose a different bid.`,
                    variant: "destructive",
                    duration: 500 // 0.5 seconds
                });
                return;
            }
        }

        setIsSubmittingBid(true);
        const roomRef = doc(db, 'rooms', currentRoomCode);
        const numPlayers = playerOrder.length;
        const currentRoundCards = roomData.currentRound!;

        try {
            // Determine next player index and phase
            const nextPlayerIndex = (biddingPlayerIndex + 1) % numPlayers;
            let nextPhase: GamePhase = 'bidding';
            let nextPlayerTurn: string | null = playerOrder[nextPlayerIndex];

            // If the next player to bid is the starting player again, bidding is over
            if (nextPlayerIndex === roomData.startingPlayerIndex) {
                nextPhase = 'playing';
                nextPlayerTurn = playerOrder[roomData.startingPlayerIndex!]; // Starting player leads the first trick
                 console.log("Bidding complete. Transitioning to playing phase.");
            }

            const updatedBids = {
                ...roomData.bids,
                [playerId]: currentBid
            };

            await updateDoc(roomRef, {
                [`bids.${playerId}`]: currentBid, // Update specific bid
                currentPlayerTurn: nextPlayerTurn,
                currentPhase: nextPhase,
                // Reset currentTrick when transitioning to playing phase
                ...(nextPhase === 'playing' && { currentTrick: null })
            });

            console.log(`Player ${playerName} bid ${currentBid}. Next turn: ${nextPlayerTurn}. Phase: ${nextPhase}`);
            toast({ 
                title: "Bid Submitted", 
                description: `You bid ${currentBid}.`,
                duration: 500 // 0.5 seconds
            });
            setCurrentBid(0); // Reset local bid input for next round

        } catch (error) {
            console.error("Error submitting bid:", error);
            toast({ 
                title: "Bid Error", 
                description: "Could not submit your bid. Please try again.", 
                variant: "destructive",
                duration: 500 // 0.5 seconds
            });
        } finally {
            setIsSubmittingBid(false);
        }
   };

   // --- Playing Logic ---
   const handlePlayCard = async (cardToPlay: Card) => {
        if (!roomData || !playerId || roomData.currentPlayerTurn !== playerId || roomData.currentPhase !== 'playing' || !currentRoomCode) {
            toast({ 
                title: "Not your turn", 
                description: "Wait for your turn to play.", 
                variant: "destructive",
                duration: 500
            });
            return;
        }

        const currentHand = roomData.playerHands?.[playerId];
        if (!currentHand || !currentHand.some(card => card.rank === cardToPlay.rank && card.suit === cardToPlay.suit)) {
            toast({ 
                title: "Invalid Card", 
                description: "You don't have that card.", 
                variant: "destructive",
                duration: 500
            });
            return;
        }

        // Validate following suit if possible
        const currentTrick = roomData.currentTrick;
        const leadingSuit = currentTrick?.leadingSuit;
        if (leadingSuit) {
            // Check if player has cards of the leading suit
            const hasLeadingSuit = currentHand.some(card => card.suit === leadingSuit);
            if (hasLeadingSuit && cardToPlay.suit !== leadingSuit) {
                toast({ 
                    title: "Invalid Play", 
                    description: `You must follow the leading suit (${leadingSuit}).`, 
                    variant: "destructive",
                    duration: 500
                });
                return;
            }
        }

        try {
            const roomRef = doc(db, 'rooms', currentRoomCode);
            const currentTrick = roomData.currentTrick || { leadingSuit: null, cardsPlayed: [], winner: null };
            const updatedCardsPlayed = [...currentTrick.cardsPlayed, { playerId, card: cardToPlay }];
            
            // Determine if this is the first card of the trick
            const isFirstCard = updatedCardsPlayed.length === 1;
            
            // Update player's hand by removing the played card
            const updatedHand = currentHand.filter(card => 
                !(card.rank === cardToPlay.rank && card.suit === cardToPlay.suit)
            );

            // Determine the next player
            const currentPlayerIndex = roomData.playerOrder?.indexOf(playerId) ?? -1;
            const nextPlayerIndex = (currentPlayerIndex + 1) % (roomData.playerOrder?.length ?? 0);
            const nextPlayerId = roomData.playerOrder?.[nextPlayerIndex];

            // Check if the trick is complete
            const isTrickComplete = updatedCardsPlayed.length === (roomData.playerOrder?.length ?? 0);
            
            let updates: any = {
                [`playerHands.${playerId}`]: updatedHand,
                'currentTrick.cardsPlayed': updatedCardsPlayed,
                'currentPlayerTurn': nextPlayerId
            };

            if (isFirstCard) {
                updates['currentTrick.leadingSuit'] = cardToPlay.suit;
            }

            if (isTrickComplete) {
                // Determine trick winner
                const trumpSuit = roomData.trumpSuit ?? null;
                const winningCard = determineTrickWinner(updatedCardsPlayed, trumpSuit, leadingSuit || cardToPlay.suit);
                const winnerId = winningCard.playerId;

                // Update scores and prepare for next trick
                updates = {
                    ...updates,
                    'currentTrick.winner': winnerId,
                    [`tricksWon.${winnerId}`]: (roomData.tricksWon?.[winnerId] || 0) + 1,
                    'currentPlayerTurn': winnerId, // Winner starts next trick
                    'currentTrick.cardsPlayed': [], // Clear played cards
                    'currentTrick.leadingSuit': null // Reset leading suit
                };

                // Check if round is complete (all cards played)
                const allHandsEmpty = Object.values(roomData.playerHands || {}).every(hand => {
                    if (!hand) return true; // If hand is null/undefined, consider it empty
                    return hand.length === 0;
                });
                
                if (allHandsEmpty) {
                    // Round is complete, calculate scores and prepare for next round
                    const playerScores: Scores = {};
                    const playerBids = roomData.bids || {};
                    const playerTricksWon = roomData.tricksWon || {};

                    // Calculate scores for each player
                    Object.keys(playerBids).forEach(playerId => {
                        const bid = playerBids[playerId] ?? 0;
                        const tricksWon = playerTricksWon[playerId] ?? 0;
                        const roundScore = calculateScore(bid, tricksWon);
                        playerScores[playerId] = (roomData.scores?.[playerId] || 0) + roundScore;
                    });

                    // Remove cards for next round (number of cards equal to number of players)
                    const numPlayers = roomData.players.length;
                    const remainingDeck = [...(roomData.remainingDeck || [])];
                    
                    // Remove cards equal to number of players and add to dead deck
                    const deadDeck = [...(roomData.deadDeck || [])];
                    for (let i = 0; i < numPlayers; i++) {
                        const randomIndex = Math.floor(Math.random() * remainingDeck.length);
                        deadDeck.push(remainingDeck[randomIndex]);
                        remainingDeck.splice(randomIndex, 1);
                    }
                    
                    // Shuffle the remaining deck
                    const shuffledDeck = shuffleDeck(remainingDeck);
                    
                    // Calculate cards per player for next round
                    const cardsPerPlayer = Math.floor(shuffledDeck.length / numPlayers);
                    
                    // Update game state for next round
                    await updateDoc(roomRef, {
                        'currentPhase': 'dealing', // Change to dealing phase
                        'scores': playerScores,
                        'remainingDeck': shuffledDeck,
                        'deadDeck': deadDeck, // Store removed cards in dead deck
                        'roundNumber': (roomData.roundNumber || 0) + 1,
                        'currentRound': cardsPerPlayer,
                        'cardsDealt': false, // Cards are not dealt yet
                        'playerHands': {}, // Clear all hands
                        'bids': {}, // Reset bids
                        'tricksWon': {}, // Reset tricks won
                        'currentPlayerTurn': roomData.playerOrder?.[0], // First player deals first
                        'currentTrick': null, // Reset current trick
                        'trumpSuit': roomData.trumpSuit, // Keep the same trump suit
                    });

                    toast({ 
                        title: "Round Complete", 
                        description: "Scores updated. Next player to deal cards.",
                        duration: 500
                    });
                }
            }

            await updateDoc(roomRef, updates);
            toast({ 
                title: "Card Played", 
                description: `${cardToPlay.rank}${cardToPlay.suit}`,
                duration: 500
            });

        } catch (error) {
            console.error("Error playing card:", error);
            toast({ 
                title: "Error", 
                description: "Failed to play card. Please try again.", 
                variant: "destructive",
                duration: 500
            });
        }
   };

   // Helper function to determine trick winner
   const determineTrickWinner = (cardsPlayed: { playerId: string, card: Card }[], trumpSuit: Suit | null, leadingSuit: Suit): { playerId: string, card: Card } => {
        let winningCard = cardsPlayed[0];
        
        for (let i = 1; i < cardsPlayed.length; i++) {
            const currentCard = cardsPlayed[i];
            
            // If current card is trump and winning card is not, current card wins
            if (currentCard.card.suit === trumpSuit && winningCard.card.suit !== trumpSuit) {
                winningCard = currentCard;
                continue;
            }
            
            // If winning card is trump and current card is not, winning card stays
            if (winningCard.card.suit === trumpSuit && currentCard.card.suit !== trumpSuit) {
                continue;
            }
            
            // If both cards are trump or both are not trump, compare ranks
            if (currentCard.card.suit === winningCard.card.suit) {
                if (rankOrder[currentCard.card.rank] > rankOrder[winningCard.card.rank]) {
                    winningCard = currentCard;
                }
            }
        }
        
        return winningCard;
   };


    // --- Full Reset Function ---
    const handleResetAndEnterName = () => {
        if (currentRoomCode && playerId && playerName) {
             console.log("Resetting: Attempting to leave room (if any) and clearing local state/storage.");
             // Perform leave in background, don't wait for it or block UI
             performLeaveTransaction(currentRoomCode, playerId, playerName).catch(err => {
                  console.warn("Error during background leave on reset:", err);
             });
        } else {
             console.log("Resetting: Clearing local state and storage.");
        }

        // Clear local storage
        if (typeof window !== 'undefined') {
            localStorage.removeItem(LS_PLAYER_NAME);
            localStorage.removeItem(LS_PLAYER_ID); // Keep player ID? Maybe generate new one? For now, clearing.
            localStorage.removeItem(LS_GAME_STAGE);
            localStorage.removeItem(LS_CURRENT_ROOM_CODE);
            console.log("Cleared all game state from localStorage.");
        }

         // Detach listener
         if (unsubscribeRef.current) {
             console.log("Detaching listener during full reset.");
             unsubscribeRef.current();
             unsubscribeRef.current = null;
         }

         // Reset React state
        setPlayerName('');
        setTempPlayerName('');
        setPlayerId(null); // Clear player ID
        setScreenStage('enterName');
        setCurrentRoomCode(null);
        setRoomData(null);
        setGameMessage('Enter your name to start.');
        setIsLoading(false);
        setIsLoadedFromStorage(false); // Mark as not loaded
        // Reset all action flags
        setIsCreating(false);
        setIsJoining(false);
        setIsLeaving(false);
        setIsEnding(false);
        setIsStartingGame(false);
        setIsSubmittingBid(false);
        setIsDealing(false); // Reset dealing flag

        // Regenerate Player ID immediately after clearing
        if (typeof window !== 'undefined') {
             const newPlayerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
             setPlayerId(newPlayerId); // Set the new ID in state
             localStorage.setItem(LS_PLAYER_ID, newPlayerId); // Save the new ID
             console.log("Regenerated new playerId after reset:", newPlayerId);
             // Mark as loaded after a short delay to allow state to settle and listener to potentially re-attach if needed
             setTimeout(() => setIsLoadedFromStorage(true), 50);
        }
    };


  // --- Render Logic ---


  // Initial loading screen while restoring state
   if (!isLoadedFromStorage) {
     return (
       <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
         <Loader2 className="h-16 w-16 animate-spin text-primary" />
         <p className="mt-4 text-lg text-muted-foreground">Loading game...</p>
       </div>
     );
   }


  // --- Render Enter Name Screen ---
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
                onChange={handleNameChange} // Update tempPlayerName
                placeholder="Your Name"
                className="text-lg"
                required
                autoFocus
                maxLength={20} // Add a reasonable max length
                disabled={!playerId || isActionLoading} // Disable if no player ID or action loading
              />
            </div>
             {/* Only enable button when name is entered */}
             <Button type="submit" className="w-full text-lg py-3" size="lg" disabled={isActionLoading || !tempPlayerName.trim() || !playerId}>
               {(!playerId) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {/* Show loader only if playerId isn't ready */}
              Enter Lobby
            </Button>
            {/* Display error message inline */}
            {!playerId && <p className="text-sm text-center text-muted-foreground pt-2">Initializing...</p>}
            {gameMessage && gameMessage.toLowerCase().includes('valid name') && <p className="text-sm text-center text-destructive pt-2">{gameMessage}</p>}

             {/* Button to fully reset state */}
             <Button variant="link" size="sm" onClick={handleResetAndEnterName} disabled={isActionLoading} className="w-full">
                 Reset / Change Name
             </Button>
          </form>
        </CardContent>
      </UICard>
    </div>
  );

    // --- Render Lobby Screen ---
  const renderLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
      <UICard className="w-full max-w-md shadow-2xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary text-center">Welcome, {playerName || '...'}!</CardTitle>
          {/* Game Message Area */}
          <UICardDescription className="text-center text-muted-foreground pt-2 min-h-[40px] flex items-center justify-center">
             {(isLoading || isCreating || isJoining) && <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" />}
             <span className="text-center">{gameMessage}</span>
          </UICardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
          {/* Create Game Button */}
          <Button onClick={handleCreateGame} className="w-full text-lg py-3" size="lg" variant="secondary" disabled={isActionLoading}>
            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2" />} Create Game
          </Button>

          {/* Join Game Dialog */}
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
                    onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())} // Force uppercase
                    className="col-span-3 uppercase tracking-widest" // Style for code
                    placeholder="CODE"
                    maxLength={4}
                    required
                    autoCapitalize="characters" // Hint for mobile keyboards
                    autoFocus
                    style={{ textTransform: 'uppercase' }} // Ensure display is uppercase
                    disabled={isJoining}
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isJoining}>Cancel</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isJoining || !joinRoomCode.trim() || joinRoomCode.length !== 4}>
                     {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     Join Game
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
           {/* End Join Game Dialog */}

           {/* Reset Button */}
          <Button variant="link" size="sm" onClick={handleResetAndEnterName} disabled={isActionLoading}>
             Change Name / Reset
          </Button>
        </CardContent>
      </UICard>
    </div>
  );

    // --- Render Game Lobby Screen ---
  const renderGameLobby = () => {
     // Determine if lobby is loading initial data
     const showLobbyLoading = isLoading && (!roomData || roomData.players.length === 0);
     const isHost = playerId === roomData?.hostId;
     const canStart = isHost && (roomData?.players?.length ?? 0) >= 3 && (roomData?.players?.length ?? 0) <= 6;


     return (
         <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-4 md:p-8">
             <UICard className="w-full max-w-lg shadow-2xl relative">
                 {/* Room Code Display */}
                 {currentRoomCode && (
                     <div className="absolute top-2 right-2 md:top-4 md:right-4 flex items-center space-x-2 z-10">
                         <Badge variant="secondary" className="text-base md:text-lg px-3 py-1 font-mono tracking-widest shadow-sm">{currentRoomCode}</Badge>
                         <Button variant="ghost" size="icon" onClick={handleCopyToClipboard} className="h-8 w-8 text-muted-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1" disabled={isActionLoading || hasCopied} title="Copy Room Code">
                             {hasCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                             <span className="sr-only">Copy Room Code</span>
                         </Button>
                     </div>
                 )}
                  {/* End Room Code Display */}

                 <CardHeader>
                     <CardTitle className="text-3xl font-bold text-primary text-center pt-4 md:pt-2">Game Lobby</CardTitle>
                     {/* Game Message Area */}
                     <UICardDescription className="text-center text-muted-foreground pt-2 min-h-[40px] flex items-center justify-center px-4">
                         {showLobbyLoading && <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" />}
                         <span className="text-center">{gameMessage}</span>
                     </UICardDescription>
                 </CardHeader>
                 <CardContent className="flex flex-col space-y-6">
                      {/* Player List */}
                     <div>
                         <h3 className="text-xl font-semibold text-secondary mb-3 text-center">Players ({roomData?.players?.length ?? 0} / 6)</h3>
                         <div className="max-h-60 overflow-y-auto px-2 border rounded-md bg-muted/20 py-2">
                             <ul className="space-y-2 text-center">
                                 {showLobbyLoading ? (
                                     <li className="text-lg text-muted-foreground italic p-2 flex items-center justify-center"> <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> Loading players...</li>
                                 ) : roomData?.players?.length ? (
                                     roomData.players.map((player) => (
                                         <li key={player.id} className="text-lg text-foreground p-2 bg-muted/30 rounded-md truncate flex items-center justify-center space-x-2 shadow-sm">
                                             {player.id === roomData.hostId && <Crown size={18} className="text-accent inline-block flex-shrink-0" aria-label="Host"/>}
                                             <span className="truncate" title={player.name}>{player.name}</span>
                                             {playerId === player.id && <span className="text-primary font-semibold ml-1 flex-shrink-0">(You)</span>}
                                         </li>
                                     ))
                                 ) : (
                                     !isLoading && <li className="text-lg text-muted-foreground italic p-2">Waiting for players...</li>
                                 )}
                                 {/* Placeholder slots */}
                                 {roomData && roomData.players.length < 6 && !showLobbyLoading && Array.from({ length: 6 - roomData.players.length }).map((_, i) => (
                                     <li key={`waiting-${i}`} className="text-lg text-muted-foreground italic p-2 bg-muted/10 rounded-md opacity-70">
                                         Waiting for player...
                                     </li>
                                 ))}
                             </ul>
                         </div>
                          {isHost && (roomData?.players?.length ?? 0) < 3 && <p className="text-center text-destructive text-sm mt-2">Need at least 3 players to start.</p>}
                     </div>
                      {/* End Player List */}

                     {/* Action Buttons */}
                     <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-4 pt-4">
                         {isHost && (
                             <Button
                                 className="text-lg py-3 px-6 w-full sm:w-auto"
                                 size="lg"
                                 disabled={isActionLoading || !canStart} // Use canStart flag
                                 onClick={handleStartGame}
                                 variant="secondary"
                                 title={!canStart ? "Need 3-6 players to start" : "Start the Game"}
                             >
                                 {isStartingGame ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2"/>}
                                 Start Game
                             </Button>
                         )}
                         {isHost ? (
                             <Button
                                 onClick={handleEndGame} // Host closes the lobby
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
                                 onClick={handleLeaveRoom} // Non-hosts leave
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
                     {/* End Action Buttons */}
                 </CardContent>
             </UICard>
         </div>
     );
   };


  // --- Render Game Screen ---
 const renderGame = () => {
   // --- Basic Data Checks ---
   if (!roomData || !playerId || !playerName || !roomData.gameStarted || !roomData.playerOrder || roomData.startingPlayerIndex === undefined) {
       // If essential game data is missing, show loading or error, then redirect
       console.warn("Attempted to render game stage without essential data. RoomData:", roomData);
        if (!isLoading) { // Avoid rapid redirects if just loading
            resetToLobby(playerName ? `Rejoining...` : 'Session invalid. Please enter name.');
        }
       return ( // Show loading indicator while potentially redirecting
         <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
           <Loader2 className="h-16 w-16 animate-spin text-primary" />
           <p className="mt-4 text-lg text-muted-foreground">Loading game state...</p>
         </div>
       );
   }
    if (!roomData.players.some(p => p.id === playerId)) {
        console.warn(`Player ${playerId} (${playerName}) is not in room ${currentRoomCode}. Redirecting.`);
         toast({ title: "Not in Room", description: "You were removed or the game changed.", variant: "destructive"});
         resetToLobby(playerName ? `Welcome back, ${playerName}! Please rejoin or create a game.` : 'Please enter your name.');
         return renderLobby(); // Or loading indicator
    }
   // --- End Basic Data Checks ---

   // --- Game State Variables ---
   const numPlayers = roomData.players.length;
   const playerOrder = roomData.playerOrder; // Guaranteed to exist by check above
   const currentPlayerId = playerId; // The ID of the player viewing the screen
   const localPlayerIndexInOrder = playerOrder.indexOf(currentPlayerId);
   const currentTurnPlayerId = roomData.currentPlayerTurn;
   const isMyTurn = currentTurnPlayerId === playerId;
   const currentPhase = roomData.currentPhase;
   const cardsInHand = roomData.currentRound ?? 0;
   const trumpSuit = roomData.trumpSuit ?? Suit.Spades; // Default to Spades if undefined
   const currentUserHand = (roomData.playerHands && roomData.playerHands[playerId]) ?? []; // Get hand, default to empty array
   const bids = roomData.bids ?? {};
   const scores = roomData.scores ?? {};
   const tricksWon = roomData.tricksWon ?? {};
   const cardsDealt = roomData.cardsDealt ?? false;
   const deckSize = roomData.remainingDeck?.length ?? 0;

    // Find current turn player's name
    const currentTurnPlayer = roomData.players.find(p => p.id === currentTurnPlayerId);
    const currentTurnPlayerName = currentTurnPlayer?.name ?? 'Someone';


   // --- Player Positioning Logic ---
   const getPlayerPosition = (displayIndex: number, totalPlayers: number, localPlayerDisplayIndex: number) => {
        // Calculate the relative index of the player being displayed compared to the local player
        const relativeIndex = (displayIndex - localPlayerDisplayIndex + totalPlayers) % totalPlayers;

        // Position calculation using angles on an oval
        const angleDegrees = (relativeIndex / totalPlayers) * 360;
        // Adjust angle so local player (relativeIndex 0) is at the bottom (270 degrees)
        const adjustedAngle = (angleDegrees + 270) % 360;
        const angleRadians = adjustedAngle * (Math.PI / 180);

        // Define the oval's dimensions (relative to the center of the table area)
        const horizontalRadius = 40; // Percentage of half-width
        const verticalRadius = 35;   // Percentage of half-height

        // Calculate position based on angle and radii
        let leftPercent = 50 + horizontalRadius * Math.cos(angleRadians);
        let topPercent = 50 + verticalRadius * Math.sin(angleRadians); // Y increases downwards

        // Adjustments to prevent overlap with header/footer/center
         if (adjustedAngle > 260 && adjustedAngle < 280) topPercent = 90; // Bottom player pushed down
         else if (adjustedAngle > 80 && adjustedAngle < 100) topPercent = 10; // Top player pushed up
         else if (topPercent > 85) topPercent = 85;
         else if (topPercent < 15) topPercent = 15;

         if (leftPercent > 85) leftPercent = 85;
         else if (leftPercent < 15) leftPercent = 15;


        // Apply transform to center the element at the calculated position
        const transform = `translate(-50%, -50%)`;

        return {
            position: 'absolute',
            left: `${leftPercent}%`,
            top: `${topPercent}%`,
            transform: transform,
            zIndex: 10, // Ensure player cards are above the table background but potentially below modal popups
        } as React.CSSProperties;
    };
   // --- End Player Positioning Logic ---

   // --- Render Individual Player Seat ---
   const renderPlayerSeat = (player: Player, displayIndex: number) => {
     const positionStyle = getPlayerPosition(displayIndex, numPlayers, localPlayerIndexInOrder);
     const isCurrentUser = player.id === playerId;
     const isCurrentTurn = player.id === currentTurnPlayerId;
     const playerHand = (roomData.playerHands && roomData.playerHands[player.id]) ?? []; // Default to empty array
     const handSize = playerHand?.length ?? 0;
     const playerBid = bids[player.id];
     const playerTricksWon = tricksWon[player.id] ?? 0;
     const playerScore = scores[player.id] ?? 0;

     // Determine display content based on phase
     let statusDisplay = "";
      if (currentPhase === 'dealing' && !cardsDealt) {
           statusDisplay = isCurrentTurn ? "Dealing..." : "Waiting to deal";
      } else if (currentPhase === 'bidding') {
          if (playerBid === null) {
              statusDisplay = isCurrentTurn ? "Bidding..." : "Waiting to bid";
          } else {
              statusDisplay = `Bid: ${playerBid}`;
          }
      } else if (currentPhase === 'playing' || currentPhase === 'scoring') {
           // Show Bid / Tricks Won
           statusDisplay = `Bid: ${playerBid ?? '-'} / Won: ${playerTricksWon}`;
      }


     return (
       <div
         key={player.id}
         style={positionStyle}
         className={cn(
            "absolute p-2 rounded-lg shadow-md flex flex-col items-center min-w-[120px] max-w-[150px] transition-all duration-300",
            isCurrentUser ? 'bg-primary/20 border-2 border-primary' : 'bg-card/90 border border-border',
            isCurrentTurn ? 'ring-2 ring-offset-2 ring-accent' : '', // Highlight current turn
            // Add styles for players who have finished bidding/playing?
         )}
       >
          {/* Player Name & Host Indicator */}
         <div className="flex items-center justify-center w-full mb-1">
             {player.id === roomData.hostId && <Crown size={16} className="text-accent inline-block mr-1 mb-0.5 flex-shrink-0" aria-label="Host"/>}
             <span className={`font-semibold truncate max-w-[100px] ${isCurrentUser ? 'text-primary-foreground' : 'text-card-foreground'}`} title={player.name}>
                 {player.name} {isCurrentUser ? '(You)' : ''}
             </span>
         </div>

         {/* Score */}
         <Badge variant="secondary" className="text-xs px-1.5 mb-1">Score: {playerScore}</Badge>

         {/* Status (Bid/Tricks Won) */}
         <div className="text-xs text-muted-foreground min-h-[16px] mb-1 text-center">{statusDisplay}</div>


         {/* Opponent Card Representation */}
         {!isCurrentUser && cardsDealt && (
            <div className="flex mt-1 space-x-[-35px] justify-center min-h-[60px] items-center px-1">
                {handSize > 0 ? (
                    // Show face-down cards for opponents
                    Array.from({ length: Math.min(handSize, 7) }).map((_, cardIndex) => ( // Limit displayed cards for opponents
                       <CardComponent
                           key={`${player.id}-facedown-${cardIndex}`}
                           card={null}
                           isFaceDown={true}
                           style={{ zIndex: cardIndex }}
                           className="w-12 h-18 opacity-80" // Slightly smaller/dimmer
                       />
                    ))
                ) : (
                     currentPhase !== 'bidding' && currentPhase !== 'dealing' && <div className="text-xs text-muted-foreground italic mt-1">Empty Hand</div>
                )}
            </div>
          )}
          {/* Current player's card count is shown near their hand */}
          {isCurrentUser && cardsDealt && currentPhase !== 'bidding' && currentPhase !== 'dealing' && <div className="text-xs text-muted-foreground italic mt-1">({handSize} cards)</div>}

       </div>
     );
   };
   // --- End Render Individual Player Seat ---

   // --- Render Dealing Interface ---
    const renderDealingInterface = () => {
        if (currentPhase !== 'dealing' || !isMyTurn || cardsDealt) return null;

        return (
            <div className="absolute top-[60px] right-2 z-40 bg-card/95 p-4 rounded-lg shadow-xl border border-primary flex flex-col items-center space-y-3">
                <h3 className="text-lg font-semibold text-primary">Your Turn to Deal</h3>
                 <Button onClick={handleDealCards} disabled={isDealing || isActionLoading} className="w-full">
                    {isDealing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Hand className="mr-2" />}
                     Deal Cards
                 </Button>
            </div>
        );
    };
    // --- End Render Dealing Interface ---

   // --- Render Bidding Interface ---
    const renderBiddingInterface = () => {
        if (currentPhase !== 'bidding' || !isMyTurn) return null;
        const maxBid = roomData.currentRound ?? 0;

        return (
            <div className="absolute top-[60px] right-2 z-40 bg-card/95 p-4 rounded-lg shadow-xl border border-primary flex flex-col items-center space-y-3">
                <h3 className="text-lg font-semibold text-primary">Your Bid</h3>
                <div className="flex items-center space-x-4">
                    <Button variant="outline" size="icon" onClick={() => handleBidChange(-1)} disabled={currentBid <= 0 || isSubmittingBid}>
                        <Minus size={18} />
                    </Button>
                    <span className="text-2xl font-bold w-12 text-center">{currentBid}</span>
                    <Button variant="outline" size="icon" onClick={() => handleBidChange(1)} disabled={currentBid >= maxBid || isSubmittingBid}>
                        <Plus size={18} />
                    </Button>
                </div>
                 <Button onClick={handleBidSubmit} disabled={isSubmittingBid || isActionLoading} className="w-full">
                    {isSubmittingBid ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Target className="mr-2" />}
                     Submit Bid
                 </Button>
            </div>
        );
    };
    // --- End Render Bidding Interface ---

    // --- Render Playing Interface ---
    const renderPlayingInterface = () => {
        if (currentPhase !== 'playing') return null;

        return (
            <div className="absolute top-[60px] right-2 z-40 bg-card/95 p-4 rounded-lg shadow-xl border border-primary flex flex-col items-center space-y-3">
                 <h3 className="text-lg font-semibold text-primary">
                    {isMyTurn ? "Your Turn to Play" : `Waiting for ${currentTurnPlayerName}...`}
                 </h3>
                 {isMyTurn && <p className="text-sm text-muted-foreground">(Click a card below to play)</p>}
            </div>
        );
    };
    // --- End Render Playing Interface ---

   // --- Main Game Screen Structure ---
   return (
     <div className="flex flex-col h-screen bg-gradient-to-br from-background to-card p-4 relative overflow-hidden">
       {/* Game Info Header */}
       <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-50 p-2 bg-card/80 rounded-lg shadow">
           <div className="flex items-center space-x-2">
                <Badge variant="secondary" className="hidden sm:inline-flex">Room: {currentRoomCode}</Badge>
                <Badge variant="outline">Round: {roomData.roundNumber ?? 'N/A'} ({cardsInHand} cards)</Badge>
           </div>
           <div className="text-center">
               <h2 className="text-xl font-bold text-primary hidden sm:block">Judgement</h2>
                <p className="text-sm text-muted-foreground flex items-center justify-center">
                    Trump: {trumpSuit === Suit.Spades ? <Spade className="w-4 h-4 mx-1 text-foreground" /> : <Diamond className="w-4 h-4 mx-1 text-red-600" />} {trumpSuit}
                </p>
           </div>
           <div className="space-x-2">
              {playerId === roomData.hostId ? ( // Host can always end
                  <Button variant="destructive" size="sm" onClick={handleEndGame} disabled={isActionLoading}>
                     {isEnding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     End Game
                  </Button>
              ) : ( // Others can leave
                  <Button variant="outline" size="sm" onClick={handleLeaveRoom} disabled={isActionLoading}>
                     {isLeaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     Leave Game
                  </Button>
              )}
           </div>
       </div>
       {/* End Game Info Header */}


        {/* Game Table Area - Increase margin-bottom to accommodate taller hand area */}
        <div className="flex-grow flex items-center justify-center mt-[60px] mb-[160px] relative"> {/* Increased mb */}
          {/* Player Seats */}
          {playerOrder.map((pId, index) => {
                const player = roomData.players.find(p => p.id === pId);
                if (!player) return null; // Should not happen
                return renderPlayerSeat(player, index);
           })}

           {/* Center Area - Deck and Current Trick */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center space-y-4 z-20">
                {/* Current Trick Display Area */}
                <div className="flex space-x-2 min-h-[100px] items-end p-2 bg-black/20 rounded-lg">
                   {roomData.currentTrick && roomData.currentTrick.cardsPlayed.length > 0 ? (
                        roomData.currentTrick.cardsPlayed.map(({ playerId: trickPlayerId, card }) => (
                           <div key={`trick-${trickPlayerId}`} className="flex flex-col items-center">
                                <CardComponent card={card} className="w-14 h-20" />
                                {/* Optional: Show player name who played it */}
                                {/* <span className="text-xs text-muted-foreground mt-1">{roomData.players.find(p => p.id === trickPlayerId)?.name}</span> */}
                           </div>
                        ))
                   ) : (
                       currentPhase === 'playing' && <div className="text-muted-foreground italic text-center w-full p-4">Waiting for first card...</div>
                   )}
                </div>

                 {/* Deck Placeholder */}
                 <div className="relative flex items-center justify-center w-18 h-26">
                    {/* Show deck only before cards are dealt */}
                     {!cardsDealt && deckSize > 0 ? (
                         <>
                           <CardComponent card={null} isFaceDown={true} />
                           <Badge variant="secondary" className="absolute -top-2 -right-2 px-1.5 py-0.5 text-xs z-10">
                               {deckSize}
                           </Badge>
                         </>
                     ) : (
                         cardsDealt && currentPhase !== 'gameOver' && <div className="w-16 h-24 border-2 border-dashed border-muted-foreground/50 rounded flex items-center justify-center text-muted-foreground text-xs text-center px-1 opacity-70">Deck Empty</div>
                     )}
                 </div>
           </div>
       </div>
        {/* End Game Table Area */}

       {/* Phase-Specific UI (Dealing/Bidding/Playing) - Adjusted bottom positioning */}
       {renderDealingInterface()}
       {renderBiddingInterface()}
       {renderPlayingInterface()}
       {/* TODO: Add scoring overlay/display */}


        {/* Current Player's Hand Area - Increased height and adjusted z-index */}
        <div className="absolute bottom-0 left-0 right-0 p-2 md:p-4 bg-card/90 shadow-inner z-30 flex flex-col items-center h-[160px]"> {/* Increased height */}
          {/* Player name and bid/tricks status */}
          <div className='flex space-x-4 items-center mb-2'> {/* Increased margin-bottom */}
            <span className="text-lg font-bold text-primary">{playerName} (You)</span>
             {cardsDealt && (
                 <span className='text-sm text-muted-foreground'>
                    {currentPhase === 'bidding' && (bids[playerId] === null ? "Awaiting your bid..." : `Your Bid: ${bids[playerId]}`)}
                    {(currentPhase === 'playing' || currentPhase === 'scoring') && `Bid: ${bids[playerId] ?? '-'} / Won: ${tricksWon[playerId] ?? 0}`}
                 </span>
             )}
          </div>
          {/* Hand Display */}
          <div className="flex space-x-[-45px] justify-center items-end h-[120px] w-full overflow-x-auto px-4 pb-1"> {/* Increased height */}
              {cardsDealt && currentUserHand.length > 0 ? (
                  currentUserHand
                    .sort((a, b) => { // Sort hand for consistent display
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
                         style={{ zIndex: index }} // Ensure cards stack correctly visually
                         // Add onClick handler for playing phase
                         onClick={
                            (currentPhase === 'playing' && isMyTurn)
                            ? () => handlePlayCard(card) // Call handlePlayCard
                            : undefined
                         }
                         className={cn(
                            "hover:-translate-y-2 transition-transform duration-150 flex-shrink-0",
                             (currentPhase === 'playing' && isMyTurn) ? "cursor-pointer hover:shadow-lg hover:border-primary" : "cursor-default", // Make clickable only during turn
                             // TODO: Add visual indication for playable cards based on currentTrick.leadingSuit
                             // Example: !isValidMove(card) ? 'opacity-50 pointer-events-none' : ''
                         )}
                      />
                  ))
              ) : (
                  cardsDealt && currentPhase !== 'bidding' && <div className="text-muted-foreground italic text-center w-full pt-10">Your hand is empty</div>
              )}
               {!cardsDealt && currentPhase !== 'gameOver' && (
                    <div className="text-muted-foreground italic text-center w-full pt-10">
                        {currentPhase === 'dealing' ? `Waiting for ${isMyTurn ? 'you' : currentTurnPlayerName} to deal...` : 'Waiting for cards...'}
                    </div>
               )}
          </div>
       </div>
       {/* End Current Player's Hand Area */}

     </div>
   );
 };
 // --- End Render Game Screen ---


  // --- Main Screen Stage Switching Logic ---

   // Show loading if not restored from storage yet
   if (!isLoadedFromStorage) {
     return (
       <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
         <Loader2 className="h-16 w-16 animate-spin text-primary" />
         <p className="mt-4 text-lg text-muted-foreground">Loading game...</p>
       </div>
     );
   }

   // Render based on the current screen stage
  switch (screenStage) {
    case 'enterName':
        // If player name exists but we are in enterName stage, likely a refresh issue, move to lobby
      if (playerName && playerId) {
          // console.warn("In enterName stage but playerName exists, redirecting to lobby.");
          if (screenStage === 'enterName') { // Only redirect if we're actually in enterName stage
             setScreenStage('lobby');
             setGameMessage(`Welcome back, ${playerName}! Create or join a game.`);
          }
          return renderLobby(); // Render lobby immediately
      }
      return renderEnterName(); // Render name entry screen

    case 'lobby':
       // If name or ID is missing, force back to enterName
       if (!playerName || !playerId) {
           console.warn("Attempted to render lobby without name or ID. Redirecting to enterName.");
           handleResetAndEnterName(); // Use full reset
           return renderEnterName(); // Render name entry

       }
       return renderLobby(); // Render main lobby screen

    case 'gameLobby':
        // If essential lobby data is missing, redirect back to lobby
        if (!playerName || !playerId || !currentRoomCode) {
            console.warn("Attempted to render gameLobby without necessary data. Redirecting to lobby.");
            // Only reset if not currently loading to avoid flicker
            if (!isLoading) {
                 resetToLobby(playerName ? `Error loading lobby ${currentRoomCode}. Please rejoin or create a game.` : 'Please enter your name.');
            }
             // Show loading or the lobby screen while redirecting
            return isLoading ? (
                <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                    <p className="mt-4 text-lg text-muted-foreground">Returning to lobby...</p>
                </div>
            ) : renderLobby();

        }
       return renderGameLobby(); // Render the specific game lobby screen

    case 'game':
        // Render the main game view
       return renderGame();

    default:
      // Fallback for unknown stage - reset everything
      console.error("Unrecognized screen stage:", screenStage, "Resetting to enterName.");
      handleResetAndEnterName();
      return renderEnterName();
  }
} // End of GamePage component

