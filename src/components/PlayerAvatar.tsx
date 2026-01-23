import React from "react";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md";

const sizeClasses: Record<Size, string> = {
  xs: "w-4 h-4 text-[8px]",
  sm: "w-5 h-5 text-[9px]",
  md: "w-8 h-8 text-xs",
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.trim().replace("#", "");
  if (![3, 6].includes(cleaned.length)) return null;
  const full = cleaned.length === 3 ? cleaned.split("").map((c) => c + c).join("") : cleaned;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return null;
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

// Returns relative luminance (0..1)
function luminance(rgb: { r: number; g: number; b: number }) {
  const srgb = [rgb.r, rgb.g, rgb.b].map((v) => v / 255);
  const lin = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function isDarkHex(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  return luminance(rgb) < 0.45;
}

function inferTextClassFromBg(bg: string): string {
  // If caller already provides a text-* class, do not override.
  if (/\btext-/.test(bg)) return "";

  // Hex background color
  if (bg.trim().startsWith("#")) {
    return isDarkHex(bg) ? "text-golf-cream" : "text-golf-dark";
  }

  // Heuristic for Tailwind bg-* tokens used in this app
  const normalized = bg.replace(/\s+/g, " ");
  const lightBgMatchers = ["bg-golf-gold", "bg-golf-cream", "bg-golf-green-light", "bg-yellow", "bg-amber", "bg-lime"]; 
  const isLikelyLight = lightBgMatchers.some((m) => normalized.includes(m));
  if (isLikelyLight) return "text-golf-dark";

  // Default for most dark/strong colors
  return "text-golf-cream";
}

export function PlayerAvatar({
  initials,
  background,
  size = "md",
  className,
}: {
  initials: string;
  background: string;
  size?: Size;
  className?: string;
}) {
  const isHex = background.trim().startsWith("#");
  const textClass = inferTextClassFromBg(background);

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold",
        sizeClasses[size],
        !isHex && background,
        textClass,
        className
      )}
      style={isHex ? { backgroundColor: background } : undefined}
      aria-label={`Jugador ${initials}`}
    >
      {initials}
    </div>
  );
}
