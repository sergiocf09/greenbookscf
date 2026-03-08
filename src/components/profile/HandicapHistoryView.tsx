import React from 'react';
import { useUSGAHandicap, RoundDifferential } from '@/hooks/useUSGAHandicap';
import { Loader2, AlertCircle, CheckCircle2, Flag, Calendar, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';

interface HandicapHistoryViewProps {
  profileId: string | null;
}

const TEE_COLORS: Record<string, string> = {
  blue: 'bg-blue-600',
  white: 'bg-white border border-gray-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-600',
};

export const HandicapHistoryView: React.FC<HandicapHistoryViewProps> = ({ profileId }) => {
  const {
    handicapIndex,
    differentials,
    roundsUsed,
    totalRounds,
    minimumRoundsNeeded,
    isLoading,
    error,
  } = useUSGAHandicap(profileId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-destructive">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">Error al cargar historial</p>
      </div>
    );
  }

  if (totalRounds < minimumRoundsNeeded) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="font-medium text-foreground">
            Se necesitan mínimo {minimumRoundsNeeded} rondas
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Tienes {totalRounds} ronda{totalRounds !== 1 ? 's' : ''} registrada{totalRounds !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    );
  }

  // Sort differentials by value to find which ones are used
  const sortedByValue = [...differentials].sort((a, b) => a.differential - b.differential);
  const usedDifferentialIds = new Set(
    sortedByValue.slice(0, roundsUsed).map(d => d.roundId)
  );

  // Chart data: differentials chronologically (oldest first)
  const chartData = [...differentials]
    .reverse()
    .map((r) => ({
      date: format(parseLocalDate(r.date), 'dd/MM', { locale: es }),
      differential: r.differential,
      used: usedDifferentialIds.has(r.roundId),
    }));

  // Trend indicator
  const recentDiffs = differentials.slice(0, Math.min(3, differentials.length));
  const olderDiffs = differentials.slice(Math.min(3, differentials.length), Math.min(6, differentials.length));
  const recentAvg = recentDiffs.length ? recentDiffs.reduce((s, d) => s + d.differential, 0) / recentDiffs.length : 0;
  const olderAvg = olderDiffs.length ? olderDiffs.reduce((s, d) => s + d.differential, 0) / olderDiffs.length : 0;
  const trendDown = olderDiffs.length > 0 && recentAvg < olderAvg;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Índice USGA</p>
          <p className="text-3xl font-bold text-foreground">
            {handicapIndex !== null ? handicapIndex.toFixed(1) : '-'}
          </p>
        </div>
        <div className="text-right space-y-1">
          <div className="flex items-center gap-1 justify-end">
            {trendDown ? (
              <TrendingDown className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingUp className="h-4 w-4 text-orange-500" />
            )}
            <span className={cn('text-xs font-medium', trendDown ? 'text-emerald-500' : 'text-orange-500')}>
              {trendDown ? 'Mejorando' : 'Subiendo'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {roundsUsed}/{totalRounds} diferenciales
          </p>
        </div>
      </div>

      {/* Trend chart */}
      {chartData.length >= 3 && (
        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Tendencia de Diferenciales</p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                domain={['dataMin - 2', 'dataMax + 2']}
              />
              {handicapIndex !== null && (
                <ReferenceLine
                  y={handicapIndex}
                  stroke="hsl(var(--primary))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                formatter={(value: number) => [value.toFixed(1), 'Diferencial']}
              />
              <Line
                type="monotone"
                dataKey="differential"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  return (
                    <circle
                      key={`dot-${payload.date}`}
                      cx={cx}
                      cy={cy}
                      r={payload.used ? 4 : 2.5}
                      fill={payload.used ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                      stroke={payload.used ? 'hsl(var(--background))' : 'none'}
                      strokeWidth={payload.used ? 2 : 0}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-muted-foreground text-center mt-1">
            ● usados para el índice — línea punteada = índice actual
          </p>
        </div>
      )}

      {/* Rounds list */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Historial de Rondas ({totalRounds})
        </p>
        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
          {differentials.map((round) => (
            <RoundRow
              key={round.roundId}
              round={round}
              isUsed={usedDifferentialIds.has(round.roundId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const RoundRow: React.FC<{ round: RoundDifferential; isUsed: boolean }> = ({ round, isUsed }) => {
  const teeColorClass = TEE_COLORS[round.teeColor] || TEE_COLORS.white;

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg text-xs transition-colors',
        isUsed ? 'bg-primary/10 border border-primary/20' : 'bg-muted/20'
      )}
    >
      {isUsed && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Flag className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{round.courseName}</span>
          <span
            className={cn('w-2 h-2 rounded-full shrink-0', teeColorClass)}
            title={`Tee ${round.teeColor}`}
          />
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground mt-0.5">
          <Calendar className="h-3 w-3 shrink-0" />
          <span>{format(parseLocalDate(round.date), 'dd MMM yy', { locale: es })}</span>
          <span className="text-[9px] opacity-70">
            R:{round.courseRating} S:{round.slopeRating}
          </span>
        </div>
      </div>

      <div className="text-right shrink-0 leading-tight">
        <p className="font-bold tabular-nums">{round.totalStrokes}</p>
        {round.adjustedGrossScore !== round.totalStrokes && (
          <p className="text-[9px] text-muted-foreground">NDB:{round.adjustedGrossScore}</p>
        )}
        <p className={cn(
          'font-medium tabular-nums',
          isUsed ? 'text-primary' : 'text-muted-foreground'
        )}>
          {round.differential > 0 ? '+' : ''}{round.differential.toFixed(1)}
        </p>
      </div>
    </div>
  );
};
