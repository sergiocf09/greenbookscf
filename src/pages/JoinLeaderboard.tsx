import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Trophy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
        const { data: leaderboardId } = await supabase
          .rpc('join_leaderboard_by_code', { p_code: code, p_handicap: 0 });
        if (leaderboardId) {
          navigate(`/leaderboards/${leaderboardId}`, { replace: true });
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
