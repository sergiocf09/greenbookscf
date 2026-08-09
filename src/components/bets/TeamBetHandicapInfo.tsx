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

export interface TeamBetHandicapInfoProps {
  /** Players participating in this bet (order used for display). */
  players: Player[];
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
      <PopoverContent side="top" align="end" className="w-[320px] max-h-[70vh] overflow-y-auto p-3">
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
