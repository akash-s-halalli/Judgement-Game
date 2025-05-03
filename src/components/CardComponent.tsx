
// src/components/CardComponent.tsx
import React from 'react';
import { Card as CardType, Suit, Rank, suitOrder, rankOrder } from '@/types/cards';
import { cn } from '@/lib/utils';

interface CardComponentProps extends React.HTMLAttributes<HTMLDivElement> {
  card: CardType | null; // Allow null for face-down or empty slots
  isFaceDown?: boolean;
}

const suitSymbols: Record<Suit, string> = {
  [Suit.Hearts]: '♥',
  [Suit.Diamonds]: '♦',
  [Suit.Clubs]: '♣',
  [Suit.Spades]: '♠',
};

const suitColors: Record<Suit, string> = {
  [Suit.Hearts]: 'text-red-600', // Use a distinct red
  [Suit.Diamonds]: 'text-red-600',
  [Suit.Clubs]: 'text-foreground', // Use foreground for black suits to respect theme
  [Suit.Spades]: 'text-foreground',
};

const rankDisplay: Record<Rank, string> = {
    [Rank.Two]: '2',
    [Rank.Three]: '3',
    [Rank.Four]: '4',
    [Rank.Five]: '5',
    [Rank.Six]: '6',
    [Rank.Seven]: '7',
    [Rank.Eight]: '8',
    [Rank.Nine]: '9',
    [Rank.Ten]: '10', // Use '10' for clarity
    [Rank.Jack]: 'J',
    [Rank.Queen]: 'Q',
    [Rank.King]: 'K',
    [Rank.Ace]: 'A',
};


const CardComponent: React.FC<CardComponentProps> = ({ card, isFaceDown = false, className, style, ...props }) => {
  if (isFaceDown || !card) {
    // Render face-down card
    return (
      <div
        className={cn(
          'w-16 h-24 bg-secondary rounded-md shadow-md border border-border flex items-center justify-center', // Basic dimensions and style
          'bg-gradient-to-br from-secondary via-accent/50 to-secondary', // Subtle gradient
          className // Allow overriding size, e.g., 'w-12 h-18'
        )}
        style={style}
        aria-hidden="true" // Hide from screen readers
        {...props}
      >
         {/* Optional: Add a subtle pattern or logo */}
         <div className="w-full h-full border border-primary/30 rounded-md pattern-dots pattern-primary/20 pattern-bg-secondary pattern-size-4 pattern-opacity-50"></div>
      </div>
    );
  }

  // Render face-up card
  const { suit, rank } = card;
  const symbol = suitSymbols[suit];
  const colorClass = suitColors[suit];
  const rankText = rankDisplay[rank];

  return (
    <div
      className={cn(
        'w-16 h-24 bg-card rounded-md shadow-lg border border-border p-1 flex flex-col justify-between relative text-sm font-semibold',
        colorClass, // Apply suit color
        className // Allow overriding size
      )}
       style={style}
      aria-label={`${rankText} of ${Object.keys(Suit).find(key => Suit[key as keyof typeof Suit] === suit)}`} // Accessibility label improved
      {...props}
    >
      {/* Top left rank and suit */}
      <div className="flex flex-col items-start leading-none"> {/* Simplified structure */}
        <span>{rankText}</span>
        <span>{symbol}</span>
      </div>

       {/* Center Suit Symbol (Larger) - adjusted size */}
       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className={cn("text-3xl opacity-80", colorClass)}>{symbol}</span>
       </div>


      {/* Bottom right rank and suit (rotated) */}
      <div className="flex flex-col items-end leading-none transform rotate-180"> {/* Simplified structure */}
        <span>{rankText}</span>
        <span>{symbol}</span>
      </div>
    </div>
  );
};

export default CardComponent;

