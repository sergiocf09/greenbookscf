import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamsCup } from '@/hooks/useTeamsCup';
import { cupSlotKey } from '@/types/leaderboard';

function formatRunning(delta: number): string {
  if (delta === 0) return 'AS';
  if (delta > 0) return `${delta}UP`;
  return `${Math.abs(delta)}DN`;
}

interface Props {
  leaderboardId: string;
  name: string;
  status: string;
  roundId: string;
  currentUserProfileId: string | null;
}

export const HistoricalCupSummaryCard: React.FC<Props> = ({
  leaderboardId, name, status, roundId, currentUserProfileId,
}) => {
  const cup = useTeamsCup(leaderboardId);

  const slotMatches = useMemo(
    () => cup.matches.filter(m => m.round_id === roundId),
    [cup.matches, roundId],
  );

  const slot = slotMatches[0]
    ? { day: slotMatches[0].day_number ?? 1, session: slotMatches[0].session_number ?? 1 }
    : null;

  const slotStandings = slot
    ? cup.standingsBySlot.get(cupSlotKey(slot.day, slot.session)) ?? null
    : null;

  const myParticipant = useMemo(
    () => cup.participants.find(p => p.profile_id && p.profile_id === currentUserProfileId) ?? null,
    [cup.participants, currentUserProfileId],
  );

  const myMatch = useMemo(() => {
    if (!myParticipant) return null;
    return slotMatches.find(m =>
      [m.player_a1_id, m.player_a2_id, m.player_b1_id, m.player_b2_id]
        .includes(myParticipant.id)) ?? null;
  }, [slotMatches, myParticipant]);

  if (cup.loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const teamA = cup.teams[0] ?? null;
  const teamB = cup.teams[1] ?? null;
  const multiDay = cup.days.length > 1
    || cup.days.some(d => d.sessions.length > 1);

  const dayCfg = slot ? cup.days.find(d => d.day_number === slot.day) : undefined;
  const sessCfg = dayCfg && slot
    ? dayCfg.sessions.find(s => s.session_number === slot.session)
    : undefined;
  const slotLabel = slot
    ? [
        dayCfg?.label?.trim() || `Día ${slot.day}`,
        dayCfg && dayCfg.sessions.length > 1
          ? (sessCfg?.label?.trim() || `S${slot.session}`)
          : null,
      ].filter(Boolean).join(' · ')
    : null;

  // ── Mi partido: lado, rival(es), pareja y resultado ──
  let mySide: 'a' | 'b' | null = null;
  if (myMatch && myParticipant) {
    mySide = (myMatch.player_a1_id === myParticipant.id || myMatch.player_a2_id === myParticipant.id)
      ? 'a'
      : (myMatch.player_b1_id === myParticipant.id || myMatch.player_b2_id === myParticipant.id)
        ? 'b' : null;
  }
  const nameOf = (id: string | null) =>
    id ? (cup.participants.find(p => p.id === id)?.display_name ?? null) : null;

  const partnerName = myMatch && myParticipant && mySide
    ? nameOf(mySide === 'a'
        ? (myMatch.player_a1_id === myParticipant.id ? myMatch.player_a2_id : myMatch.player_a1_id)
        : (myMatch.player_b1_id === myParticipant.id ? myMatch.player_b2_id : myMatch.player_b1_id))
    : null;

  const rivalNames = myMatch && mySide
    ? (mySide === 'a'
        ? [myMatch.player_b1_id, myMatch.player_b2_id]
        : [myMatch.player_a1_id, myMatch.player_a2_id])
      .map(nameOf).filter(Boolean) as string[]
    : [];

  const res = myMatch ? cup.matchResults.get(myMatch.id) : undefined;
  const diff = res ? res.side_a_holes_won - res.side_b_holes_won : 0;
  const closed = (res?.match_closed ?? false) || (res ? res.holes_played > 0 : false);
  const rawType = closed
    ? res!.result_type
    : (myMatch?.result_override ? myMatch.result_type : (res ? res.result_type : 'pending'));
  const rtype = closed && rawType === 'in_progress'
    ? (diff > 0 ? 'a_wins' : diff < 0 ? 'b_wins' : 'halved')
    : rawType;

  let resultText = '—';
  let resultNote: string | null = 'Pendiente';
  if (rtype === 'halved') {
    resultText = 'AS';
    resultNote = 'All Square';
  } else if (rtype === 'a_wins' || rtype === 'b_wins') {
    resultText = res?.current_standing
      ? res.current_standing.replace(/^[AB]\s+/, '')
      : (myMatch?.result_detail || formatRunning(diff));
    resultNote = 'Final';
  } else if (res && res.holes_played > 0) {
    resultText = formatRunning(mySide === 'b' ? -diff : diff);
    resultNote = `thru ${res.holes_played}`;
  }

  const outcome = rtype === 'halved'
    ? { label: 'Punto repartido (½)', cls: 'bg-muted text-foreground' }
    : (rtype === 'a_wins' || rtype === 'b_wins') && mySide
      ? (rtype === `${mySide}_wins`
          ? { label: 'Punto ganado', cls: 'bg-primary/15 text-primary' }
          : { label: 'Punto perdido', cls: 'bg-destructive/10 text-destructive' })
      : null;

  const acc = cup.standings;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{name}</CardTitle>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge variant="secondary" className="text-xs">Teams Cup</Badge>
              {slotLabel && (
                <Badge variant="outline" className="text-xs">{slotLabel}</Badge>
              )}
              <Badge
                variant={status === 'completed' ? 'outline' : 'default'}
                className="text-xs"
              >
                {status === 'completed' ? 'Finalizada' : 'Activa'}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Marcador de la jornada */}
        {teamA && teamB && slotStandings && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Marcador {slotLabel ? `· ${slotLabel}` : 'de la jornada'}
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: teamA.color }} />
                <span className="text-sm truncate">{teamA.name}</span>
              </div>
              <div className="text-lg font-extrabold tabular-nums shrink-0">
                {slotStandings.points_a} – {slotStandings.points_b}
              </div>
              <div className="flex items-center gap-2 min-w-0 justify-end">
                <span className="text-sm truncate">{teamB.name}</span>
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: teamB.color }} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {slotStandings.points_available} puntos en juego · {slotMatches.length} partidos
            </div>
          </div>
        )}

        {/* Mi partido */}
        {myMatch && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Tu partido
            </div>
            <div className="rounded-lg border border-border px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="truncate">
                    {myParticipant?.display_name}
                    {partnerName && <span className="text-muted-foreground"> + {partnerName}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    vs {rivalNames.length > 0 ? rivalNames.join(' + ') : 'Por definir'}
                  </div>
                </div>
                <div className="text-right shrink-0 leading-none">
                  <div className="text-2xl font-extrabold">{resultText}</div>
                  {resultNote && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">{resultNote}</div>
                  )}
                </div>
              </div>
              {outcome && (
                <div className={cn(
                  'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                  outcome.cls,
                )}>
                  {outcome.label}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Acumulado de la copa */}
        {multiDay && teamA && teamB && acc && (
          <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              Acumulado de la copa
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {acc.points_a} – {acc.points_b}
            </span>
          </div>
        )}

        {slotMatches.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Esta ronda no tiene partidos asignados en la copa.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
