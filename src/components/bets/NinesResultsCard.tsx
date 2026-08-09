import React, { useMemo } from 'react';
import { Player, PlayerScore, GolfCourse, NinesConfig } from '@/types/golf';
import { buildNinesHoleDetails, calculateNinesPlayerSummaries, calculateNinesBets, distributeNinesPoints } from '@/lib/bets/nines';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { disambiguateInitials } from '@/lib/playerInput';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { AlertTriangle, Trophy, Star } from 'lucide-react';
import { TeamBetHandicapInfo } from './TeamBetHandicapInfo';


interface NinesResultsCardProps {
  players: Player[];
  ninesConfig: NinesConfig;
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  basePlayerId: string;
}

interface PlayerPointsSummary {
  playerId: string; playerName: string; playerInitials: string;
  playerColor: string; totalPoints: number; pointsFront: number; pointsBack: number;
  holesRested?: number;
}

interface HolePointData {
  holeNumber: number;
  playerPoints: { playerId: string; points: number; resting: boolean }[];
}

export const NinesResultsCard: React.FC<NinesResultsCardProps> = ({
  players, ninesConfig, scores, course, basePlayerId,
}) => {
  const activePlayers = useMemo(() =>
    players.filter(p => ninesConfig.playerIds.includes(p.id)),
    [players, ninesConfig.playerIds]
  );

  const missingIds = useMemo(() =>
    ninesConfig.playerIds.filter(id => !players.find(p => p.id === id)),
    [players, ninesConfig.playerIds]
  );

  const is4Player = activePlayers.length === 4;

  const { summaries, holeData } = useMemo(() => {
    if (missingIds.length > 0 || activePlayers.length < 3) {
      return { summaries: [] as PlayerPointsSummary[], holeData: [] as HolePointData[] };
    }
    if (activePlayers.length === 3) {
      const details = buildNinesHoleDetails(activePlayers, scores, ninesConfig, course);
      const rawSums = calculateNinesPlayerSummaries(activePlayers, details, ninesConfig);
      const hd: HolePointData[] = details.map(d => ({
        holeNumber: d.holeNumber,
        playerPoints: d.playerScores.map(ps => ({
          playerId: ps.playerId, points: ps.points, resting: false,
        })),
      }));
      // Calculate F/B splits
      const sums: PlayerPointsSummary[] = rawSums.map(s => {
        const front = hd.filter(h => h.holeNumber <= 9).reduce((sum, h) =>
          sum + (h.playerPoints.find(p => p.playerId === s.playerId)?.points ?? 0), 0);
        const back = hd.filter(h => h.holeNumber > 9).reduce((sum, h) =>
          sum + (h.playerPoints.find(p => p.playerId === s.playerId)?.points ?? 0), 0);
        return { ...s, pointsFront: front, pointsBack: back };
      }).sort((a, b) => b.totalPoints - a.totalPoints);
      return { summaries: sums, holeData: hd };
    }

    // 4-player rotation
    const pointsAccum = new Map<string, number>();
    const pointsFront = new Map<string, number>();
    const pointsBack = new Map<string, number>();
    const restCount = new Map<string, number>();
    activePlayers.forEach(p => {
      pointsAccum.set(p.id, 0); pointsFront.set(p.id, 0);
      pointsBack.set(p.id, 0); restCount.set(p.id, 0);
    });
    const hd: HolePointData[] = [];

    for (let h = 1; h <= 18; h++) {
      const restingPlayer = activePlayers[(h - 1) % 4];
      const activeThree = activePlayers.filter(p => p.id !== restingPlayer.id);
      const netScores = activeThree.map(p => {
        const hcp = ninesConfig.playerHandicaps?.[p.id] ?? p.handicap;
        const sp = calculateStrokesPerHole(hcp, course);
        const hs = (scores.get(p.id) ?? []).find(s => s.confirmed && s.holeNumber === h);
        if (!hs?.strokes) return null;
        return { id: p.id, net: hs.strokes - (sp[h - 1] ?? 0) };
      }).filter((x): x is { id: string; net: number } => x !== null);

      if (netScores.length !== 3) continue;
      const pointsMap = distributeNinesPoints(netScores);
      const holePoints: HolePointData['playerPoints'] = [];

      activePlayers.forEach(p => {
        const pts = p.id === restingPlayer.id ? 3 : (pointsMap.get(p.id) ?? 3);
        pointsAccum.set(p.id, (pointsAccum.get(p.id) ?? 0) + pts);
        if (h <= 9) pointsFront.set(p.id, (pointsFront.get(p.id) ?? 0) + pts);
        else pointsBack.set(p.id, (pointsBack.get(p.id) ?? 0) + pts);
        if (p.id === restingPlayer.id) restCount.set(p.id, (restCount.get(p.id) ?? 0) + 1);
        holePoints.push({ playerId: p.id, points: pts, resting: p.id === restingPlayer.id });
      });
      hd.push({ holeNumber: h, playerPoints: holePoints });
    }

    const sums: PlayerPointsSummary[] = activePlayers.map(p => ({
      playerId: p.id, playerName: p.name, playerInitials: p.initials, playerColor: p.color,
      totalPoints: pointsAccum.get(p.id) ?? 0,
      pointsFront: pointsFront.get(p.id) ?? 0,
      pointsBack: pointsBack.get(p.id) ?? 0,
      holesRested: restCount.get(p.id) ?? 0,
    })).sort((a, b) => b.totalPoints - a.totalPoints);

    return { summaries: sums, holeData: hd };
  }, [activePlayers, scores, ninesConfig, course, missingIds]);

  const bets = useMemo(() => {
    if (activePlayers.length === 3) {
      return calculateNinesBets(activePlayers, scores, ninesConfig, course);
    }
    const betSummaries: { playerId: string; vsPlayer: string; amount: number; description: string }[] = [];
    for (let i = 0; i < summaries.length; i++) {
      for (let j = i + 1; j < summaries.length; j++) {
        const A = summaries[i], B = summaries[j];
        const diff = A.totalPoints - B.totalPoints;
        if (diff === 0) continue;
        const amount = Math.abs(diff) * ninesConfig.valuePerPoint;
        const [wId, lId] = diff > 0 ? [A.playerId, B.playerId] : [B.playerId, A.playerId];
        betSummaries.push({ playerId: wId, vsPlayer: lId, amount, description: `${Math.max(A.totalPoints, B.totalPoints)} vs ${Math.min(A.totalPoints, B.totalPoints)} pts` });
      }
    }
    return betSummaries;
  }, [activePlayers, scores, ninesConfig, course, summaries]);

  // Per-player net balance
  const playerBalances = useMemo(() => {
    const balances = new Map<string, number>();
    activePlayers.forEach(p => balances.set(p.id, 0));
    if (activePlayers.length === 3) {
      const fullBets = calculateNinesBets(activePlayers, scores, ninesConfig, course);
      fullBets.forEach(b => balances.set(b.playerId, (balances.get(b.playerId) ?? 0) + b.amount));
    } else {
      bets.forEach(b => {
        balances.set(b.playerId, (balances.get(b.playerId) ?? 0) + b.amount);
        balances.set(b.vsPlayer, (balances.get(b.vsPlayer) ?? 0) - b.amount);
      });
    }
    return balances;
  }, [activePlayers, bets, scores, ninesConfig, course]);

  const totalBalance = playerBalances.get(basePlayerId) ?? 0;

  // Pre-compute Nines-specific strokes per hole for each player
  const ninesStrokesMap = useMemo(() => {
    const map = new Map<string, number[]>();
    activePlayers.forEach(p => {
      const hcp = ninesConfig.playerHandicaps?.[p.id] ?? p.handicap;
      map.set(p.id, calculateStrokesPerHole(hcp, course));
    });
    return map;
  }, [activePlayers, ninesConfig.playerHandicaps, course]);

  const disambiguated = useMemo(() => disambiguateInitials(activePlayers), [activePlayers]);
  const getPlayerAbbr = (p: Player) => disambiguated.get(p.id) || p.initials;

  const hasInsufficientPlayers = ninesConfig.playerIds.length < 3 || ninesConfig.playerIds.some(id => !id || id === '');

  if (missingIds.length > 0 || activePlayers.length < 3 || hasInsufficientPlayers) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Nines (5-3-1)</CardTitle>
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

  const isWinner = summaries.length > 0 && summaries[0].totalPoints > (summaries[1]?.totalPoints ?? 0);

  // Point color helper (Nines: 5=best, 1=worst)
  const pointColor = (pts: number, resting: boolean) => {
    if (resting) return 'bg-muted/50 text-muted-foreground';
    if (pts >= 5) return 'bg-amber-500/30 text-amber-700';
    if (pts >= 4) return 'bg-green-500/30 text-green-700';
    if (pts >= 3) return 'bg-blue-500/20 text-blue-600';
    if (pts >= 2) return 'bg-muted/50 text-foreground';
    return 'bg-red-500/20 text-destructive';
  };

  // Sorted ranking for earnings display
  const earningsRanking = [...summaries].sort((a, b) =>
    (playerBalances.get(b.playerId) ?? 0) - (playerBalances.get(a.playerId) ?? 0)
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1">
          Nines (5-3-1)
          <TeamBetHandicapInfo
            players={activePlayers}
            effectiveHandicaps={ninesConfig.playerHandicaps}
            title="Nines — Hándicaps"
            modalityLine={`Reparto 5-3-1 · $${fmtMoney(ninesConfig.valuePerPoint)}/pto`}
            note="Nines reparte 9 puntos por hoyo entre los 3 jugadores según su score neto; cada jugador juega con sus propios golpes (no hay modalidades de equipo)."
          />
        </CardTitle>

      </CardHeader>
      <CardContent className="space-y-3">
        {/* Grid de tarjetas estilo Stableford */}
        <Popover>
          <PopoverTrigger asChild>
            <div className={cn(
              'grid gap-1.5 cursor-pointer hover:bg-muted/20 rounded-lg p-2 transition-colors',
              is4Player ? 'grid-cols-4' : 'grid-cols-3'
            )}>
              {summaries.map((s, idx) => {
                const player = activePlayers.find(p => p.id === s.playerId);
                if (!player) return null;
                const isTop = idx === 0 && isWinner;
                return (
                  <div
                    key={s.playerId}
                    className={cn(
                      'rounded-lg px-2 py-1.5',
                      isTop ? 'bg-green-500/20 border border-green-500/30' : 'bg-muted/50'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="relative shrink-0">
                        <PlayerAvatar initials={getPlayerAbbr(player)} background={player.color} size="sm" isLoggedInUser={s.playerId === basePlayerId} />
                        {isTop && <Trophy className="h-3 w-3 text-amber-500 absolute -top-1 -right-1" />}
                      </div>
                      <span className={cn('text-lg font-bold leading-tight', isTop ? 'text-green-600' : '')}>
                        {s.totalPoints}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-3 mt-0.5">
                      <span className="text-xs font-bold text-muted-foreground">F{s.pointsFront}</span>
                      <span className="text-xs font-bold text-muted-foreground">B{s.pointsBack}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[340px] max-h-[70vh] overflow-y-auto" side="top">
            <div className="space-y-2">
              <div className="font-semibold text-sm flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                Nines (5-3-1) — Detalle por Hoyo
              </div>
              {/* Front 9 */}
              <div className={cn('grid gap-0.5 text-[8px] text-muted-foreground',
                `grid-cols-[50px_repeat(9,1fr)_35px]`
              )}>
                <div></div>
                {[1,2,3,4,5,6,7,8,9].map(h => <div key={h} className="text-center">{h}</div>)}
                <div className="text-center font-semibold">F9</div>
              </div>
              {summaries.map(s => {
                const player = activePlayers.find(p => p.id === s.playerId);
                if (!player) return null;
                return (
                  <div key={s.playerId} className="grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5 items-center">
                    <PlayerAvatar initials={getPlayerAbbr(player)} background={player.color} size="sm" isLoggedInUser={s.playerId === basePlayerId} />
                    {[1,2,3,4,5,6,7,8,9].map(h => {
                      const hd = holeData.find(d => d.holeNumber === h);
                      const pp = hd?.playerPoints.find(p => p.playerId === s.playerId);
                      const ninesStrokes = (ninesStrokesMap.get(s.playerId) ?? [])[h - 1] ?? 0;
                      return (
                        <div key={h} className={cn(
                          'text-center text-[10px] font-bold rounded py-0.5 relative',
                          pp ? pointColor(pp.points, pp.resting) : 'text-muted-foreground'
                        )}>
                          {pp ? pp.points : '-'}
                          {pp && !pp.resting && ninesStrokes > 0 && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-foreground" />}
                        </div>
                      );
                    })}
                    <div className="text-center text-[10px] font-bold bg-muted/50 rounded py-0.5">{s.pointsFront}</div>
                  </div>
                );
              })}
              {/* Back 9 */}
              <div className="grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5 text-[8px] text-muted-foreground mt-2">
                <div></div>
                {[10,11,12,13,14,15,16,17,18].map(h => <div key={h} className="text-center">{h}</div>)}
                <div className="text-center font-semibold">B9</div>
              </div>
              {summaries.map(s => {
                const player = activePlayers.find(p => p.id === s.playerId);
                if (!player) return null;
                return (
                  <div key={`${s.playerId}-back`} className="grid grid-cols-[50px_repeat(9,1fr)_35px] gap-0.5 items-center">
                    <PlayerAvatar initials={getPlayerAbbr(player)} background={player.color} size="sm" isLoggedInUser={s.playerId === basePlayerId} />
                    {[10,11,12,13,14,15,16,17,18].map(h => {
                      const hd = holeData.find(d => d.holeNumber === h);
                      const pp = hd?.playerPoints.find(p => p.playerId === s.playerId);
                      const ninesStrokes = (ninesStrokesMap.get(s.playerId) ?? [])[h - 1] ?? 0;
                      return (
                        <div key={h} className={cn(
                          'text-center text-[10px] font-bold rounded py-0.5 relative',
                          pp ? pointColor(pp.points, pp.resting) : 'text-muted-foreground'
                        )}>
                          {pp ? pp.points : '-'}
                          {pp && !pp.resting && ninesStrokes > 0 && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-foreground" />}
                        </div>
                      );
                    })}
                    <div className="text-center text-[10px] font-bold bg-muted/50 rounded py-0.5">{s.pointsBack}</div>
                  </div>
                );
              })}
              <div className="border-t-2 border-primary/40 pt-2 mt-2 text-center text-[10px] text-muted-foreground">
                Toca afuera para cerrar
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Ranking de ganancias estilo Vegas/Sixes */}
        {earningsRanking.length > 0 && (
          <div className="border-t pt-2 space-y-1">
            {earningsRanking.map(s => {
              const player = activePlayers.find(p => p.id === s.playerId);
              if (!player) return null;
              const bal = playerBalances.get(s.playerId) ?? 0;
              return (
                <div key={s.playerId} className="flex items-center gap-2 text-sm">
                  <PlayerAvatar initials={getPlayerAbbr(player)} background={player.color} size="sm" isLoggedInUser={s.playerId === basePlayerId} />
                  <span className="text-foreground text-xs font-medium">{player.name}</span>
                  <span className={cn(
                    'ml-auto font-bold font-sans text-sm',
                    bal > 0 && 'text-green-600',
                    bal < 0 && 'text-red-600',
                    bal === 0 && 'text-muted-foreground',
                  )}>
                    {bal > 0 ? '+' : ''}{bal !== 0 ? `$${fmtMoney(Math.abs(bal))}` : '$0'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
