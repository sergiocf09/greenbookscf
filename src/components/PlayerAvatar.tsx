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

export function PlayerAvatar({
  initials,
  background,
  size = "md",
  className,
  isLoggedInUser = false,
}: PlayerAvatarProps) {
  // If logged-in user: Augusta green background + Augusta gold text
  // Otherwise: black border, white fill, black text (simple style)
  if (isLoggedInUser) {
    return (
      <div
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

  // Simple style for all other players: black ring, white fill, black text
  return (
    <div
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
