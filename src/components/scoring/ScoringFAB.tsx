import React from 'react';
import { BookOpen, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScoringFABProps {
  currentHole: number;
  onClick: () => void;
  isOnScoringView?: boolean;
  isOnBetsView?: boolean;
}

export const ScoringFAB: React.FC<ScoringFABProps> = ({
  currentHole,
  onClick,
  isOnScoringView = false,
  isOnBetsView = false,
}) => {
  // Hide on scoring view since user is already there
  if (isOnScoringView) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed z-50 flex items-center justify-center rounded-full shadow-lg transition-all duration-300",
        "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95",
        "bottom-6 right-6",
        // Slightly smaller & lower opacity on bets view to avoid blocking content
        isOnBetsView
          ? "h-14 w-14 opacity-90"
          : "h-16 w-16",
        // Safe area padding for iOS
        "safe-bottom"
      )}
      style={{
        // Extra safe area for iOS notch
        bottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px) + 0.75rem)',
        right: 'max(1.5rem, env(safe-area-inset-right, 0px) + 0.75rem)',
      }}
      aria-label={`Capturar scores - Hoyo ${currentHole}`}
    >
      {/* Notebook + Pencil icon composition */}
      <div className="relative">
        <BookOpen className={cn(isOnBetsView ? "h-6 w-6" : "h-7 w-7")} />
        <Pencil className={cn(
          "absolute -bottom-1 -right-1.5",
          isOnBetsView ? "h-3 w-3" : "h-3.5 w-3.5"
        )} />
      </div>

      {/* Hole number badge */}
      <div
        className={cn(
          "absolute flex items-center justify-center rounded-full",
          "bg-accent text-accent-foreground font-bold shadow-md",
          "border-2 border-primary-foreground/30",
          isOnBetsView
            ? "-top-1 -left-1 h-6 w-6 text-[10px]"
            : "-top-1.5 -left-1.5 h-7 w-7 text-xs"
        )}
      >
        {currentHole}
      </div>
    </button>
  );
};
