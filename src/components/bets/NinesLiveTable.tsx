import React, { useMemo } from 'react';
import { Player, PlayerScore, GolfCourse, NinesConfig } from '@/types/golf';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { buildNinesHoleDetails, calculateNinesPlayerSummaries } from '@/lib/bets/nines';

interface NinesLiveTableProps {
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  ninesConfig: NinesConfig;
  course: GolfCourse;
  confirmedHoles: Set<number>;
}

export const NinesLiveTable: React.FC<NinesLiveTableProps> = ({
  players,
  scores,
  ninesConfig,
  course,
  confirmedHoles,
}) => {
  const summaries = useMemo(() => {
    // Filter scores to only confirmed holes
    const filteredScores = new Map<string, PlayerScore[]>();
    for (const [pid, pScores] of scores.entries()) {
      filteredScores.set(
        pid,
        pScores.map(s =>
          confirmedHoles.has(s.holeNumber) ? s : { ...s, confirmed: false }
        )
      );
    }

    const activePlayers = players.filter(p =>
      ninesConfig.playerIds.includes(p.id)
    );
    const details = buildNinesHoleDetails(activePlayers, filteredScores, ninesConfig, course);
    return calculateNinesPlayerSummaries(activePlayers, details, ninesConfig)
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }, [players, scores, ninesConfig, course, confirmedHoles]);

  if (confirmedHoles.size === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center mb-2">
        Sin hoyos completados aún
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-2 mb-3">
      <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Nines — Puntos</p>
      <div className="space-y-1">
        {summaries.map((s, i) => {
          const player = players.find(p => p.id === s.playerId);
          if (!player) return null;
          const isLeader = i === 0 && s.totalPoints > 0;
          return (
            <div
              key={s.playerId}
              className="flex items-center gap-2 text-sm"
            >
              <PlayerAvatar
                initials={s.playerInitials}
                background={s.playerColor}
                size="sm"
              />
              <span className={isLeader ? 'font-semibold text-primary' : 'text-foreground'}>
                {isLeader && '★ '}{player.name.split(' ')[0]}
              </span>
              <span className="ml-auto font-mono text-xs font-semibold">
                {s.totalPoints} pts
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
