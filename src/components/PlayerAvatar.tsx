import React from "react";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  xs: "w-4 h-4 text-[8px]",
  sm: "w-5 h-5 text-[9px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
};

interface PlayerAvatarProps {
  initials: string;
  background: string;
  size?: Size;
  className?: string;
  /** If true, uses Augusta colors (green bg + gold text). Otherwise, simple black/white style. */
  isLoggedInUser?: boolean;
}

export const PlayerAvatar = React.forwardRef<HTMLDivElement, PlayerAvatarProps>(
  ({ initials, background, size = "md", className, isLoggedInUser = false }, ref) => {
    if (isLoggedInUser) {
      return (
        <div
          ref={ref}
          className={cn(
            "rounded-full flex items-center justify-center font-bold bg-augusta-green text-augusta-gold",
            sizeClasses[size],
            className
          )}
          aria-label={`Jugador ${initials}`}
        >
          {initials}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-full flex items-center justify-center font-bold",
          "bg-white border-2 border-black text-black",
          sizeClasses[size],
          className
        )}
        aria-label={`Jugador ${initials}`}
      >
        {initials}
      </div>
    );
  }
);

PlayerAvatar.displayName = "PlayerAvatar";
