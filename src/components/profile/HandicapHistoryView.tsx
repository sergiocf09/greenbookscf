import React from 'react';
import { useHandicapHistory, HandicapHistoryEntry } from '@/hooks/useHandicapHistory';
import { Loader2, AlertCircle, CheckCircle2, Flag, Calendar, Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { useHandicapTrendSeries } from '@/hooks/useHandicapTrendSeries';
import { HandicapSparkline } from '@/components/handicap/HandicapSparkline';
import {
  computeHandicapTrend,
  formatHandicapTrendDelta,
  handicapTrendColorClass,
  handicapTrendLabel,
  HANDICAP_TREND_WINDOW_DAYS,
} from '@/lib/handicapTrend';


const RechartsLine = Line as unknown as React.ComponentType<any>;
const RechartsXAxis = XAxis as unknown as React.ComponentType<any>;
const RechartsYAxis = YAxis as unknown as React.ComponentType<any>;
const RechartsTooltip = Tooltip as unknown as React.ComponentType<any>;
const RechartsReferenceLine = ReferenceLine as unknown as React.ComponentType<any>;

interface HandicapHistoryViewProps {
  profileId: string | null;
  playerName?: string;
}

const TEE_COLORS: Record<string, string> = {
  blue: 'bg-blue-600',
  white: 'bg-white border border-gray-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-600',
};

export const HandicapHistoryView: React.FC<HandicapHistoryViewProps> = ({ profileId, playerName }) => {
  const {
    handicapIndex,
    entries,
    roundsUsed,
    totalRounds,
    minimumRoundsNeeded,
    isLoading,
    error,
    attestationStats,
  } = useHandicapHistory(profileId);

  const { series } = useHandicapTrendSeries(profileId ? [profileId] : [], HANDICAP_TREND_WINDOW_DAYS);
  const trendInfo = computeHandicapTrend(profileId ? series[profileId] : undefined, handicapIndex);



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

  // Sort by value to find which ones are used
  const sortedByValue = [...entries].sort((a, b) => a.differential - b.differential);
  const usedRoundIds = new Set(
    sortedByValue.slice(0, roundsUsed).map(d => d.roundId)
  );

  // Chart data (oldest first)
  const chartData = [...entries]
    .reverse()
    .map((r) => ({
      date: format(parseLocalDate(r.date), 'dd/MM', { locale: es }),
      differential: r.differential,
      used: usedRoundIds.has(r.roundId),
    }));

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
        <div className="flex-1">
          {playerName && (
            <p className="text-sm font-medium text-foreground mb-0.5">{playerName}</p>
          )}
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Índice USGA</p>
          <p className="text-3xl font-bold text-foreground">
            {handicapIndex !== null ? handicapIndex.toFixed(1) : '-'}
          </p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Tendencia {HANDICAP_TREND_WINDOW_DAYS}d
          </p>
          <div className="flex items-center gap-1.5 justify-end">
            <HandicapSparkline
              trend={trendInfo.trend}
              currentHandicap={handicapIndex ?? 0}
              referenceHandicap={trendInfo.referenceHandicap}
              points={profileId ? series[profileId] : undefined}
              variant="series"
              width={48}
              height={16}
            />
            <span className={cn('text-xs font-medium', handicapTrendColorClass(trendInfo.status))}>
              {handicapTrendLabel(trendInfo.status)}
            </span>
          </div>
          <p className={cn('text-xs font-semibold tabular-nums', handicapTrendColorClass(trendInfo.status))}>
            Δ {formatHandicapTrendDelta(trendInfo.trend)}
          </p>
          <p className="text-xs text-muted-foreground">
            {roundsUsed}/{totalRounds} diferenciales
          </p>
        </div>
      </div>


      {/* Attestation percentage line (over last 20 entries shown) */}
      {(() => {
        const last20 = entries.slice(0, 20);
        const attestedCount = last20.filter(e => e.isAttested).length;
        const total = last20.length;
        const pct = total > 0 ? Math.round((attestedCount / total) * 100) : 0;
        if (total === 0) return null;
        const colorClass = pct === 100
          ? 'text-emerald-500'
          : pct >= 50
            ? 'text-yellow-500'
            : 'text-muted-foreground';
        return (
          <div className="text-xs text-muted-foreground px-1">
            Atestadas (últ. {total}): <span className={cn('font-medium', colorClass)}>{attestedCount} de {total} ({pct}%)</span>
          </div>
        );
      })()}

      {/* Trend chart */}
      {chartData.length >= 3 && (
        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Tendencia de Diferenciales</p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <RechartsXAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <RechartsYAxis
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                domain={['dataMin - 2', 'dataMax + 2']}
              />
              {handicapIndex !== null && (
                <RechartsReferenceLine
                  y={handicapIndex}
                  stroke="hsl(var(--primary))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
              )}
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                formatter={(value: number) => [value.toFixed(1), 'Diferencial']}
              />
              <RechartsLine
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
        {attestationStats && attestationStats.totalRounds > 0 && (() => {
          const pct = Math.round((attestationStats.attestedRounds / attestationStats.totalRounds) * 100);
          const colorClass = pct === 100
            ? 'text-emerald-500'
            : pct >= 50
              ? 'text-yellow-500'
              : 'text-muted-foreground';
          return (
            <p className="text-[11px] text-muted-foreground px-1 -mt-1 flex items-center gap-1">
              <Check className="h-3 w-3" />
              Atestadas: <span className={cn('font-medium', colorClass)}>
                {attestationStats.attestedRounds} de {attestationStats.totalRounds} ({pct}%)
              </span>
            </p>
          );
        })()}
        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
          {entries.map((entry) => (
            <RoundRow
              key={entry.roundId}
              entry={entry}
              isUsed={usedRoundIds.has(entry.roundId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const RoundRow: React.FC<{ entry: HandicapHistoryEntry; isUsed: boolean }> = ({ entry, isUsed }) => {
  const teeColorClass = TEE_COLORS[entry.teeColor] || TEE_COLORS.white;

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
          <span className="font-medium truncate">{entry.courseName}</span>
          <span
            className={cn('w-2 h-2 rounded-full shrink-0', teeColorClass)}
            title={`Tee ${entry.teeColor}`}
          />
          {entry.isAttested ? (
            <Check className="h-3 w-3 text-emerald-500 shrink-0" aria-label="Atestada" />
          ) : (
            <Clock className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Pendiente" />
          )}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground mt-0.5">
          <Calendar className="h-3 w-3 shrink-0" />
          <span>{format(parseLocalDate(entry.date), 'dd MMM yy', { locale: es })}</span>
          <span className="text-[9px] opacity-70">
            R:{entry.courseRating} S:{entry.slopeRating}
          </span>
        </div>
      </div>

      <div className="text-right shrink-0 leading-tight">
        <p className="font-bold tabular-nums">{entry.totalStrokes}</p>
        {entry.adjustedGrossScore !== entry.totalStrokes && (
          <p className="text-[9px] text-muted-foreground">NDB:{entry.adjustedGrossScore}</p>
        )}
        <p className={cn(
          'font-medium tabular-nums',
          isUsed ? 'text-primary' : 'text-muted-foreground'
        )}>
          {entry.differential > 0 ? '+' : ''}{entry.differential.toFixed(1)}
        </p>
      </div>
    </div>
  );
};
