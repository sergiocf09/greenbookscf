/**
 * Reusable visualization for Bloques bet results between two players.
 * - Two-line summary header (Ganados / Perdidos) with totals
 * - Horizontal strip of blocks; click opens a Popover with a mini-scorecard
 *   matching the visual style used by Carritos / Foursomes detail popovers.
 */
import React, { useMemo } from 'react';
import { Player, GolfCourse } from '@/types/golf';
import { BloqueResult } from '@/lib/bets/bloques';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { fmtMoney } from '@/lib/formatMoney';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { disambiguateInitials } from '@/lib/playerInput';
import { cn } from '@/lib/utils';

interface Props {
  playerA: Player;
  playerB: Player;
  blocks: BloqueResult[];
  course: GolfCourse;
  /** Bilateral handicap to apply when computing per-hole gross/net (already used by the engine). */
  handicapA?: number;
  handicapB?: number;
  /** Score lookup by player id → array of {holeNumber, strokes} */
  getStrokes: (playerId: string, hole: number) => number | null;
  /** Used to apply Augusta colors only to the logged-in user's avatar. */
  basePlayerId?: string;
  /** All players in scope so initials are disambiguated app-wide. */
  allPlayers?: Player[];
  className?: string;
}

export const BloquesStrip: React.FC<Props> = ({
  playerA, playerB, blocks, course, handicapA = 0, handicapB = 0, getStrokes,
  basePlayerId, allPlayers, className,
}) => {
  const strokesA = calculateStrokesPerHole(handicapA, course);
  const strokesB = calculateStrokesPerHole(handicapB, course);

  const disambiguated = useMemo(
    () => disambiguateInitials(allPlayers && allPlayers.length > 0 ? allPlayers : [playerA, playerB]),
    [allPlayers, playerA, playerB]
  );
  const getAbbr = (p: Player) => disambiguated.get(p.id) || p.initials;
  const isBase = (p: Player) =>
    !!basePlayerId && (p.id === basePlayerId || p.profileId === basePlayerId);

  const wonA: BloqueResult[] = [];
  const wonB: BloqueResult[] = [];
  const tiedResolved: BloqueResult[] = [];
  let totalA = 0;
  let totalB = 0;

  for (const b of blocks) {
    if (!b.resolved) continue;
    if (b.winnerId === playerA.id) { wonA.push(b); totalA += b.amountAtStake; }
    else if (b.winnerId === playerB.id) { wonB.push(b); totalB += b.amountAtStake; }
    else tiedResolved.push(b);
  }

  const renderList = (arr: BloqueResult[]) => arr.map(b => `B${b.blockNumber}`).join(', ');

  return (
    <div className={cn('space-y-2', className)}>
      {/* Two-line summary */}
      <div className="space-y-0.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            <span className="text-green-600 font-semibold">Ganados:</span>{' '}
            {wonA.length > 0 ? renderList(wonA) : '—'}
          </span>
          <span className="font-bold tabular-nums text-green-600">
            {totalA > 0 ? `+$${fmtMoney(totalA)}` : '$0'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            <span className="text-destructive font-semibold">Perdidos:</span>{' '}
            {wonB.length > 0 ? renderList(wonB) : '—'}
          </span>
          <span className="font-bold tabular-nums text-destructive">
            {totalB > 0 ? `-$${fmtMoney(totalB)}` : '$0'}
          </span>
        </div>
        {tiedResolved.length > 0 && (
          <div className="text-[11px] text-amber-600">
            Empate: {renderList(tiedResolved)}
          </div>
        )}
      </div>

      {/* Block strip */}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${blocks.length}, minmax(0, 1fr))` }}>
        {blocks.map(blk => {
          const isTie = blk.resolved && blk.winnerId === null;
          const aWon = blk.resolved && blk.winnerId === playerA.id;
          const bgCls = !blk.resolved
            ? 'bg-muted/30 text-muted-foreground/60'
            : isTie
              ? 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
              : aWon
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';

          const pill = (
            <button
              type="button"
              className={cn(
                'w-full flex flex-col items-center justify-center py-1.5 rounded text-[10px] font-medium border border-transparent',
                bgCls,
                blk.isCarry && 'ring-1 ring-amber-400/60',
                blk.resolved && 'hover:opacity-90 cursor-pointer',
              )}
            >
              <span className="font-bold">B{blk.blockNumber}</span>
              <span className="tabular-nums text-[9px]">
                {!blk.resolved ? '—'
                  : isTie ? `=$${fmtMoney(blk.amountAtStake)}`
                  : aWon ? `+$${fmtMoney(blk.amountAtStake)}`
                  : `-$${fmtMoney(blk.amountAtStake)}`}
              </span>
            </button>
          );

          if (!blk.resolved) {
            return <div key={blk.blockNumber}>{pill}</div>;
          }

          // Build hole list
          const holes: number[] = [];
          for (let h = blk.startHole; h <= blk.endHole; h++) holes.push(h);

          return (
            <Popover key={blk.blockNumber}>
              <PopoverTrigger asChild>{pill}</PopoverTrigger>
              <PopoverContent side="top" className="w-[95vw] max-w-sm p-3">
                <div className="text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">
                      Bloque {blk.blockNumber} · h{blk.startHole}-{blk.endHole}
                    </p>
                    <span className={cn('font-bold tabular-nums',
                      isTie ? 'text-amber-600' : aWon ? 'text-green-600' : 'text-destructive'
                    )}>
                      {isTie
                        ? `=$${fmtMoney(blk.amountAtStake)}`
                        : aWon
                          ? `+$${fmtMoney(blk.amountAtStake)}`
                          : `-$${fmtMoney(blk.amountAtStake)}`}
                    </span>
                  </div>

                  {blk.isCarry && (
                    <p className="text-[10px] text-amber-600">
                      Incluye carry del bloque anterior (importe acumulado)
                    </p>
                  )}

                  {/* Mini-scorecard */}
                  <div className="rounded border border-border/60 overflow-hidden">
                    <div
                      className="grid bg-muted/40 text-[10px] font-medium"
                      style={{ gridTemplateColumns: `minmax(64px,1fr) repeat(${holes.length}, minmax(0,1fr)) 42px` }}
                    >
                      <div className="px-2 py-1">Hoyo</div>
                      {holes.map(h => (
                        <div key={h} className="text-center py-1">{h}</div>
                      ))}
                      <div className="text-center py-1">Σ</div>
                    </div>
                    <div
                      className="grid text-[11px]"
                      style={{ gridTemplateColumns: `minmax(64px,1fr) repeat(${holes.length}, minmax(0,1fr)) 42px` }}
                    >
                      <div className="px-2 py-1 text-muted-foreground">Par</div>
                      {holes.map(h => {
                        const par = course.holes[h - 1]?.par ?? 4;
                        return <div key={h} className="text-center py-1 text-muted-foreground tabular-nums">{par}</div>;
                      })}
                      <div className="text-center py-1 text-muted-foreground tabular-nums">
                        {holes.reduce((s, h) => s + (course.holes[h - 1]?.par ?? 4), 0)}
                      </div>
                    </div>
                    {[
                      { p: playerA, strokes: strokesA },
                      { p: playerB, strokes: strokesB },
                    ].map(row => {
                      let sumNet = 0;
                      const cells = holes.map(h => {
                        const g = getStrokes(row.p.id, h);
                        if (g === null) return { h, gross: null as number | null, net: null as number | null, hasStroke: false };
                        const recv = row.strokes[h - 1] ?? 0;
                        const net = g - recv;
                        sumNet += net;
                        return { h, gross: g, net, hasStroke: recv > 0 };
                      });
                      return (
                        <div
                          key={row.p.id}
                          className="grid text-[11px] border-t border-border/40"
                          style={{ gridTemplateColumns: `minmax(64px,1fr) repeat(${holes.length}, minmax(0,1fr)) 42px` }}
                        >
                          <div className="px-2 py-1 flex items-center gap-1.5 truncate">
                            <PlayerAvatar
                              initials={getAbbr(row.p)}
                              background={row.p.color}
                              size="xs"
                              isLoggedInUser={isBase(row.p)}
                            />
                          </div>
                          {cells.map(c => (
                            <div key={c.h} className="text-center py-1 tabular-nums relative">
                              {c.net === null ? (
                                <span className="text-muted-foreground/60">–</span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5">
                                  {c.hasStroke && <span className="text-foreground">•</span>}
                                  <span>{c.net}</span>
                                </span>
                              )}
                            </div>
                          ))}
                          <div className="text-center py-1 font-semibold tabular-nums">
                            {cells.some(c => c.net === null) ? '–' : sumNet}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[11px]">
                    <span className="text-muted-foreground">Suma neta</span>
                    <span className="tabular-nums font-medium">
                      {blk.playerNetSum} <span className="text-muted-foreground">vs</span> {blk.rivalNetSum}
                    </span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
};

export default BloquesStrip;
