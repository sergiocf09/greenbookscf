import React from 'react';
import { Player, SixesConfig } from '@/types/golf';
import { Badge } from '@/components/ui/badge';

interface SixesActiveBadgeProps {
  currentHole: number;
  sixesConfig: SixesConfig;
  players: Player[];
}

export const SixesActiveBadge: React.FC<SixesActiveBadgeProps> = ({
  currentHole,
  sixesConfig,
  players,
}) => {
  const setNum = currentHole <= 6 ? 1 : currentHole <= 12 ? 2 : 3;
  const assignment = sixesConfig.sets?.find(s => s.setNumber === setNum);
  if (!assignment) return null;

  const getName = (id: string) =>
    players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';

  const [t1a, t1b] = assignment.team1;
  const [t2a, t2b] = assignment.team2;

  return (
    <div className="flex justify-center mb-2">
      <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 text-xs px-3 py-1">
        Set {setNum} · {getName(t1a)}+{getName(t1b)} vs {getName(t2a)}+{getName(t2b)}
      </Badge>
    </div>
  );
};
