/**
 * RayasSegmentPopover - Shows detailed breakdown of rayas for a segment (Front/Back)
 * Sections: Skins (hole-by-hole grid), Unidades (hole+concept), Oyes (par 3 results), Medal (net comparison)
 */
import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { RayaDetail } from '@/lib/rayasCalculations';
import { getAdjustedScoresForPair } from '@/lib/betCalculations';
import { getEffectiveSkinVariantForPair, getOyesModalityForPair } from '@/lib/rayasCalculations';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PlayerAvatar } from '@/components/PlayerAvatar';

interface UnitEvent {
  holeNumber: number;
  playerId: string;
  label: string;
  emoji: string;
  count: number; // rayas this event generates
}

interface RayasSegmentPopoverProps {
  segment: 'front' | 'back';
  player: Player;
  rival: Player;
  confirmedScores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  betConfig: BetConfig;
  bilateralHandicaps?: BilateralHandicap[];
  rayasDetails: RayaDetail[];
  basePlayerId?: string;
  children: React.ReactNode;
}

export const RayasSegmentPopover: React.FC<RayasSegmentPopoverProps> = ({
  segment,
  player,
  rival,
  confirmedScores,
  course,
  betConfig,
  bilateralHandicaps,
  rayasDetails,
  basePlayerId,
  children,
}) => {
  const holeRange = segment === 'front' ? [1, 9] : [10, 18];

  // Adjusted scores for bilateral handicap
  const adjustedScores = useMemo(
    () => getAdjustedScoresForPair(player, rival, confirmedScores, course, bilateralHandicaps),
    [player, rival, confirmedScores, course, bilateralHandicaps]
  );

  // Filter rayas details for this segment
  const segmentDetails = useMemo(
    () => rayasDetails.filter(d => d.appliedSegment === segment),
    [rayasDetails, segment]
  );

  const skinVariant = getEffectiveSkinVariantForPair(betConfig, player.id, rival.id);
  const useAccumulation = skinVariant === 'acumulados';

  // ── SKINS: hole-by-hole grid ──
  const skinsHoles = useMemo(() => {
    const holes: Array<{
      holeNumber: number;
      netA: number | null;
      netB: number | null;
      winner: 'A' | 'B' | null;
      skinsWon: number;
      accumulated: number;
    }> = [];

    let accumulated = 0;

    for (let h = holeRange[0]; h <= holeRange[1]; h++) {
      const scoresA = adjustedScores.get(player.id) || [];
      const scoresB = adjustedScores.get(rival.id) || [];
      const scoreA = scoresA.find(s => s.holeNumber === h);
      const scoreB = scoresB.find(s => s.holeNumber === h);
      const netA = scoreA?.netScore ?? scoreA?.strokes ?? null;
      const netB = scoreB?.netScore ?? scoreB?.strokes ?? null;

      if (netA === null || netB === null) {
        if (useAccumulation) accumulated++;
        holes.push({ holeNumber: h, netA, netB, winner: null, skinsWon: 0, accumulated });
        continue;
      }

      if (useAccumulation) accumulated++;

      if (netA < netB) {
        const won = useAccumulation ? accumulated : 1;
        holes.push({ holeNumber: h, netA, netB, winner: 'A', skinsWon: won, accumulated: 0 });
        if (useAccumulation) accumulated = 0;
      } else if (netB < netA) {
        const won = useAccumulation ? accumulated : 1;
        holes.push({ holeNumber: h, netA, netB, winner: 'B', skinsWon: won, accumulated: 0 });
        if (useAccumulation) accumulated = 0;
      } else {
        holes.push({ holeNumber: h, netA, netB, winner: null, skinsWon: 0, accumulated: useAccumulation ? accumulated : 0 });
      }
    }

    return holes;
  }, [adjustedScores, player.id, rival.id, holeRange, useAccumulation]);

  const skinsEnabled = segmentDetails.some(d => d.source === 'skins') ||
    betConfig.rayas?.segments?.skins?.enabled !== false;

  // ── UNITS: per-hole events ──
  const unitEvents = useMemo(() => {
    const events: UnitEvent[] = [];
    [player, rival].forEach(p => {
      const pScores = confirmedScores.get(p.id) || [];
      pScores
        .filter(s => s.holeNumber >= holeRange[0] && s.holeNumber <= holeRange[1])
        .forEach(score => {
          const holePar = course.holes[score.holeNumber - 1]?.par || 4;
          const toPar = score.strokes - holePar;
          if (toPar === -1) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'Birdie', emoji: '🐦', count: 1 });
          if (toPar === -2) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'Eagle', emoji: '🦅', count: 2 });
          if (toPar <= -3) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'Albatross', emoji: '🦤', count: 3 });
          if (score.markers.sandyPar) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'Sandy', emoji: '⛳', count: 1 });
          if (score.markers.aquaPar) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'Aqua', emoji: '💧', count: 1 });
          if (score.markers.holeOut) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'HoleOut', emoji: '🎯', count: 1 });
        });
    });
    return events.sort((a, b) => a.holeNumber - b.holeNumber);
  }, [confirmedScores, player, rival, holeRange, course]);

  const unitsEnabled = betConfig.rayas?.segments?.units?.enabled !== false;

  // ── OYES: par 3 results ──
  const oyesDetails = useMemo(
    () => segmentDetails.filter(d => d.source === 'oyes'),
    [segmentDetails]
  );
  const oyesEnabled = betConfig.rayas?.segments?.oyes?.enabled !== false;
  const oyesModality = getOyesModalityForPair(betConfig, player.id, rival.id);

  // ── MEDAL: net comparison ──
  const medalData = useMemo(() => {
    const getNet = (playerId: string) => {
      const pScores = adjustedScores.get(playerId) || [];
      return pScores
        .filter(s => s.confirmed && s.holeNumber >= holeRange[0] && s.holeNumber <= holeRange[1])
        .reduce((sum, s) => {
          const v = typeof s.netScore === 'number' ? s.netScore : (typeof s.strokes === 'number' ? s.strokes : null);
          return v === null ? sum : sum + v;
        }, 0);
    };
    const playerNet = getNet(player.id);
    const rivalNet = getNet(rival.id);
    const medalDetail = segmentDetails.find(d => d.source === 'medal' && d.segment === segment);
    return { playerNet, rivalNet, rayasCount: medalDetail?.rayasCount ?? 0 };
  }, [adjustedScores, player.id, rival.id, holeRange, segmentDetails, segment]);

  const medalEnabled = betConfig.rayas?.segments?.medal?.enabled !== false;

  const segmentLabel = segment === 'front' ? 'Front 9' : 'Back 9';

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[280px] max-w-[360px] p-3" side="top">
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted-foreground border-b border-border/50 pb-1">
            {segmentLabel} — Detalle de Rayas
          </div>

          {/* ── SKINS ── */}
          {skinsEnabled && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Skins</div>
              <div className="overflow-x-auto">
                <div className="flex gap-0.5 min-w-max">
                  {skinsHoles.map(hole => (
                    <div key={hole.holeNumber} className="flex flex-col items-center">
                      <span className="text-[8px] text-muted-foreground">{hole.holeNumber}</span>
                      <div className={cn(
                        'w-8 h-6 flex items-center justify-center text-[9px] font-bold rounded',
                        hole.winner === 'A' ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                        hole.winner === 'B' ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                        hole.accumulated > 0 ? 'bg-muted text-muted-foreground' :
                        'bg-muted/50 text-muted-foreground'
                      )}>
                        {hole.winner === 'A' ? `+${hole.skinsWon}` :
                         hole.winner === 'B' ? `-${hole.skinsWon}` :
                         hole.accumulated > 0 ? `(${hole.accumulated})` : '•'}
                      </div>
                      {/* Net scores below */}
                      <div className="flex flex-col items-center mt-0.5">
                        <span className={cn('text-[7px]', hole.winner === 'A' ? 'text-green-600 font-bold' : 'text-muted-foreground')}>
                          {hole.netA ?? '-'}
                        </span>
                        <span className={cn('text-[7px]', hole.winner === 'B' ? 'text-destructive font-bold' : 'text-muted-foreground')}>
                          {hole.netB ?? '-'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 text-[8px] text-muted-foreground">
                <PlayerAvatar initials={player.initials} background={player.color} size="xs" isLoggedInUser={player.id === basePlayerId || player.profileId === basePlayerId} />
                <span className="text-green-600">arriba</span>
                <span>·</span>
                <PlayerAvatar initials={rival.initials} background={rival.color} size="xs" isLoggedInUser={rival.id === basePlayerId || rival.profileId === basePlayerId} />
                <span className="text-destructive">abajo</span>
              </div>
            </div>
          )}

          {/* ── UNIDADES ── */}
          {unitsEnabled && unitEvents.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Unidades</div>
              <div className="flex flex-wrap gap-1">
                {unitEvents.map((evt, i) => {
                  const isPlayer = evt.playerId === player.id;
                  return (
                    <span
                      key={i}
                      className={cn(
                        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]',
                        isPlayer
                          ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                          : 'bg-red-500/15 text-red-700 dark:text-red-400'
                      )}
                    >
                      <span className="font-semibold">H{evt.holeNumber}</span>
                      <span>{evt.emoji}</span>
                      <span>{evt.label}</span>
                      {evt.count > 1 && <span className="font-bold">×{evt.count}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── OYES ── */}
          {oyesEnabled && oyesDetails.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Oyes {oyesModality === 'sangron' ? '(Sangrón)' : '(Acumulado)'}
              </div>
              <div className="flex flex-wrap gap-1">
                {oyesDetails.map((d, i) => {
                  const isPlayerWin = d.rayasCount > 0;
                  return (
                    <span
                      key={i}
                      className={cn(
                        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]',
                        isPlayerWin
                          ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                          : 'bg-red-500/15 text-red-700 dark:text-red-400'
                      )}
                    >
                      <span className="font-semibold">H{d.holeNumber}</span>
                      <span>⛳</span>
                      <span>{isPlayerWin ? 'Ganado' : 'Perdido'}</span>
                      {Math.abs(d.rayasCount) > 1 && <span className="font-bold">×{Math.abs(d.rayasCount)}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── MEDAL ── */}
          {medalEnabled && medalData.rayasCount !== 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Medal</div>
              <div className={cn(
                'flex items-center justify-between px-2 py-1 rounded text-xs',
                medalData.rayasCount > 0
                  ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                  : 'bg-red-500/15 text-red-700 dark:text-red-400'
              )}>
                <span>Neto: <span className="font-bold">{medalData.playerNet}</span> vs <span className="font-bold">{medalData.rivalNet}</span></span>
                <span className="font-bold">{medalData.rayasCount > 0 ? '+1' : '-1'} raya</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {segmentDetails.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-2">
              Sin rayas registradas en {segmentLabel}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
