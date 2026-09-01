import React from 'react';
import { cn } from '@/lib/utils';

export type TeeColor = 'blue' | 'white' | 'yellow' | 'red';

const TEE_META: Record<TeeColor, { bg: string; ring: string; label: string; text: string }> = {
  blue:   { bg: '#3b82f6', ring: '#1d4ed8', label: 'A', text: '#ffffff' },
  white:  { bg: '#ffffff', ring: '#94a3b8', label: 'B', text: '#0f172a' },
  yellow: { bg: '#facc15', ring: '#a16207', label: 'M', text: '#422006' },
  red:    { bg: '#ef4444', ring: '#991b1b', label: 'R', text: '#ffffff' },
};

interface Props {
  value: TeeColor | null;
  onChange: (v: TeeColor) => void;
  size?: 'xxs' | 'xs' | 'sm';
  className?: string;
}

/**
 * Tee selector chips — four colored dots (Blue/White/Yellow/Red) so the user
 * can pick which tee the player will play from. Letters: A/B/M/R (es).
 */
export const TeePicker: React.FC<Props> = ({ value, onChange, size = 'xs', className }) => {
  const sizeCls =
    size === 'sm' ? 'w-6 h-6 text-[10px]' :
    size === 'xxs' ? 'w-4 h-4 text-[8px]' :
    'w-5 h-5 text-[9px]';
  return (
    <div className={cn('flex gap-1 shrink-0', className)}>
      {(Object.keys(TEE_META) as TeeColor[]).map(c => {
        const meta = TEE_META[c];
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              'rounded-full border-2 font-bold flex items-center justify-center transition-all',
              sizeCls,
              active ? 'ring-2 ring-offset-1 ring-foreground/60' : 'opacity-70 hover:opacity-100',
            )}
            style={{
              backgroundColor: meta.bg,
              borderColor: meta.ring,
              color: meta.text,
            }}
            aria-label={`Tee ${c}`}
            title={`Tee ${c}`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
};
