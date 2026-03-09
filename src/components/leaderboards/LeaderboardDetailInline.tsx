import React, { useState, useMemo } from 'react';
import { useLeaderboardDetail, StandingsEntry } from '@/hooks/useLeaderboards';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ArrowLeft, Loader2, Trophy, Share2, Users, Copy, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type SortMode = 'gross' | 'net' | 'stableford';

interface LeaderboardDetailInlineProps {
  leaderboardId: string;
  onBack: () => void;
}

export const LeaderboardDetailInline: React.FC<LeaderboardDetailInlineProps> = ({
  leaderboardId,
  onBack,
}) => {
  const { profile } = useAuth();
  const {
    event,
    participants,
    standings,
    loading,
  } = useLeaderboardDetail(leaderboardId);

  const [sortMode, setSortMode] = useState<SortMode>('net');

  const sortedStandings = useMemo(() => {
    const filtered = standings.filter(s => s.holesPlayed > 0);
    const unplayed = standings.filter(s => s.holesPlayed === 0);

    filtered.sort((a, b) => {
      if (sortMode === 'gross') return a.grossVsPar - b.grossVsPar;
      if (sortMode === 'stableford') return b.stablefordTotal - a.stablefordTotal;
      return a.netVsPar - b.netVsPar;
    });

    return [...filtered, ...unplayed];
  }, [standings, sortMode]);

  const formatVsPar = (value: number): string => {
    if (value === 0) return 'E';
    return value > 0 ? `+${value}` : `${value}`;
  };

  const getVsParColor = (value: number): string => {
    if (value < 0) return 'text-green-600 font-semibold';
    if (value === 0) return 'text-foreground font-semibold';
    if (value <= 3) return 'text-orange-500 font-semibold';
    return 'text-destructive font-semibold';
  };

  const copyCode = () => {
    if (event?.code) {
      navigator.clipboard.writeText(event.code);
      toast.success('Código copiado');
    }
  };

  const copyShareLink = () => {
    if (event?.code) {
      const url = `${window.location.origin}/leaderboards/join/${event.code}`;
      navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Leaderboard no encontrado</p>
        <Button variant="outline" onClick={onBack} className="mt-4">Volver</Button>
      </div>
    );
  }

  const availableModes = event.scoring_modes || ['gross', 'net'];

  return (
    <div className="space-y-4">
      {/* Back + share bar */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Leaderboards
        </Button>
        <Button variant="ghost" size="icon" onClick={copyShareLink}>
          <Share2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Event info */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-lg">{event.name}</CardTitle>
          </div>
          {event.description && (
            <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <button
              onClick={copyCode}
              className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md hover:bg-muted/80 transition-colors"
            >
              <Hash className="h-3 w-3" />
              <span className="font-mono font-bold">{event.code}</span>
              <Copy className="h-3 w-3 ml-1" />
            </button>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {participants.length} jugadores
            </span>
          </div>
          <div className="flex gap-1 mt-2">
            {availableModes.map(m => (
              <span key={m} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                {m === 'gross' ? 'Gross' : m === 'net' ? 'Neto' : 'Stableford'}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Standings */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Standings</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2 pt-0">
          {availableModes.length > 1 && (
            <div className="px-4 mb-2">
              <Tabs value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <TabsList className="w-full h-8">
                  {availableModes.includes('gross') && (
                    <TabsTrigger value="gross" className="flex-1 text-xs h-7">Gross</TabsTrigger>
                  )}
                  {availableModes.includes('net') && (
                    <TabsTrigger value="net" className="flex-1 text-xs h-7">Neto</TabsTrigger>
                  )}
                  {availableModes.includes('stableford') && (
                    <TabsTrigger value="stableford" className="flex-1 text-xs h-7">Stableford</TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            </div>
          )}

          {sortedStandings.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No hay participantes registrados
            </p>
          ) : (
            <table className="table-fixed w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="text-xs border-b">
                  <th className="h-8 w-8 text-center px-1 py-1 font-medium text-muted-foreground">#</th>
                  <th className="h-8 px-1 py-1 text-left font-medium text-muted-foreground">Jugador</th>
                  <th className="h-8 text-center w-10 px-1 py-1 font-medium text-muted-foreground">Hcp</th>
                  <th className="h-8 text-center w-10 px-1 py-1 font-medium text-muted-foreground">Hoyos</th>
                  <th className="h-8 text-center w-14 px-1 py-1 font-medium text-muted-foreground">
                    {sortMode === 'stableford' ? 'Pts' : 'Score'}
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {sortedStandings.map((entry, idx) => {
                  const hasPlayed = entry.holesPlayed > 0;
                  const scoreValue = sortMode === 'gross'
                    ? entry.grossVsPar
                    : sortMode === 'stableford'
                      ? entry.stablefordTotal
                      : entry.netVsPar;

                  return (
                    <tr key={entry.participant.id} className="text-sm border-b hover:bg-muted/50 transition-colors">
                      <td className="text-center font-bold text-muted-foreground px-1 py-1.5 text-base">
                        {hasPlayed ? idx + 1 : '-'}
                      </td>
                      <td className="px-1 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <PlayerAvatar
                            initials={entry.participant.initials || '??'}
                            background={entry.participant.avatar_color || '#3B82F6'}
                            size="sm"
                            isLoggedInUser={entry.participant.profile_id === profile?.id}
                          />
                          <span className="font-semibold text-sm truncate">
                            {entry.participant.display_name}
                          </span>
                        </div>
                      </td>
                      <td className="text-center text-xs text-foreground font-bold px-1 py-1.5">
                        {entry.participant.handicap_for_leaderboard}
                      </td>
                      <td className="text-center text-xs text-foreground font-bold px-1 py-1.5">
                        {hasPlayed ? entry.holesPlayed : '-'}
                      </td>
                      <td className={cn(
                        'text-center text-base px-1 py-1.5',
                        hasPlayed
                          ? sortMode === 'stableford'
                            ? 'font-extrabold text-amber-600'
                            : getVsParColor(scoreValue)
                          : 'text-muted-foreground'
                      )}>
                        {hasPlayed
                          ? sortMode === 'stableford'
                            ? scoreValue
                            : formatVsPar(scoreValue)
                          : '-'
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
