import React from 'react';
import { BookOpen, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScoringFABProps {
  currentHole: number;
  onClick: () => void;
  isOnScoringView?: boolean;
  isOnBetsView?: boolean;
  isOnBetSetupView?: boolean;
}

export const ScoringFAB: React.FC<ScoringFABProps> = ({
  currentHole,
  onClick,
  isOnScoringView = false,
  isOnBetsView = false,
  isOnBetSetupView = false,
}) => {
  // Hide on scoring view since user is already there
  if (isOnScoringView) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed z-50 flex items-center justify-center rounded-full shadow-lg transition-all duration-300",
        "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95",
        "bottom-6",
        "h-14 w-14",
        isOnBetsView && "opacity-90",
        // Safe area padding for iOS
        "safe-bottom"
      )}
      style={{
        bottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px) + 0.75rem)',
        // Shift left on bet setup to avoid blocking collapsible arrows
        right: isOnBetSetupView
          ? 'max(4rem, env(safe-area-inset-right, 0px) + 3.25rem)'
          : 'max(1.5rem, env(safe-area-inset-right, 0px) + 0.75rem)',
      }}
      aria-label={`Capturar scores - Hoyo ${currentHole}`}
    >
      {/* Notebook + Pencil icon composition */}
      <div className="relative">
        <BookOpen className="h-6 w-6" />
        <Pencil className="absolute -bottom-1 -right-1.5 h-3 w-3" />
      </div>

      {/* Hole number badge */}
      <div
        className={cn(
          "absolute flex items-center justify-center rounded-full",
          "bg-accent text-accent-foreground font-bold shadow-md",
          "border-2 border-primary-foreground/30",
          "-top-1 -left-1 h-6 w-6 text-[10px]"
        )}
      >
        {currentHole}
      </div>
    </button>
  );
};
