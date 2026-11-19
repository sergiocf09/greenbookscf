import React from 'react';
import { Star } from 'lucide-react';
import { trs } from '@/i18n/tr';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface StablefordHoleDetailRow {
  id: string;
  initials: string;
  color: string;
  isLoggedInUser?: boolean;
  holePoints: Array<{ holeNumber: number; points: number; strokesReceived: number }>;
  pointsFront: number;
  pointsBack: number;
}

const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const GRID = 'grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5';

const pointClass = (points: number | undefined) =>
  points === undefined ? 'text-muted-foreground' :
  points >= 3 ? 'bg-amber-500/30 text-amber-700' :
  points >= 2 ? 'bg-green-500/30 text-green-700' :
  points >= 1 ? 'bg-blue-500/20 text-blue-600' :
  points === 0 ? 'bg-muted/50' :
  'bg-red-500/20 text-destructive';

/** Shared Stableford hole-by-hole grid (group bet popover and leaderboards). */
export const StablefordHoleDetail: React.FC<{ rows: StablefordHoleDetailRow[]; label?: string }> = ({ rows, label }) => {
  const renderHalf = (holes: number[], half: 'front' | 'back') => (
    <>
      <div className={cn(GRID, 'text-[8px] text-muted-foreground', half === 'back' && 'mt-2')}>
        <div></div>
        {holes.map(h => <div key={h} className="text-center">{h}</div>)}
        <div className="text-center font-semibold">{half === 'front' ? trs("F9") : trs("B9")}</div>
      </div>
      {rows.map(r => (
        <div key={`${r.id}-${half}`} className={cn(GRID, 'items-center')}>
          <PlayerAvatar initials={r.initials} background={r.color} size="sm" isLoggedInUser={r.isLoggedInUser} />
          {holes.map(h => {
            const hp = r.holePoints.find(p => p.holeNumber === h);
            return (
              <div key={h} className={cn('text-center text-[10px] font-bold rounded py-0.5 relative', pointClass(hp?.points))}>
                {hp?.points ?? '-'}
                {hp && hp.strokesReceived > 0 && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-foreground" />}
              </div>
            );
          })}
          <div className="text-center text-[10px] font-bold bg-muted/50 rounded py-0.5">
            {half === 'front' ? r.pointsFront : r.pointsBack}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className="space-y-2">
      <div className="font-semibold text-sm flex items-center gap-2">
        <Star className="h-4 w-4 text-amber-500" />
        {trs("Stableford - Detalle por Hoyo")} {label ? `(${label})` : ''}
      </div>
      {renderHalf(FRONT, 'front')}
      {renderHalf(BACK, 'back')}
      <div className="border-t-2 border-primary/40 pt-2 mt-2 text-center text-[10px] text-muted-foreground">
        {trs("Toca afuera para cerrar")}
      </div>
    </div>
  );
};

export interface StablefordTapEntry {
  participant: { id: string; initials?: string; avatar_color?: string; profile_id?: string | null };
  holesPlayed: number;
  stablefordHoles?: Array<{ holeNumber: number; points: number; strokesReceived: number }>;
}

/** Leaderboard rows → hole-detail rows (front/back summed from the same per-hole points). */
export const leaderboardStablefordRows = (entries: StablefordTapEntry[], viewerProfileId?: string | null): StablefordHoleDetailRow[] =>
  entries.filter(e => e.holesPlayed > 0).map(e => {
    const holes = e.stablefordHoles ?? [];
    return {
      id: e.participant.id,
      initials: e.participant.initials || '??',
      color: e.participant.avatar_color || '#3B82F6',
      isLoggedInUser: !!viewerProfileId && e.participant.profile_id === viewerProfileId,
      holePoints: holes,
      pointsFront: holes.filter(h => h.holeNumber <= 9).reduce((a, h) => a + h.points, 0),
      pointsBack: holes.filter(h => h.holeNumber > 9).reduce((a, h) => a + h.points, 0),
    };
  });

/** Wraps a leaderboard table so tapping it opens the Stableford hole-by-hole detail. */
export const StablefordTapDetail: React.FC<{
  enabled: boolean;
  entries: StablefordTapEntry[];
  viewerProfileId?: string | null;
  children: React.ReactNode;
}> = ({ enabled, entries, viewerProfileId, children }) => {
  if (!enabled) return <>{children}</>;
  const hint = trs("Toca la tabla para ver el detalle por hoyo");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div role="button" tabIndex={0} className="cursor-pointer" aria-label={hint}>
          {children}
          <p className="text-center text-[10px] text-muted-foreground pt-1">{hint}</p>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] max-h-[70vh] overflow-y-auto" side="top">
        <StablefordHoleDetail rows={leaderboardStablefordRows(entries, viewerProfileId)} />
      </PopoverContent>
    </Popover>
  );
};
