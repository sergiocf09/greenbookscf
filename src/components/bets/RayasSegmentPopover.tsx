/**
 * RayasSegmentPopover - Shows detailed breakdown of rayas for a segment (Front/Back)
 * Top row: Skins (hole-by-hole grid)
 * Bottom: 3 columns — Unidades | Oyes | Medal
 */
import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { RayaDetail } from '@/lib/rayasCalculations';
import { getAdjustedScoresForPair } from '@/lib/betCalculations';
import { getEffectiveSkinVariantForPair, getOyesModalityForPair } from '@/lib/rayasCalculations';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface UnitEvent {
  holeNumber: number;
  playerId: string;
  label: string;
  count: number;
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

  const adjustedScores = useMemo(
    () => getAdjustedScoresForPair(player, rival, confirmedScores, course, bilateralHandicaps),
    [player, rival, confirmedScores, course, bilateralHandicaps]
  );

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
          if (toPar === -1) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'Birdie', count: 1 });
          if (toPar === -2) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'Eagle', count: 2 });
          if (toPar <= -3) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'Albatross', count: 3 });
          if (score.markers.sandyPar) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'Sandy', count: 1 });
          if (score.markers.aquaPar) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'Aqua', count: 1 });
          if (score.markers.holeOut) events.push({ holeNumber: score.holeNumber, playerId: p.id, label: 'HoleOut', count: 1 });
        });
    });
    return events.sort((a, b) => a.holeNumber - b.holeNumber);
  }, [confirmedScores, player, rival, holeRange, course]);

  const unitsEnabled = betConfig.rayas?.segments?.units?.enabled !== false;

  // ── OYES: par 3 proximity comparison ──
  const oyesData = useMemo(() => {
    const par3Holes = [];
    for (let h = holeRange[0]; h <= holeRange[1]; h++) {
      const hole = course.holes[h - 1];
      if (hole && hole.par === 3) par3Holes.push(h);
    }

    const oyesModality = getOyesModalityForPair(betConfig, player.id, rival.id);
    const proxKey = oyesModality === 'sangron' ? 'oyesProximitySangron' : 'oyesProximity';

    return par3Holes.map(holeNumber => {
      const playerScores = confirmedScores.get(player.id) || [];
      const rivalScores = confirmedScores.get(rival.id) || [];
      const pScore = playerScores.find(s => s.holeNumber === holeNumber);
      const rScore = rivalScores.find(s => s.holeNumber === holeNumber);

      const pProx = pScore?.[proxKey] ?? pScore?.oyesProximity ?? null;
      const rProx = rScore?.[proxKey] ?? rScore?.oyesProximity ?? null;

      // Lower proximity = closer = winner
      let winner: 'player' | 'rival' | null = null;
      if (pProx != null && rProx != null) {
        if (pProx < rProx) winner = 'player';
        else if (rProx < pProx) winner = 'rival';
      } else if (pProx != null && rProx == null) {
        winner = 'player';
      } else if (rProx != null && pProx == null) {
        winner = 'rival';
      }

      return { holeNumber, pProx, rProx, winner };
    }).filter(d => d.pProx != null || d.rProx != null);
  }, [confirmedScores, player, rival, holeRange, course, betConfig]);

  const oyesEnabled = betConfig.rayas?.segments?.oyes?.enabled !== false;

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
        <div className="space-y-2">
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
                        'w-8 h-7 flex items-center justify-center text-[11px] font-bold rounded',
                        hole.winner === 'A' ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                        hole.winner === 'B' ? 'bg-red-100 dark:bg-red-900/30 text-destructive' :
                        hole.accumulated > 0 ? 'bg-muted text-muted-foreground' :
                        'bg-muted/50 text-muted-foreground'
                      )}>
                        {hole.winner === 'A' ? `+${hole.skinsWon}` :
                         hole.winner === 'B' ? `-${hole.skinsWon}` :
                         hole.accumulated > 0 ? `(${hole.accumulated})` : '•'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Skins total summary */}
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-[10px] font-bold text-green-700 dark:text-green-400">
                  {skinsHoles.filter(h => h.winner === 'A').reduce((s, h) => s + h.skinsWon, 0)}
                </span>
                <span className="text-[9px] text-muted-foreground">vs</span>
                <span className="text-[10px] font-bold text-destructive">
                  {skinsHoles.filter(h => h.winner === 'B').reduce((s, h) => s + h.skinsWon, 0)}
                </span>
              </div>
            </div>
          )}

          {/* ── 3-COLUMN SECTION: Unidades | Oyes | Medal ── */}
          <div className="grid grid-cols-3 gap-2 border-t border-border/30 pt-2">
            {/* UNIDADES column */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Unidades</div>
              {unitsEnabled && unitEvents.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {unitEvents.map((evt, i) => {
                    const isPlayer = evt.playerId === player.id;
                    return (
                      <span
                        key={i}
                        className={cn(
                          'text-[9px] px-1 py-0.5 rounded flex items-center justify-center gap-1',
                          isPlayer
                            ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                            : 'bg-red-500/15 text-red-700 dark:text-red-400'
                        )}
                      >
                        <span className="font-semibold">H{evt.holeNumber}</span>
                        <span>{evt.label}</span>
                        {evt.count > 1 && <span className="font-bold">×{evt.count}</span>}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[8px] text-muted-foreground text-center">—</p>
              )}
            </div>

            {/* OYES column */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Oyes</div>
              {oyesEnabled && oyesData.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {oyesData.map((d, i) => (
                    <span
                      key={i}
                      className={cn(
                        'text-[10px] px-1 py-0.5 rounded flex items-center justify-center gap-1.5',
                        d.winner === 'player'
                          ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                          : d.winner === 'rival'
                          ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                          : 'bg-muted/50 text-muted-foreground'
                      )}
                    >
                      <span className="font-semibold">H{d.holeNumber}</span>
                      <span>{d.pProx ?? '-'} vs {d.rProx ?? '-'}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[8px] text-muted-foreground text-center">—</p>
              )}
            </div>

            {/* MEDAL column */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Medal</div>
              {medalEnabled ? (
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[8px] text-muted-foreground">Neto</span>
                  <div className={cn(
                    'text-[10px] font-bold rounded px-1.5 py-0.5',
                    medalData.playerNet < medalData.rivalNet
                      ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                      : medalData.playerNet > medalData.rivalNet
                      ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                      : 'text-muted-foreground'
                  )}>
                    {medalData.playerNet} vs {medalData.rivalNet}
                  </div>
                </div>
              ) : (
                <p className="text-[8px] text-muted-foreground text-center">—</p>
              )}
            </div>
          </div>

          {/* Empty state */}
          {segmentDetails.length === 0 && unitEvents.length === 0 && oyesData.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-2">
              Sin rayas registradas en {segmentLabel}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
