import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Trophy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import GreenBookLogo from '@/components/GreenBookLogo';

const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true;

const JoinLeaderboard = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [resolving, setResolving] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const standalone = isStandalone();

  const [teamSelectData, setTeamSelectData] = useState<{
    leaderboardId: string;
    teams: { id: string; name: string; color: string }[];
  } | null>(null);
  const [assigningTeam, setAssigningTeam] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      if (code) sessionStorage.setItem('pendingLeaderboardCode', code);
      navigate('/auth', { replace: true });
      return;
    }
    if (!code) {
      navigate('/leaderboards', { replace: true });
      return;
    }

    const resolve = async () => {
      try {
        // Look up the user's handicap from their most recent active round
        // (either as organizer or as a participant) so it carries into the leaderboard.
        let carriedHandicap = 0;
        try {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('id, current_handicap')
            .eq('user_id', user!.id)
            .maybeSingle();
          if (profileRow?.id) {
            const { data: rp } = await supabase
              .from('round_players')
              .select('handicap_for_round, joined_at, rounds!inner(status)')
              .eq('profile_id', profileRow.id)
              .eq('rounds.status', 'active')
              .order('joined_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (rp?.handicap_for_round != null) {
              carriedHandicap = Number(rp.handicap_for_round);
            } else if (profileRow.current_handicap != null) {
              carriedHandicap = Number(profileRow.current_handicap);
            }
          }
        } catch {
          // non-fatal — fall back to 0
        }

        const { data: leaderboardId } = await supabase
          .rpc('join_leaderboard_by_code', { p_code: code, p_handicap: carriedHandicap });
        if (leaderboardId) {
          // Check if this is a Teams Cup
          const { data: eventData } = await supabase
            .from('leaderboard_events')
            .select('competition_type')
            .eq('id', leaderboardId)
            .single();

          if (eventData?.competition_type === 'teams_cup') {
            // Load teams for this cup
            const { data: teamsData } = await supabase
              .from('cup_teams')
              .select('id, name, color')
              .eq('leaderboard_id', leaderboardId)
              .order('created_at');

            if (teamsData && teamsData.length > 0) {
              setTeamSelectData({ leaderboardId, teams: teamsData });
              setResolving(false);
              return; // Don't navigate yet — show team selection screen
            }
          }

          // Standard leaderboard OR teams cup with no teams yet
          const dest = eventData?.competition_type === 'teams_cup'
            ? `/leaderboards/cup/${leaderboardId}`
            : `/leaderboards/${leaderboardId}`;
          navigate(dest, { replace: true });
        } else {
          setNotFound(true);
          setResolving(false);
        }
      } catch {
        setNotFound(true);
        setResolving(false);
      }
    };

    resolve();
  }, [code, user, authLoading, navigate]);

  const handleTeamSelect = async (teamId: string | null) => {
    if (!teamSelectData) return;
    setAssigningTeam(true);
    try {
      if (teamId !== null) {
        await supabase.rpc('assign_cup_team' as any, {
          p_leaderboard_id: teamSelectData.leaderboardId,
          p_team_id: teamId,
        });
      }
      navigate(`/leaderboards/cup/${teamSelectData.leaderboardId}`, { replace: true });
    } catch {
      navigate(`/leaderboards/cup/${teamSelectData.leaderboardId}`, { replace: true });
    } finally {
      setAssigningTeam(false);
    }
  };

  // Team selection screen for Teams Cup
  if (teamSelectData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 p-6">
        <GreenBookLogo height={64} />
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold flex items-center justify-center gap-2">
            🏆 Teams Cup
          </h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            ¿A qué equipo perteneces?
          </p>
        </div>

        <div className="w-full max-w-sm space-y-3">
          {teamSelectData.teams.map((team) => (
            <Card
              key={team.id}
              className="cursor-pointer hover:shadow-md transition-shadow border-2"
              style={{ borderColor: team.color + '40' }}
              onClick={() => !assigningTeam && handleTeamSelect(team.id)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-5 h-5 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />
                  <span className="font-semibold">{team.name}</span>
                </div>
                {assigningTeam
                  ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  : <Badge variant="secondary">Seleccionar →</Badge>
                }
              </CardContent>
            </Card>
          ))}
        </div>

        <Button variant="ghost" size="sm" onClick={() => handleTeamSelect(null)}>
          Entrar sin elegir equipo
        </Button>
        <p className="text-xs text-center text-muted-foreground max-w-xs">
          El organizador también puede asignarte equipo desde el panel de la competencia.
        </p>
      </div>
    );
  }

  if (standalone || authLoading || resolving) {
    if (notFound) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
          <p className="text-muted-foreground">No se encontró un leaderboard con el código "{code}"</p>
          <Button onClick={() => navigate('/leaderboards')}>Ir a Leaderboards</Button>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // In Safari (not standalone) — show welcome screen with open-in-app button
  const appUrl = `${window.location.origin}/leaderboards/join/${code}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 p-6">
      <GreenBookLogo height={64} />
      <div className="text-center space-y-2">
        <h1 className="text-xl font-bold flex items-center justify-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Únete al Leaderboard
        </h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Te invitaron a un leaderboard en GreenBook.
          {notFound
            ? ' Sin embargo, el código ya no es válido o expiró.'
            : ' Abre la app para continuar.'}
        </p>
      </div>

      {!notFound && (
        <div className="space-y-3 w-full max-w-xs">
          <Button
            className="w-full gap-2"
            onClick={() => { window.location.href = appUrl; }}
          >
            <ExternalLink className="h-4 w-4" />
            Abrir en GreenBook App
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Si no tienes la app instalada, también puedes unirte desde aquí.
            El leaderboard aparecerá en tu cuenta.
          </p>
        </div>
      )}

      <Button variant="outline" onClick={() => navigate('/leaderboards')}>
        Ir a Leaderboards
      </Button>
    </div>
  );
};

export default JoinLeaderboard;
