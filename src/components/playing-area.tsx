'use client';

import React from 'react';
import type { Card } from '@/types/card';
import { CardComponent } from './card-component';
import { cn } from '@/lib/utils';

interface PlayingAreaProps {
  playedCards: { [playerId: number]: Card | null }; // Track card played by each player this round/trick
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  numberOfPlayers: number;
  currentPlayerId: number; // ID of the user viewing the game
  currentTurnPlayerId: number;
}

export function PlayingArea({
  playedCards,
  onDrop,
  onDragOver,
  numberOfPlayers,
  currentPlayerId,
  currentTurnPlayerId
}: PlayingAreaProps) {
  return (
    <div
      className="flex-1 bg-card/50 border-4 border-dashed border-primary/50 rounded-lg p-6 flex items-center justify-around min-h-[200px] my-4 transition-all duration-300 ease-in-out"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {Object.keys(playedCards).length === 0 && (
         <div className="text-muted-foreground italic text-lg">Drop cards here to play</div>
      )}
      {/* Render played cards, maybe position them based on player ID */}
      {Object.entries(playedCards).map(([playerIdStr, card]) => {
         const playerId = parseInt(playerIdStr, 10);
         // Basic positioning - needs refinement for more players
         let positionClass = '';
         if (numberOfPlayers <= 2) {
            positionClass = playerId === currentPlayerId ? 'self-end mb-2' : 'self-start mt-2';
         } else {
            // More complex positioning needed for 3+ players (e.g., around a circle)
             positionClass = 'mx-2'; // Placeholder
         }

         return card ? (
          <div key={playerId} className={cn("flex flex-col items-center", positionClass)}>
             <CardComponent card={card} className="shadow-xl" />
             <span className={cn(
               "mt-2 text-xs font-semibold",
                playerId === currentTurnPlayerId ? "text-primary" : "text-muted-foreground"
             )}>
               Player {playerId}
            </span>
          </div>
        ) : null;
      })}
    </div>
  );
}
