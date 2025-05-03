// src/app/page.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card as UICard, CardContent, CardHeader, CardTitle, CardDescription as UICardDescription } from '@/components/ui/card';
import { Swords, UserPlus, LogOut, Copy, Check } from 'lucide-react';
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

// Game stages: 'enterName' -> 'lobby' -> 'gameLobby' -> 'game' (future)
type GameStage = 'enterName' | 'lobby' | 'gameLobby' | 'game';

// Simple room code generation utility (excluding 'O' and '0')
const generateRoomCode = (length = 4): string => {
  const characters = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};


export default function GamePage() {
  const [gameStage, setGameStage] = useState<GameStage>('enterName');
  const [playerName, setPlayerName] = useState<string>('');
  const [joinRoomCode, setJoinRoomCode] = useState<string>('');
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null); // For the host/creator
  const [playersInLobby, setPlayersInLobby] = useState<string[]>([]);
  const [gameMessage, setGameMessage] = useState<string>('Enter your name to start.');
  const [isJoinGameDialogOpen, setIsJoinGameDialogOpen] = useState<boolean>(false);
  const [hasCopied, setHasCopied] = useState(false);
  const { toast } = useToast();


  // --- Name Handling ---
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = playerName.trim();
    if (trimmedName) {
      setPlayerName(trimmedName); // Store the trimmed name
      setGameStage('lobby');
      setGameMessage(`Welcome, ${trimmedName}! Create a game or join one.`);
    } else {
      // Show error inline or use toast
      toast({
        title: "Invalid Name",
        description: "Please enter a valid name.",
        variant: "destructive",
      });
      setGameMessage('Please enter a valid name.'); // Keep message for inline display too
    }
  };

  // --- Lobby Actions ---
  const handleCreateGame = () => {
    const newRoomCode = generateRoomCode();
    console.log(`${playerName} is creating a game with code: ${newRoomCode}`);
    setCreatedRoomCode(newRoomCode);
    setPlayersInLobby([playerName]); // Creator is the first player
    setGameStage('gameLobby');
    setGameMessage(`Lobby created. Share the code ${newRoomCode} with friends!`);
    setHasCopied(false); // Reset copy status when creating a new game
  };

  const handleJoinGameSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const codeToJoin = joinRoomCode.trim().toUpperCase(); // Standardize input
      if (codeToJoin) {
          // Placeholder for joining game logic (needs backend/state management)
          console.log(`${playerName} is attempting to join game with code: ${codeToJoin}`);
          setIsJoinGameDialogOpen(false); // Close dialog

          // --- Simulation ---
          // In a real app, you'd validate the code and fetch lobby state from a backend/P2P connection.
          // For now, we simulate joining successfully.
          setCreatedRoomCode(codeToJoin); // Assume we joined the room with this code (client-side only)
          // Simulate fetching players - assume 'HostPlayer' created it
          setPlayersInLobby(['HostPlayer', playerName]); // Simulate creator + joiner
          setGameStage('gameLobby');
          setGameMessage(`Joined game lobby ${codeToJoin}. Waiting for host to start...`);
          setJoinRoomCode(''); // Clear input field
          // --- End Simulation ---

          toast({
             title: "Joined Lobby (Simulated)",
             description: `You've joined the lobby with code ${codeToJoin}.`,
          });

      } else {
          toast({
             title: "Invalid Code",
             description: "Please enter a room code.",
             variant: "destructive",
          });
      }
  };

  // --- Game Lobby Actions ---
  const handleLeaveLobby = () => {
    setGameStage('lobby');
    setCreatedRoomCode(null); // Clear the room code as we left/it's no longer relevant
    setPlayersInLobby([]); // Clear players
    setGameMessage(`Welcome back, ${playerName}! Create a game or join one.`);
    // In a real app, notify other players or backend
    console.log(`${playerName} left the lobby.`);
  };

  const handleCopyToClipboard = useCallback(() => {
    if (createdRoomCode) {
      navigator.clipboard.writeText(createdRoomCode).then(() => {
        setHasCopied(true);
        toast({
          title: "Copied!",
          description: "Room code copied to clipboard.",
        });
        setTimeout(() => setHasCopied(false), 2000); // Reset icon after 2 seconds
      }).catch(err => {
        console.error('Failed to copy room code: ', err);
         toast({
           title: "Copy Failed",
           description: "Could not copy room code automatically. Please copy it manually.",
           variant: "destructive",
         });
      });
    }
  }, [createdRoomCode, toast]); // Added dependencies

  // --- Game Logic Placeholders (to be implemented later) ---
  // const handleStartGame = () => { ... }


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
              />
            </div>
            <Button type="submit" className="w-full text-lg py-3" size="lg">
              Enter Lobby
            </Button>
             {/* Show validation error message */}
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
           {/* Personalize the welcome message */}
           <CardTitle className="text-3xl font-bold text-primary text-center">Welcome, {playerName}!</CardTitle>
           <UICardDescription className="text-center text-muted-foreground pt-2">{gameMessage}</UICardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
           {/* Button to create a new game */}
           <Button onClick={handleCreateGame} className="w-full text-lg py-3" size="lg" variant="secondary">
            <Swords className="mr-2" /> Create Game
           </Button>

           {/* Dialog for joining an existing game */}
           <Dialog open={isJoinGameDialogOpen} onOpenChange={setIsJoinGameDialogOpen}>
             <DialogTrigger asChild>
               <Button className="w-full text-lg py-3" size="lg" variant="outline">
                 <UserPlus className="mr-2" /> Join Game
               </Button>
             </DialogTrigger>
             <DialogContent className="sm:max-w-[425px] bg-card border-border">
               <DialogHeader>
                 <DialogTitle className="text-primary">Join Game</DialogTitle>
                 <DialogDescription className="text-muted-foreground">
                   Enter the room code provided by your friend to join their game.
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
                     className="col-span-3 uppercase" // Force uppercase visually
                     placeholder="CODE"
                     maxLength={4} // Assuming 4-char code
                     required
                     autoCapitalize="characters" // Suggest uppercase for mobile
                     autoFocus
                     style={{textTransform: 'uppercase'}} // Ensure text is visually uppercase
                   />
                 </div>
                 <DialogFooter>
                     {/* Close button for the dialog */}
                     <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                     </DialogClose>
                     {/* Submit button to join the game */}
                   <Button type="submit">Join Game</Button>
                 </DialogFooter>
               </form>
             </DialogContent>
           </Dialog>

           {/* Optional: Button to go back to name entry */}
            <Button variant="link" size="sm" onClick={() => { setGameStage('enterName'); setPlayerName(''); setGameMessage('Enter your name to start.'); }}>
                Change Name
            </Button>

        </CardContent>
      </UICard>
    </div>
  );

  // Render the game lobby screen
  const renderGameLobby = () => (
     <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-card p-8">
        <UICard className="w-full max-w-lg shadow-2xl relative"> {/* Increased max-w for better layout */}
            {/* Display Room Code and Copy Button - Top Right */}
            {createdRoomCode && (
               <div className="absolute top-4 right-4 flex items-center space-x-2">
                  <Badge variant="secondary" className="text-lg px-3 py-1 font-mono tracking-widest">{createdRoomCode}</Badge>
                  <Button variant="ghost" size="icon" onClick={handleCopyToClipboard} className="h-8 w-8 text-muted-foreground hover:text-primary">
                    {/* Show Check icon when copied, otherwise show Copy icon */}
                    {hasCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                    <span className="sr-only">Copy Room Code</span>
                  </Button>
               </div>
            )}
            <CardHeader>
                <CardTitle className="text-3xl font-bold text-primary text-center">Game Lobby</CardTitle>
                 {/* Display dynamic messages like 'Waiting for players...' */}
                <UICardDescription className="text-center text-muted-foreground pt-2">{gameMessage}</UICardDescription>
            </CardHeader>
            <CardContent className="flex flex-col space-y-6">
                 <div>
                     {/* Player List Section */}
                     <h3 className="text-xl font-semibold text-secondary mb-3 text-center">Players ({playersInLobby.length})</h3>
                     <ul className="space-y-2 text-center max-h-60 overflow-y-auto px-2"> {/* Added scroll for long player lists */}
                         {/* Map through joined players and display their names */}
                         {playersInLobby.map((player, index) => (
                             <li key={index} className="text-lg text-foreground p-2 bg-muted/30 rounded-md truncate"> {/* Added truncate for long names */}
                                 {player}
                                 {/* Indicate which player is 'You' */}
                                 {player === playerName && <span className="text-primary font-semibold ml-1">(You)</span>}
                             </li>
                         ))}
                         {/* Placeholder slots for players yet to join (visual only) */}
                         {playersInLobby.length < 4 && Array.from({ length: 4 - playersInLobby.length }).map((_, i) => (
                             <li key={`waiting-${i}`} className="text-lg text-muted-foreground italic p-2 bg-muted/10 rounded-md">
                                 Waiting for player...
                             </li>
                         ))}
                     </ul>
                 </div>

                 {/* Action Buttons */}
                 <div className="flex justify-center space-x-4 pt-4">
                     {/* Start Game Button (Placeholder - Only Host should see/use) */}
                     {/* Logic: Check if current player is the first player in the list (host) */}
                     {playersInLobby.length > 0 && playersInLobby[0] === playerName && (
                       <Button
                         className="text-lg py-3 px-6"
                         size="lg"
                         disabled // Disabled for now - game logic not implemented
                         // onClick={handleStartGame} // Add this when ready
                       >
                          Start Game (Soon™)
                       </Button>
                     )}
                     {/* Leave Lobby Button */}
                    <Button onClick={handleLeaveLobby} className="text-lg py-3 px-6" size="lg" variant="outline">
                        <LogOut className="mr-2" /> Leave Lobby
                    </Button>
                 </div>
            </CardContent>
        </UICard>
     </div>
  );

  // Removed renderGame function as it's not used yet


  // Main component logic to switch between different game stages
  switch (gameStage) {
    case 'enterName':
      return renderEnterName(); // Show name entry screen first
    case 'lobby':
      return renderLobby();     // Show create/join screen after name entry
    case 'gameLobby':
      return renderGameLobby(); // Show the lobby after creating or joining
    case 'game':
      // Placeholder for the actual game view (to be implemented)
      return <div className="flex items-center justify-center min-h-screen text-xl text-primary">Game will be here...</div>;
    default:
      return renderEnterName(); // Fallback to name entry screen
  }
}
