import { trs } from '@/i18n/tr';
import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  LEADERBOARD_DEFAULT_STABLEFORD_POINTS,
  type LeaderboardStablefordPoints,
} from '@/lib/leaderboardAggregation';

const ROWS: { key: keyof LeaderboardStablefordPoints; label: string }[] = [
  { key: 'albatross', label: 'Albatros' },
  { key: 'eagle', label: 'Águila' },
  { key: 'birdie', label: 'Birdie' },
  { key: 'par', label: 'Par' },
  { key: 'bogey', label: 'Bogey' },
  { key: 'doubleBogey', label: 'Doble Bogey' },
  { key: 'tripleBogey', label: 'Triple Bogey' },
  { key: 'quadrupleOrWorse', label: 'Cuádruple+' },
];

interface Props {
  value: LeaderboardStablefordPoints;
  onChange: (v: LeaderboardStablefordPoints) => void;
}

/** Editable Stableford point table (net score vs par) for leaderboards. */
export const StablefordPointsEditor: React.FC<Props> = ({ value, onChange }) => (
  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
    <div className="flex items-center justify-between">
      <p className="text-xs font-medium">{trs("Puntos Stableford (score neto vs par)")}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-[11px]"
        onClick={() => onChange({ ...LEADERBOARD_DEFAULT_STABLEFORD_POINTS })}
      >
        {trs("Restablecer")}
      </Button>
    </div>
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {ROWS.map(r => (
        <label key={r.key} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{trs(r.label)}</span>
          <Input
            type="number"
            inputMode="numeric"
            className="h-7 w-14 text-center text-xs px-1"
            value={value[r.key]}
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              onChange({ ...value, [r.key]: Number.isFinite(n) ? n : 0 });
            }}
          />
        </label>
      ))}
    </div>
  </div>
);

export default StablefordPointsEditor;
