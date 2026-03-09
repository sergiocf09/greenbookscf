import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const JoinLeaderboard = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (!code) {
      navigate('/leaderboards', { replace: true });
      return;
    }

    const resolve = async () => {
      try {
        const { data: eventId } = await supabase
          .rpc('resolve_leaderboard_by_code', { p_code: code });
        if (eventId) {
          navigate(`/leaderboards/${eventId}`, { replace: true });
        } else {
          setResolving(false);
        }
      } catch {
        setResolving(false);
      }
    };
    resolve();
  }, [code, user, authLoading, navigate]);

  if (authLoading || resolving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <p className="text-muted-foreground">No se encontró un leaderboard con el código "{code}"</p>
      <Button onClick={() => navigate('/leaderboards')}>Ir a Leaderboards</Button>
    </div>
  );
};

export default JoinLeaderboard;
