'use client';

import React from 'react';
import { CardComponent } from './card-component';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DeckComponentProps {
  remainingCards: number;
  onDrawCard?: () => void; // Optional: If drawing is a button click
  isTurn: boolean; // To enable/disable draw button
}

export function DeckComponent({ remainingCards, onDrawCard, isTurn }: DeckComponentProps) {
  const canDraw = isTurn && remainingCards > 0 && onDrawCard;

  return (
    <div className="flex flex-col items-center space-y-2">
       <div className="relative">
        {remainingCards > 1 && (
             <div className="absolute w-20 h-28 bg-gradient-to-br from-accent to-secondary rounded-md shadow-md transform translate-x-1 translate-y-1 border border-border opacity-70"></div>
        )}
        {remainingCards > 0 ? (
          <CardComponent card={null} isFaceDown={true} />
        ) : (
          <div className="w-20 h-28 border-2 border-dashed border-muted rounded-md flex items-center justify-center text-muted-foreground text-xs px-2 text-center">
            Deck Empty
          </div>
        )}
       </div>
      <span className="text-sm text-foreground mb-2">Deck: {remainingCards}</span>
      {onDrawCard && (
        <Button onClick={onDrawCard} disabled={!canDraw} size="sm" variant="secondary">
          Draw Card
        </Button>
      )}
    </div>
  );
}
