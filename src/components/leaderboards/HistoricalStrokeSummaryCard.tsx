import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import type { HistoricalCompetition } from '@/hooks/useHistoricalCompetitions';
import type { ScoringMode } from '@/lib/leaderboardAggregation';

const MODE_LABEL: Record<ScoringMode, string> = {
  gross: 'Gross',
  net: 'Neto',
  stableford: 'Stableford',
};

const fmtVsPar = (v: number) => (v > 0 ? `+${v}` : v === 0 ? 'E' : `${v}`);

export const HistoricalStrokeSummaryCard: React.FC<{ competition: HistoricalCompetition }> = ({
  competition: lb,
}) => {
  const modes = lb.scoring_modes;
  const [activeMode, setActiveMode] = useState<ScoringMode>(
    modes.includes('net') ? 'net' : modes[0],
  );
  const standings = lb.standingsByMode[activeMode] ?? [];

  const valueFor = (s: (typeof standings)[number], mode: ScoringMode) =>
    mode === 'stableford' ? s.stablefordTotal
      : mode === 'gross' ? s.grossVsPar
        : s.netVsPar;

  const dayLabel = lb.dayNumber
    ? `Día ${lb.dayNumber}${lb.totalDays > 1 ? ` de ${lb.totalDays}` : ''}`
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{lb.name}</CardTitle>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {lb.competition_type === 'multi_day' && (
                <Badge variant="secondary" className="text-xs">Multidía</Badge>
              )}
              {dayLabel && (
                <Badge variant="outline" className="text-xs">{dayLabel}</Badge>
              )}
              <Badge
                variant={lb.status === 'completed' ? 'outline' : 'default'}
                className="text-xs"
              >
                {lb.status === 'completed' ? 'Finalizada' : 'Activa'}
              </Badge>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Resultado de esta ronda{dayLabel ? ` (${dayLabel.toLowerCase()})` : ''}
        </p>

        {/* Mi resultado por modalidad */}
        {lb.myStanding && (
          <div className="mt-2 pt-2 border-t border-border grid gap-1.5">
            {modes.map(mode => {
              const pos = lb.myPositionByMode[mode];
              const v = valueFor(lb.myStanding!, mode);
              return (
                <div key={mode} className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {MODE_LABEL[mode]}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className={cn(
                      'text-sm font-semibold tabular-nums',
                      mode === 'stableford' ? 'text-amber-600' : 'text-foreground',
                    )}>
                      {mode === 'stableford' ? `${v} pts` : `${fmtVsPar(v)} vs par`}
                    </span>
                    {pos !== null && (
                      <span className="text-xs text-muted-foreground">
                        #{pos} de {lb.totalParticipants}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {lb.myStanding.grossTotal > 0 && (
              <div className="text-xs text-muted-foreground">
                {lb.myStanding.grossTotal} golpes brutos · {lb.myStanding.holesPlayed} hoyos
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {modes.length > 1 && (
          <div className="flex gap-1 mb-2">
            {modes.map(mode => (
              <button
                key={mode}
                onClick={() => setActiveMode(mode)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  activeMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {MODE_LABEL[mode]}
              </button>
            ))}
          </div>
        )}

        <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          Top 5 · {MODE_LABEL[activeMode]}
        </div>
        <div className="space-y-1.5">
          {standings.slice(0, 5).map((s, idx) => (
            <div
              key={s.participantId}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md',
                s.isMe ? 'bg-primary/10' : 'bg-muted/40',
              )}
            >
              <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">
                {idx + 1}.
              </span>
              <PlayerAvatar initials={s.initials} background={s.avatar_color} size="sm" />
              <span className="text-sm flex-1 min-w-0 truncate">
                {s.display_name}
                {s.isMe && (
                  <span className="ml-1 text-xs text-primary font-medium">(tú)</span>
                )}
              </span>
              <span className={cn(
                'text-sm font-semibold tabular-nums shrink-0',
                activeMode === 'stableford' && 'text-amber-600',
              )}>
                {activeMode === 'stableford'
                  ? valueFor(s, activeMode)
                  : fmtVsPar(valueFor(s, activeMode))}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
