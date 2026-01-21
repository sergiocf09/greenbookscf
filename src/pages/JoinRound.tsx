import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, MapPin, Calendar, Users, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface RoundInfo {
  id: string;
  date: string;
  tee_color: string;
  status: string;
  course: {
    name: string;
    location: string;
  };
  organizer: {
    display_name: string;
  };
  players: {
    profile: {
      display_name: string;
      initials: string;
      avatar_color: string;
    };
  }[];
}

const JoinRound = () => {
  const { roundId } = useParams<{ roundId: string }>();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  
  const [roundInfo, setRoundInfo] = useState<RoundInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) {
      setError('ID de ronda inválido');
      setLoading(false);
      return;
    }

    const fetchRoundInfo = async () => {
      try {
        // Get round info with course and organizer
        const { data: round, error: roundError } = await supabase
          .from('rounds')
          .select(`
            id,
            date,
            tee_color,
            status,
            course_id
          `)
          .eq('id', roundId)
          .single();

        if (roundError) throw roundError;

        // Get course info
        const { data: course } = await supabase
          .from('golf_courses')
          .select('name, location')
          .eq('id', round.course_id)
          .single();

        // Get organizer info
        const { data: organizer } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', (await supabase
            .from('rounds')
            .select('organizer_id')
            .eq('id', roundId)
            .single()).data?.organizer_id)
          .single();

        // Get players
        const { data: players } = await supabase
          .from('round_players')
          .select(`
            profile_id
          `)
          .eq('round_id', roundId);

        // Get profiles for players
        const playerProfiles = [];
        if (players) {
          for (const p of players) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('display_name, initials, avatar_color')
              .eq('id', p.profile_id)
              .single();
            if (prof) playerProfiles.push({ profile: prof });
          }
        }

        // Check if user already joined
        if (profile) {
          const isJoined = players?.some(p => p.profile_id === profile.id);
          setAlreadyJoined(!!isJoined);
        }

        setRoundInfo({
          ...round,
          course: course || { name: 'Desconocido', location: '' },
          organizer: organizer || { display_name: 'Organizador' },
          players: playerProfiles,
        });
      } catch (err) {
        console.error('Error fetching round:', err);
        setError('No se encontró la ronda');
      } finally {
        setLoading(false);
      }
    };

    fetchRoundInfo();
  }, [roundId, profile]);

  const handleJoin = async () => {
    if (!user || !profile || !roundId) {
      navigate('/auth', { state: { returnTo: `/join/${roundId}` } });
      return;
    }

    setJoining(true);
    try {
      // Get the group for this round
      const { data: group } = await supabase
        .from('round_groups')
        .select('id')
        .eq('round_id', roundId)
        .single();

      if (!group) throw new Error('No se encontró el grupo');

      // Add player to round
      const { error: joinError } = await supabase
        .from('round_players')
        .insert({
          round_id: roundId,
          group_id: group.id,
          profile_id: profile.id,
          handicap_for_round: profile.current_handicap,
          is_organizer: false,
        });

      if (joinError) {
        if (joinError.code === '23505') {
          toast.info('Ya estás en esta ronda');
          navigate('/');
          return;
        }
        throw joinError;
      }

      toast.success('Te has unido a la ronda');
      navigate('/');
    } catch (err) {
      console.error('Error joining round:', err);
      toast.error('Error al unirse a la ronda');
    } finally {
      setJoining(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">
              Volver al Inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!roundInfo) return null;

  const teeColorNames: Record<string, string> = {
    blue: 'Azules',
    white: 'Blancas',
    yellow: 'Amarillas',
    red: 'Rojas',
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto pt-8">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Unirse a Ronda</CardTitle>
            <CardDescription>
              {roundInfo.organizer.display_name} te invita a jugar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Course Info */}
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="font-medium">{roundInfo.course.name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {format(new Date(roundInfo.date), "EEEE d 'de' MMMM", { locale: es })}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                Tees: {teeColorNames[roundInfo.tee_color] || roundInfo.tee_color}
              </div>
            </div>

            {/* Players */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Jugadores ({roundInfo.players.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {roundInfo.players.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-muted rounded-full px-3 py-1"
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: p.profile.avatar_color }}
                    >
                      {p.profile.initials}
                    </div>
                    <span className="text-sm">{p.profile.display_name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status */}
            {roundInfo.status === 'completed' && (
              <div className="text-center text-muted-foreground text-sm py-2">
                Esta ronda ya ha finalizado
              </div>
            )}

            {/* Action Button */}
            {alreadyJoined ? (
              <Button className="w-full" variant="secondary" disabled>
                <CheckCircle className="h-4 w-4 mr-2" />
                Ya estás en esta ronda
              </Button>
            ) : roundInfo.status !== 'completed' ? (
              <Button
                onClick={handleJoin}
                className="w-full"
                disabled={joining}
              >
                {joining ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {user ? 'Unirme a la Ronda' : 'Iniciar Sesión para Unirme'}
              </Button>
            ) : (
              <Button onClick={() => navigate('/')} className="w-full">
                Volver al Inicio
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default JoinRound;
