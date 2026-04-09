import React, { useMemo, useState } from 'react';
import { Player, PlayerScore, GolfCourse, SixesConfig } from '@/types/golf';
import { disambiguateInitials, formatPlayerName } from '@/lib/playerInput';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { buildSixesSetResults, calculateSixesBets } from '@/lib/bets/sixes';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { AlertTriangle, XCircle, CheckCircle } from 'lucide-react';

interface SixesResultsCardProps {
  players: Player[];
  sixesConfig: SixesConfig;
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  basePlayerId: string;
  onConfigureSets?: () => void;
  isDisabled?: boolean;
  onToggleDisabled?: () => void;
}

export const SixesResultsCard: React.FC<SixesResultsCardProps> = ({
  players, sixesConfig, scores, course, basePlayerId, isDisabled, onToggleDisabled,
}) => {
  const [expandedSet, setExpandedSet] = useState<number | null>(null);

  const needsConfig = !sixesConfig.sets || sixesConfig.sets.length < 3;

  const hasEmptyPlayerIds = useMemo(() => {
    if (!sixesConfig.sets) return true;
    return sixesConfig.sets.some(s =>
      [...s.team1, ...s.team2].some(id => !id || id === '')
    );
  }, [sixesConfig.sets]);

  const missingPlayerIds = useMemo(() => {
    if (!sixesConfig.sets) return [];
    const referencedIds = new Set<string>();
    for (const s of sixesConfig.sets) {
      [...s.team1, ...s.team2].forEach(id => { if (id) referencedIds.add(id); });
    }
    return [...referencedIds].filter(id => !players.find(p => p.id === id));
  }, [players, sixesConfig.sets]);

  const setResults = useMemo(() => missingPlayerIds.length > 0 ? [] : buildSixesSetResults(players, scores, sixesConfig, course), [players, scores, sixesConfig, course, missingPlayerIds]);
  const bets = useMemo(() => missingPlayerIds.length > 0 ? [] : calculateSixesBets(players, scores, sixesConfig, course), [players, scores, sixesConfig, course, missingPlayerIds]);

  const getName = (id: string) => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';
  const getFullName = (id: string) => formatPlayerName(players.find(p => p.id === id)?.name ?? '?');
  const disambiguated = useMemo(() => disambiguateInitials(players), [players]);

  const getTeamSide = (setResult: typeof setResults[0]) => {
    if (setResult.team1.includes(basePlayerId)) return 'team1';
    if (setResult.team2.includes(basePlayerId)) return 'team2';
    return null;
  };

  const participantIds = useMemo(() => {
    if (!sixesConfig.sets) return new Set<string>();
    const ids = new Set<string>();
    sixesConfig.sets.forEach(s => {
      [...s.team1, ...s.team2].forEach(id => { if (id) ids.add(id); });
    });
    return ids;
  }, [sixesConfig.sets]);

  const playerRanking = useMemo(() => {
    const balances = new Map<string, number>();
    participantIds.forEach(id => balances.set(id, 0));
    bets.forEach(b => {
      if (participantIds.has(b.playerId)) {
        balances.set(b.playerId, (balances.get(b.playerId) || 0) + b.amount);
      }
    });
    return [...balances.entries()]
      .map(([id, bal]) => ({ id, name: getFullName(id), balance: bal }))
      .sort((a, b) => b.balance - a.balance);
  }, [bets, participantIds]);

  const getNetTone = (n: number) => (n > 0 ? 'text-green-600' : n < 0 ? 'text-destructive' : 'text-muted-foreground');

  if (missingPlayerIds.length > 0 || hasEmptyPlayerIds || needsConfig) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sixes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 space-y-1">
               <p className="font-medium">Agregar jugadores faltantes</p>
               <p>Revisa la configuración en la sección de Apuestas.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const SET_LABELS: Record<number, string> = { 1: '1–6', 2: '7–12', 3: '13–18' };

  return (
    <Card className={cn('border-accent/50', isDisabled && 'opacity-50')}>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Sixes</span>
          <div className="flex items-center gap-2">
            {isDisabled && (
              <div className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Cancelada</div>
            )}
            {onToggleDisabled && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-6 w-6', isDisabled ? 'text-green-600 hover:text-green-700' : 'text-muted-foreground hover:text-destructive')}
                onClick={onToggleDisabled}
                title={isDisabled ? 'Reactivar Sixes' : 'No considerar Sixes'}
              >
                {isDisabled ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Three-column set layout */}
        <div className="grid grid-cols-3 gap-2">
          {setResults.map(sr => {
            const side = getTeamSide(sr);
            const myTeam = side === 'team1' ? sr.team1 : sr.team2;
            const rivalTeam = side === 'team1' ? sr.team2 : sr.team1;
            const myPoints = sr.holeDetails.reduce((s, h) => s + (side === 'team1' ? h.pointsTeam1 : h.pointsTeam2), 0);
            const rivalPoints = sr.holeDetails.reduce((s, h) => s + (side === 'team1' ? h.pointsTeam2 : h.pointsTeam1), 0);
            const diff = myPoints - rivalPoints;
            const isExpanded = expandedSet === sr.setNumber;

            return (
              <button
                key={sr.setNumber}
                className={cn(
                  'rounded-lg border p-2 text-left transition-colors',
                  isExpanded ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/30',
                )}
                onClick={() => setExpandedSet(isExpanded ? null : sr.setNumber)}
              >
                <div className="text-[11px] text-muted-foreground font-medium text-center mb-1">
                  H{SET_LABELS[sr.setNumber]}
                </div>
                <div className="text-xs truncate text-center font-medium">
                  {getName(myTeam[0])}/{getName(myTeam[1])}
                </div>
                <div className="text-[10px] text-muted-foreground text-center">vs</div>
                <div className="text-xs truncate text-center font-medium">
                  {getName(rivalTeam[0])}/{getName(rivalTeam[1])}
                </div>
                <div className={cn('text-center font-extrabold text-base tabular-nums mt-1', getNetTone(diff))}>
                  {diff > 0 ? '+' : ''}{diff}
                </div>
              </button>
            );
          })}
        </div>

        {/* Expanded set detail */}
        {expandedSet !== null && (() => {
          const sr = setResults.find(s => s.setNumber === expandedSet);
          if (!sr) return null;
          const side = getTeamSide(sr);
          const myTeam = side === 'team1' ? sr.team1 : sr.team2;
          const rivalTeam = side === 'team1' ? sr.team2 : sr.team1;

          return (
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="text-[10px] text-muted-foreground text-center mb-1">
                Set H{SET_LABELS[sr.setNumber]} · Toca en un hoyo para ver detalle
              </div>
              <div className="grid grid-cols-6 gap-1">
                {sr.holeDetails.map(hd => {
                  const myPts = side === 'team1' ? hd.pointsTeam1 : hd.pointsTeam2;
                  const rvPts = side === 'team1' ? hd.pointsTeam2 : hd.pointsTeam1;
                  const diff = myPts - rvPts;

                  const pill = (
                    <div className={cn(
                      'flex flex-col items-center justify-center rounded-lg p-0.5 h-10 text-xs border cursor-pointer',
                      diff > 0 && 'bg-green-500/15 border-green-500/30 text-green-700',
                      diff < 0 && 'bg-red-500/15 border-red-500/30 text-red-700',
                      diff === 0 && hd.holeWinner && 'bg-muted border-border text-muted-foreground',
                      !hd.holeWinner && 'bg-muted/50 border-border/50 text-muted-foreground',
                    )}>
                      <span className="text-[10px] text-muted-foreground">{hd.holeNumber}</span>
                      <span className="text-xs font-bold tabular-nums">
                        {!hd.holeWinner ? '–' : diff > 0 ? `+${diff}` : `${diff}`}
                      </span>
                    </div>
                  );

                  if (!hd.holeWinner) return <div key={hd.holeNumber}>{pill}</div>;

                  const myScores = hd.scoresByPlayer.filter(s => myTeam.includes(s.playerId));
                  const rivalScores = hd.scoresByPlayer.filter(s => rivalTeam.includes(s.playerId));

                  return (
                    <Popover key={hd.holeNumber}>
                      <PopoverTrigger asChild>{pill}</PopoverTrigger>
                      <PopoverContent side="top" className="w-[95vw] max-w-sm p-3">
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Hoyo {hd.holeNumber} · {diff > 0 ? `+${diff}` : `${diff}`} pts</p>
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>Tu equipo</span>
                            <span>Rival</span>
                          </div>
                          {[0, 1].map(i => {
                            const my = myScores[i];
                            const rv = rivalScores[i];
                            if (!my || !rv) return null;
                            const myDisplay = my.gross > 0 ? my.net : '–';
                            const rvDisplay = rv.gross > 0 ? rv.net : '–';
                            const myHasStroke = my.strokes > 0 && my.net !== my.gross;
                            const rvHasStroke = rv.strokes > 0 && rv.net !== rv.gross;
                            return (
                              <div key={i} className="grid text-[15px] tabular-nums" style={{ gridTemplateColumns: '1fr auto auto 12px auto auto 1fr' }}>
                                <span className="truncate text-left">{my.playerName.split(' ')[0]}</span>
                                <span className="font-medium text-right px-1">{myDisplay}</span>
                                <span className="flex items-center justify-center w-3">{myHasStroke && <span className="h-2 w-2 rounded-full bg-foreground" />}</span>
                                <span />
                                <span className="flex items-center justify-center w-3">{rvHasStroke && <span className="h-2 w-2 rounded-full bg-foreground" />}</span>
                                <span className="font-medium text-left px-1">{rvDisplay}</span>
                                <span className="truncate text-right">{rv.playerName.split(' ')[0]}</span>
                              </div>
                            );
                          })}
                          <div className="pt-1 border-t border-border/50 text-xs flex justify-between">
                            {hd.lowBallWinner && <span>BB: {hd.lowBallWinner === side ? 'Tu equipo' : hd.lowBallWinner === 'tied' ? 'Empate' : 'Rival'}</span>}
                            {hd.highBallWinner && <span>BA: {hd.highBallWinner === side ? 'Tu equipo' : hd.highBallWinner === 'tied' ? 'Empate' : 'Rival'}</span>}
                            <span className="font-medium">Pts: {myPts}–{rvPts}</span>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Per-player ranking */}
        <div className="border-t border-border/50 pt-2 space-y-0.5">
          {playerRanking.map(pr => {
            const p = players.find(x => x.id === pr.id);
            return (
              <div key={pr.id} className="flex items-center gap-2 justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  {p && <PlayerAvatar initials={disambiguated.get(pr.id) || p.initials} background={p.color} size="xs" />}
                  <span className={cn('truncate', pr.id === basePlayerId && 'font-semibold')}>{pr.name}</span>
                </div>
                <span className={cn('font-bold tabular-nums shrink-0', getNetTone(pr.balance))}>
                  {pr.balance >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(pr.balance))}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
