import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Calculator, Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import { useUSGAHandicap } from '@/hooks/useUSGAHandicap';
import { getNumDifferentialsToUse } from '@/lib/usgaHandicap';
import { formatPlayerName } from '@/lib/playerInput';

interface HandicapCalculatorProps {
  onClose?: () => void;
}

export const HandicapCalculator: React.FC<HandicapCalculatorProps> = ({ onClose }) => {
  const { profile } = useAuth();
  const {
    handicapIndex,
    differentials,
    roundsUsed,
    totalRounds,
    isLoading,
  } = useUSGAHandicap(profile?.id ?? null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (totalRounds < 3) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Calculator className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Se necesitan al menos 3 rondas</p>
        <p className="text-sm">Tienes {totalRounds} ronda{totalRounds !== 1 ? 's' : ''} completada{totalRounds !== 1 ? 's' : ''}</p>
      </div>
    );
  }

  // Determine which differentials are "used" (best N)
  const sortedByDiff = [...differentials].sort((a, b) => a.differential - b.differential);
  const numToUse = getNumDifferentialsToUse(differentials.length);
  const usedRoundIds = new Set(sortedByDiff.slice(0, numToUse).map(d => d.roundId));

  // Best (lowest differential) and worst (highest) rounds among the counting set
  const usedRounds = differentials.filter(d => usedRoundIds.has(d.roundId));
  const bestUsed = usedRounds.length > 0
    ? usedRounds.reduce((p, c) => (c.differential < p.differential ? c : p))
    : null;
  const worstUsed = usedRounds.length > 0
    ? usedRounds.reduce((p, c) => (c.differential > p.differential ? c : p))
    : null;
  const sameRound = bestUsed && worstUsed && bestUsed.roundId === worstUsed.roundId;

  const formatDiff = (d: number) => `${d > 0 ? '+' : ''}${d.toFixed(1)}`;
  const formatShortDate = (date: string) =>
    parseLocalDate(date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {profile?.display_name && (
            <p className="text-sm text-muted-foreground">{formatPlayerName(profile.display_name)}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3 w-3" />
          Reglas USGA
        </div>
      </div>

      {/* Calculated Handicap Display */}
      <div className="bg-primary/10 rounded-xl p-4 text-center">
        <p className="text-sm text-muted-foreground mb-1">Handicap Index Calculado</p>
        <p className="text-4xl font-bold text-primary">
          {handicapIndex !== null ? handicapIndex : '--'}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Basado en {numToUse} mejores de {totalRounds} rondas
        </p>
      </div>

      {/* Best vs Worst counting differential */}
      {bestUsed && worstUsed && (
        <div className={cn(
          "bg-muted/50 rounded-lg p-3 grid gap-3",
          sameRound ? "grid-cols-1 text-center" : "grid-cols-2"
        )}>
          <div className={sameRound ? "" : ""}>
            <p className="text-xs text-muted-foreground">
              {sameRound ? "Único diferencial usado" : "Mejor contante"}
            </p>
            <p className={cn(
              "font-semibold text-lg",
              bestUsed.differential < 0 ? "text-green-600" : ""
            )}>
              {formatDiff(bestUsed.differential)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatShortDate(bestUsed.date)} · {bestUsed.totalStrokes} gross
            </p>
          </div>
          {!sameRound && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Peor contante</p>
              <p className={cn(
                "font-semibold text-lg",
                worstUsed.differential < 0 ? "text-green-600" : ""
              )}>
                {formatDiff(worstUsed.differential)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatShortDate(worstUsed.date)} · {worstUsed.totalStrokes} gross
              </p>
            </div>
          )}
        </div>
      )}

      {/* Rounds Table */}
      <div className="space-y-1">
        <div className="grid grid-cols-4 text-xs text-muted-foreground px-2 py-1">
          <span>Fecha</span>
          <span className="text-center">Gross</span>
          <span className="text-center">Dif.</span>
          <span className="text-right">Usado</span>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {differentials.map((round) => {
            const used = usedRoundIds.has(round.roundId);
            return (
              <div
                key={round.roundId}
                className={cn(
                  "grid grid-cols-4 text-sm px-2 py-1.5 rounded",
                  used ? "bg-primary/10 font-medium" : "bg-muted/30"
                )}
              >
                <span className="text-muted-foreground text-xs">
                  {parseLocalDate(round.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                </span>
                <span className="text-center">{round.totalStrokes}</span>
                <span className={cn(
                  "text-center",
                  round.differential < 0 ? "text-green-500" : ""
                )}>
                  {round.differential > 0 ? '+' : ''}{round.differential}
                </span>
                <span className="text-right">
                  {used ? '✓' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        * Ajuste Net Double Bogey aplicado. Ratings por tee del campo.
      </p>
    </div>
  );
};
