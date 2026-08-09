import React, { useMemo } from 'react';
import { Player, TeamHandicapConfig, TeamHandicapMode } from '@/types/golf';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';
import { disambiguateShortNames, formatPlayerName } from '@/lib/playerInput';
import { cn } from '@/lib/utils';

const TEE_LABELS: Record<string, string> = {
  blue: 'Azul',
  white: 'Blanco',
  yellow: 'Dorado',
  gold: 'Dorado',
  red: 'Rojo',
  black: 'Negro',
  green: 'Verde',
};

const HANDICAP_MODE_LABELS: Record<TeamHandicapMode, string> = {
  individual: 'Full Hándicap',
  baseCero: 'Base Cero',
  diferencialEquipo: 'Diferencial Equipo',
  slidingEquipo: 'Sliding Equipo',
};

const fmtHcp = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export interface TeamBetSegment {
  /** e.g. "Tramo 1" */
  label: string;
  /** Holes belonging to this segment (physical hole numbers, in play order). */
  holes: number[];
  teamA: Player[];
  teamB: Player[];
  teamALabel?: string;
  teamBLabel?: string;
}

export interface TeamBetHandicapInfoProps {
  /** Players participating in this bet (order used for display). */
  players: Player[];
  /** Optional: Team A players (shown on the LEFT column). Base pair goes here. */
  teamA?: Player[];
  /** Optional: Team B players (shown on the RIGHT column). */
  teamB?: Player[];
  /** Optional labels for each team column. */
  teamALabel?: string;
  teamBLabel?: string;
  /** Effective strokes used by the engine, keyed by player.id (or profileId). */
  effectiveHandicaps?: Record<string, number>;
  handicapConfig?: TeamHandicapConfig;
  /** Short line describing how the bet is played (e.g. "Low Ball · Presión al 3"). */
  modalityLine?: string;
  /** Card title shown inside the popover header. */
  title?: string;
  /** When false, the bet plays gross (no handicaps). */
  useHandicap?: boolean;
  /** Optional note appended at the bottom (bet-specific rule). */
  note?: string;
  /** Course, required to show where each stroke falls per segment. */
  course?: GolfCourse;
  /** Segment-by-segment breakdown (Sixes / Vegas dynamic pairings). */
  segments?: TeamBetSegment[];
  className?: string;
}



/**
 * Small ℹ️ trigger for the header of team-bet result cards.
 * Shows, for audit purposes: how the bet is played, which handicap modality was
 * applied, each player's course handicap + tee, and the resulting strokes each
 * player receives in THIS bet (taken from the same values the engine uses).
 */
export const TeamBetHandicapInfo: React.FC<TeamBetHandicapInfoProps> = ({
  players,
  teamA,
  teamB,
  teamALabel = 'Equipo A',
  teamBLabel = 'Equipo B',
  effectiveHandicaps,
  handicapConfig,
  modalityLine,
  title = 'Hándicaps de la apuesta',
  useHandicap = true,
  note,
  className,
}) => {

  const shortNames = useMemo(() => disambiguateShortNames(players), [players]);
  const getName = (p: Player) => shortNames.get(p.id) || formatPlayerName(p.name).split(' ')[0];

  const mode: TeamHandicapMode = handicapConfig?.mode ?? 'individual';

  const rows = players.map(p => {
    const courseHcp = p.handicap ?? 0;
    let strokes = courseHcp;
    if (!useHandicap) {
      strokes = 0;
    } else if (effectiveHandicaps) {
      const direct = effectiveHandicaps[p.id];
      const byProfile = p.profileId ? effectiveHandicaps[p.profileId] : undefined;
      if (typeof direct === 'number' && Number.isFinite(direct)) strokes = direct;
      else if (typeof byProfile === 'number' && Number.isFinite(byProfile)) strokes = byProfile;
    }
    return { player: p, courseHcp, strokes };
  });

  const minHcp = rows.length ? Math.min(...rows.map(r => r.courseHcp)) : 0;
  const receivers = rows.filter(r => r.strokes > 0);

  const rowById = new Map(rows.map(r => [r.player.id, r]));
  const pickRows = (list?: Player[]) =>
    (list ?? []).map(p => rowById.get(p.id)).filter((r): r is typeof rows[number] => !!r);
  const rowsA = pickRows(teamA);
  const rowsB = pickRows(teamB);
  const grouped = rowsA.length > 0 && rowsB.length > 0;
  const sum = (list: typeof rows) => list.reduce((s, r) => s + r.courseHcp, 0);
  const sumStrokes = (list: typeof rows) => list.reduce((s, r) => s + r.strokes, 0);
  const sumA = sum(rowsA);
  const sumB = sum(rowsB);
  const diffTeams = Math.abs(sumA - sumB);
  const higherTeam = sumA === sumB ? null : sumA > sumB ? 'A' : 'B';

  const TeamColumn = ({ label, teamRows, align }: { label: string; teamRows: typeof rows; align: 'left' | 'right' }) => (
    <div className="min-w-0">
      <div
        className={cn(
          'px-2 py-1 bg-muted/60 text-[9px] uppercase tracking-wide text-muted-foreground font-semibold',
          align === 'right' ? 'text-right' : 'text-left',
        )}
      >
        {label}
      </div>
      {teamRows.map(({ player, courseHcp, strokes }) => (
        <div
          key={player.id}
          className={cn(
            'px-2 py-1 border-t border-border/50 text-[11px] tabular-nums flex items-baseline gap-1.5',
            align === 'right' ? 'flex-row-reverse text-right' : 'text-left',
          )}
        >
          <span className="truncate flex-1 min-w-0">{getName(player)}</span>
          <span className="text-muted-foreground shrink-0">{fmtHcp(courseHcp)}</span>
          <span className={cn('font-semibold shrink-0 w-9', strokes > 0 ? 'text-primary' : 'text-muted-foreground', align === 'right' ? 'text-left' : 'text-right')}>
            {strokes > 0 ? `+${fmtHcp(strokes)}` : '0'}
          </span>
        </div>
      ))}
      <div
        className={cn(
          'px-2 py-1 border-t border-border bg-muted/30 text-[10px] tabular-nums flex items-baseline gap-1.5 font-semibold',
          align === 'right' ? 'flex-row-reverse text-right' : 'text-left',
        )}
      >
        <span className="flex-1 min-w-0 text-muted-foreground uppercase text-[9px]">Suma</span>
        <span className="shrink-0">{fmtHcp(sum(teamRows))}</span>
        <span className={cn('shrink-0 w-9 text-primary', align === 'right' ? 'text-left' : 'text-right')}>
          {sumStrokes(teamRows) > 0 ? `+${fmtHcp(sumStrokes(teamRows))}` : '0'}
        </span>
      </div>
    </div>
  );


  const calcText = useMemo(() => {
    if (!useHandicap) {
      return 'Esta apuesta se juega a score gross: nadie recibe golpes.';
    }
    switch (mode) {
      case 'baseCero': {
        const base = rows.find(r => r.courseHcp === minHcp);
        return `Base Cero: el hándicap de campo más bajo (${base ? getName(base.player) : '—'}, ${fmtHcp(minHcp)}) queda en 0 y cada rival recibe la diferencia contra él (HCP campo − ${fmtHcp(minHcp)}).`;
      }
      case 'diferencialEquipo': {
        const list = receivers.map(r => `${getName(r.player)} +${fmtHcp(r.strokes)}`).join(', ');
        return `Diferencial Equipo: se compara la suma de hándicaps de campo de cada pareja y solo el equipo con hándicap más alto recibe la diferencia${list ? ` (${list})` : ''}.`;
      }
      case 'slidingEquipo': {
        const half = handicapConfig?.slidingHalfPointMode === 'halfPoint';
        const list = receivers.map(r => `${getName(r.player)} +${fmtHcp(r.strokes)}`).join(', ');
        return `Sliding Equipo: se toman los cuatro cruces bilaterales (A-C, A-D, B-C, B-D) de la matriz de hándicaps y se consolidan en la ventaja del equipo${list ? ` (${list})` : ''}. Medio punto: ${half ? 'sí' : 'no (se redondea hacia abajo)'}.`;
      }
      default:
        return 'Full Hándicap: cada jugador juega su hándicap de campo completo (según su tee), sin ajustes entre equipos.';
    }
  }, [mode, useHandicap, rows, minHcp, receivers, handicapConfig?.slidingHalfPointMode]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-6 w-6 text-muted-foreground hover:text-primary', className)}
          title="Ver hándicaps y modalidad"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
          <span className="sr-only">Ver hándicaps y modalidad</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[360px] max-h-[70vh] overflow-y-auto p-3">
        <div className="space-y-2">
          <div className="font-semibold text-xs flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-primary" />
            {title}
          </div>

          {modalityLine && (
            <div className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Modalidad:</span> {modalityLine}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">HCP:</span>{' '}
            {useHandicap ? HANDICAP_MODE_LABELS[mode] : 'Sin hándicap (gross)'}
          </div>

          {grouped ? (
            <div className="space-y-1.5">
              <div className="rounded-md border border-border overflow-hidden grid grid-cols-2 divide-x divide-border">
                <TeamColumn label={teamALabel} teamRows={rowsA} align="left" />
                <TeamColumn label={teamBLabel} teamRows={rowsB} align="right" />
              </div>
              <div className="text-[10px] text-center text-muted-foreground">
                Cada línea: <span className="text-foreground">jugador · HCP campo · golpes</span>
              </div>
              {useHandicap && (
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[10px] tabular-nums flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {fmtHcp(sumA)} <span className="text-foreground/70">({teamALabel})</span> vs{' '}
                    {fmtHcp(sumB)} <span className="text-foreground/70">({teamBLabel})</span>
                  </span>
                  <span className="font-semibold">
                    {higherTeam
                      ? `Δ ${fmtHcp(diffTeams)} → ${higherTeam === 'A' ? teamALabel : teamBLabel}`
                      : 'Δ 0 (parejo)'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-2 py-1 bg-muted/60 text-[9px] uppercase tracking-wide text-muted-foreground">
                <span>Jugador</span>
                <span className="text-center">Tee</span>
                <span className="text-right">HCP campo</span>
                <span className="text-right">Golpes</span>
              </div>
              {rows.map(({ player, courseHcp, strokes }) => (
                <div
                  key={player.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-2 py-1 text-[11px] tabular-nums border-t border-border/50"
                >
                  <span className="truncate">{getName(player)}</span>
                  <span className="text-center text-muted-foreground">
                    {player.teeColor ? (TEE_LABELS[player.teeColor] ?? player.teeColor) : '—'}
                  </span>
                  <span className="text-right">{fmtHcp(courseHcp)}</span>
                  <span className={cn('text-right font-semibold', strokes > 0 ? 'text-primary' : 'text-muted-foreground')}>
                    {strokes > 0 ? `+${fmtHcp(strokes)}` : '0'}
                  </span>
                </div>
              ))}
            </div>
          )}


          <p className="text-[10px] text-muted-foreground leading-snug">{calcText}</p>
          {note && <p className="text-[10px] text-muted-foreground leading-snug">{note}</p>}
          <p className="text-[9px] text-muted-foreground/80 leading-snug">
            El HCP de campo ya incluye rating y slope del tee de cada jugador. Los golpes mostrados son los que usa el
            motor de cálculo para esta apuesta.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TeamBetHandicapInfo;
