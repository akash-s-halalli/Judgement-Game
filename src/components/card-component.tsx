'use client';

import React from 'react';
import type { Card } from '@/types/card';
import { cn } from '@/lib/utils';

interface CardComponentProps {
  card: Card | null; // Allow null for deck placeholder
  isFaceDown?: boolean;
  className?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, card: Card) => void;
}

const suitSymbols = {
  Hearts: '♥',
  Diamonds: '♦',
  Clubs: '♣',
  Spades: '♠',
};

const suitColors = {
  Hearts: 'text-red-600',
  Diamonds: 'text-red-600',
  Clubs: 'text-black', // Use black for dark suits on light card background
  Spades: 'text-black',
};


export function CardComponent({ card, isFaceDown = false, className, draggable = false, onDragStart }: CardComponentProps) {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (draggable && card && onDragStart) {
      onDragStart(e, card);
      e.dataTransfer.effectAllowed = "move";
    }
  };

  const baseClasses = "w-20 h-28 bg-white border border-border rounded-md shadow-md flex flex-col justify-between p-2 cursor-pointer select-none transition-all duration-300 ease-in-out hover:shadow-lg hover:-translate-y-1";
  const faceDownClasses = "bg-gradient-to-br from-accent to-secondary !text-transparent"; // Use theme colors for back

  if (isFaceDown || !card) {
    return (
      <div
        className={cn(baseClasses, faceDownClasses, className)}
        draggable={false} // Don't allow dragging face-down or placeholder cards for now
      >
        {/* Optional: Add a simple design to the card back */}
         <div className="w-full h-full flex items-center justify-center">
            {/* Placeholder for card back design - can be more elaborate */}
           <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground opacity-50"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
         </div>
      </div>
    );
  }

  const suitColor = suitColors[card.suit];

  return (
    <div
      className={cn(baseClasses, className)}
      draggable={draggable}
      onDragStart={handleDragStart}
    >
      <div className={`text-left text-xl font-bold ${suitColor}`}>
        <div>{card.rank}</div>
        <div>{suitSymbols[card.suit]}</div>
      </div>
      <div className={`text-center text-3xl font-bold ${suitColor}`}>
        {suitSymbols[card.suit]}
      </div>
      <div className={`text-right text-xl font-bold ${suitColor} transform rotate-180`}>
        <div>{card.rank}</div>
        <div>{suitSymbols[card.suit]}</div>
      </div>
    </div>
  );
}
