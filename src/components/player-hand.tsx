'use client';

import React from 'react';
import type { Card } from '@/types/card';
import { CardComponent } from './card-component';
import { cn } from '@/lib/utils';

interface PlayerHandProps {
  playerId: number;
  cards: Card[];
  isCurrentPlayer: boolean;
  isTurn: boolean;
  onCardPlay: (card: Card) => void; // Callback when a card is dragged/played
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void; // Add drag end handler
}

export function PlayerHandComponent({
  playerId,
  cards,
  isCurrentPlayer,
  isTurn,
  onCardPlay,
  onDragOver,
  onDrop,
  onDragEnd, // Receive drag end handler
}: PlayerHandProps) {

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, card: Card) => {
    if (isTurn && isCurrentPlayer) {
      e.dataTransfer.setData('text/plain', card.id);
      e.dataTransfer.setData('application/json', JSON.stringify(card)); // Pass card data
    } else {
      e.preventDefault(); // Prevent dragging if not player's turn
    }
  };

  return (
    <div
      className={cn(
        "p-4 border-2 rounded-lg mb-4 min-h-[150px] flex items-center space-x-[-40px] justify-center transition-all duration-300", // Overlap cards slightly
        isTurn ? 'border-primary shadow-lg' : 'border-muted' ,
         `player-hand-${playerId}` // Add specific class for potential targeting
      )}
      onDragOver={onDragOver} // Allow dropping onto the hand area (e.g., returning a card - not implemented yet)
      onDrop={onDrop} // Handle drop events if needed in the future
    >
      {cards.length === 0 && (
          <div className="text-muted-foreground italic">Empty Hand</div>
      )}
      {cards.map((card, index) => (
        <CardComponent
          key={card.id}
          card={card}
          draggable={isCurrentPlayer && isTurn}
          onDragStart={(e) => handleDragStart(e, card)}
          onDragEnd={onDragEnd} // Pass drag end handler down
          className={cn(
             "relative transition-transform duration-200 ease-out",
             isCurrentPlayer && isTurn ? "hover:-translate-y-4 hover:z-10" : "cursor-not-allowed", // Lift card on hover if draggable
             `z-${index}` // Basic z-index stacking
          )}
        />
      ))}
    </div>
  );
}
