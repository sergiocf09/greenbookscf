import React from 'react';
import { cn } from '@/lib/utils';

interface RoundHolesBadgeProps {
  holes: 9 | 18 | undefined | null;
  className?: string;
  /** Use accent (gold) styling on dark/primary backgrounds (e.g. AppHeader). */
  onPrimary?: boolean;
}

/**
 * Compact badge that signals whether a round was played as 9H or 18H.
 * Always renders both cases for redundant signaling — 9H draws attention
 * (accent), 18H stays neutral (outline).
 */
export const RoundHolesBadge: React.FC<RoundHolesBadgeProps> = ({
  holes,
  className,
  onPrimary,
}) => {
  const value = holes === 9 ? 9 : 18;
  const label = `${value}H`;
  const is9 = value === 9;

  const base =
    'inline-flex items-center justify-center rounded-full font-semibold text-[10px] leading-none px-1.5 h-4 border';

  const variant = onPrimary
    ? is9
      ? 'bg-accent text-accent-foreground border-accent'
      : 'bg-primary-foreground/15 text-primary-foreground border-primary-foreground/30'
    : is9
      ? 'bg-accent text-accent-foreground border-accent'
      : 'bg-transparent text-foreground border-border';

  return (
    <span className={cn(base, variant, className)} aria-label={`Ronda de ${value} hoyos`}>
      {label}
    </span>
  );
};
