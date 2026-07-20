import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, MapPin, Calendar, Users, CheckCircle, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import { formatPlayerName } from '@/lib/playerInput';
import { GuestConversionModal } from '@/components/guest/GuestConversionModal';

interface GroupInfo {
  id: string;
  group_number: number;
  name: string;
  players: {
    display_name: string;
    initials: string;
    avatar_color: string;
    is_guest: boolean;
  }[];
}

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
  groups: GroupInfo[];
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
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  
  // Guest mode state
  const [showGuestMode, setShowGuestMode] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [joiningAsGuest, setJoiningAsGuest] = useState(false);
  const [guestJoined, setGuestJoined] = useState(false);

  // Conversion modal state
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [guestSession, setGuestSession] = useState<{
    session_id: string;
    ghost_profile_id: string;
    round_player_id: string;
    display_name: string;
  } | null>(null);

  useEffect(() => {
    if (!roundId) {
      setError('ID de ronda inválido');
      setLoading(false);
      return;
    }

    const fetchRoundInfo = async () => {
      try {
        const { data, error: rpcError } = await supabase
          .rpc('get_round_invite_info', { p_round_id: roundId });

        if (rpcError) throw rpcError;
        if (!data) throw new Error('Round not found');

        const parsed = data as any;
        const players = (parsed.players || []).map((p: any) => ({ profile: p }));
        const groups: GroupInfo[] = parsed.groups || [];

        if (profile) {
          setAlreadyJoined(false);
        }

        if (groups.length === 1) {
          setSelectedGroupId(groups[0].id);
        }

        setRoundInfo({
          id: parsed.id,
          date: parsed.date,
          tee_color: parsed.tee_color,
          status: parsed.status,
          course: parsed.course,
          organizer: parsed.organizer,
          groups,
          players,
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

  // Case B: Guest returns to the link — validate session against DB
  useEffect(() => {
    if (!roundId || !roundInfo) return;
    if (user && !user.is_anonymous) return;

    const stored = localStorage.getItem(`guest_session_${roundId}`);
    if (!stored) return;

    let session: any;
    try {
      session = JSON.parse(stored);
    } catch {
      localStorage.removeItem(`guest_session_${roundId}`);
      return;
    }

    // For completed rounds, skip DB validation (RLS blocks unauthenticated reads)
    // and show the conversion UI directly from localStorage data
    if (roundInfo.status === 'completed') {
      setGuestSession(session);
      setGuestJoined(true);
      setShowConversionModal(true);
      return;
    }

    // For active rounds, validate that the ghost profile is still a player
    const validate = async () => {
      const { data } = await supabase
        .from('round_players')
        .select('id')
        .eq('id', session.round_player_id)
        .eq('round_id', roundId)
        .maybeSingle();

      if (!data) {
        // Player was removed — clear stale session
        localStorage.removeItem(`guest_session_${roundId}`);
        // Sign out the anonymous session so the user sees a clean join page
        if (user?.is_anonymous) {
          await supabase.auth.signOut();
        }
        return;
      }

      setGuestSession(session);
      setGuestJoined(true);
    };
    validate();
  }, [roundId, roundInfo, user]);

  // Case A: Guest is connected when round closes — listen for Realtime changes
  useEffect(() => {
    if (!roundId || !guestSession || (user && !user.is_anonymous)) return;

    const channel = supabase
      .channel(`round-status-${roundId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rounds',
          filter: `id=eq.${roundId}`,
        },
        (payload) => {
          if (payload.new && (payload.new as any).status === 'completed') {
            setRoundInfo(prev => prev ? { ...prev, status: 'completed' } : prev);
            setShowConversionModal(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId, guestSession, user]);

  const handleJoin = async () => {
    if (!user || !profile || !roundId) {
      navigate('/auth', { state: { returnTo: `/join/${roundId}` } });
      return;
    }

    if (roundInfo && roundInfo.groups.length > 1 && !selectedGroupId) {
      toast.error('Selecciona un grupo para unirte');
      return;
    }

    setJoining(true);
    try {
      const { data: rpId, error: joinError } = await supabase
        .rpc('join_round', { 
          p_round_id: roundId,
          p_group_id: selectedGroupId || null
        });
      if (joinError) throw joinError;
      if (!rpId) throw new Error('No se pudo unir a la ronda');

      toast.success('Te has unido a la ronda');
      navigate('/');
    } catch (err) {
      console.error('Error joining round:', err);
      toast.error('Error al unirse a la ronda');
    } finally {
      setJoining(false);
    }
  };

  const handleJoinAsGuest = async () => {
    if (!roundId || !guestName.trim()) {
      toast.error('Ingresa tu nombre');
      return;
    }

    if (roundInfo && roundInfo.groups.length > 1 && !selectedGroupId) {
      toast.error('Selecciona un grupo para unirte');
      return;
    }

    setJoiningAsGuest(true);
    try {
      // 1. Sign in anonymously to get a Supabase session
      const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError) throw anonError;
      if (!anonData.user) throw new Error('No se pudo crear sesión anónima');

      const anonUid = anonData.user.id;

      // 2. Join round as guest, linking ghost profile to anon auth user
      const { data, error: guestError } = await supabase
        .rpc('join_round_as_guest', {
          p_round_id: roundId,
          p_display_name: guestName.trim(),
          p_group_id: selectedGroupId || null,
          p_auth_uid: anonUid
        });

      if (guestError) throw guestError;
      if (!data) throw new Error('No se pudo unir como invitado');

      const result = data as any;
      
      const sessionData = {
        session_id: result.session_id,
        ghost_profile_id: result.ghost_profile_id,
        round_player_id: result.round_player_id,
        display_name: guestName.trim(),
      };

      // Save guest session to localStorage
      localStorage.setItem(`guest_session_${roundId}`, JSON.stringify(sessionData));

      toast.success('Te has unido a la ronda como invitado');
      // Navigate to main app — anon session passes ProtectedRoute
      navigate('/');
    } catch (err: any) {
      console.error('Error joining as guest:', err);
      toast.error(err?.message || 'Error al unirse como invitado');
    } finally {
      setJoiningAsGuest(false);
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
    yellow: 'Doradas',
    red: 'Rojas',
  };

  const hasMultipleGroups = roundInfo.groups.length > 1;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto pt-8">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Unirse a Ronda</CardTitle>
            <CardDescription>
              {formatPlayerName(roundInfo.organizer.display_name)} te invita a jugar
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
                  {format(parseLocalDate(roundInfo.date), "EEEE d 'de' MMMM", { locale: es })}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                Tees: {teeColorNames[roundInfo.tee_color] || roundInfo.tee_color}
              </div>
            </div>

            {/* Group Selection */}
            {hasMultipleGroups ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Selecciona un grupo para unirte
                  </span>
                </div>
                <div className="space-y-2">
                  {roundInfo.groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border-2 transition-all",
                        selectedGroupId === group.id
                          ? "border-primary bg-primary/5"
                          : "border-border bg-muted/50 hover:border-muted-foreground/50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{group.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {group.players.length} jugador{group.players.length !== 1 ? 'es' : ''}
                        </span>
                      </div>
                      {group.players.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {group.players.map((p, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-1.5 bg-background rounded-full px-2 py-0.5"
                            >
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                style={{ backgroundColor: p.avatar_color }}
                              >
                                {p.initials}
                              </div>
                              <span className="text-xs">{formatPlayerName(p.display_name)}</span>
                              {p.is_guest && (
                                <span className="text-[10px] text-muted-foreground">(inv)</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          Sin jugadores registrados aún
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Jugadores ({roundInfo.groups[0]?.players.length || 0})
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {roundInfo.groups[0]?.players.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-muted rounded-full px-3 py-1"
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: p.avatar_color }}
                      >
                        {p.initials}
                      </div>
                      <span className="text-sm">{formatPlayerName(p.display_name)}</span>
                    </div>
                  ))}
                  {(!roundInfo.groups[0] || roundInfo.groups[0].players.length === 0) && (
                    <p className="text-sm text-muted-foreground">No hay jugadores registrados aún</p>
                  )}
                </div>
              </div>
            )}

            {/* Status */}
            {roundInfo.status === 'completed' && (
              <div className="text-center text-muted-foreground text-sm py-2">
                Esta ronda ya ha finalizado
              </div>
            )}

            {/* Action Buttons */}
            {guestJoined && !user ? (
              /* Guest already joined — show status */
              <div className="space-y-3">
                <div className="bg-primary/10 rounded-lg p-4 text-center space-y-1">
                  <CheckCircle className="h-6 w-6 text-primary mx-auto" />
                  <div className="font-medium text-sm">
                    Estás en la ronda como {guestSession?.display_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {roundInfo.status === 'completed' 
                      ? 'La ronda ha finalizado' 
                      : 'Esperando a que el organizador cierre la ronda...'}
                  </div>
                </div>
                {roundInfo.status === 'completed' && (
                  <Button
                    className="w-full"
                    onClick={() => setShowConversionModal(true)}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Crear cuenta y conservar historial
                  </Button>
                )}
              </div>
            ) : alreadyJoined ? (
              <Button className="w-full" variant="secondary" disabled>
                <CheckCircle className="h-4 w-4 mr-2" />
                Ya estás en esta ronda
              </Button>
            ) : roundInfo.status !== 'completed' ? (
              <div className="space-y-3">
                {/* Guest mode form */}
                {showGuestMode ? (
                  <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
                    <div className="text-sm font-medium text-center">¿Cómo te llamas?</div>
                    <Input
                      placeholder="Tu nombre"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      maxLength={40}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setShowGuestMode(false); setGuestName(''); }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleJoinAsGuest}
                        disabled={joiningAsGuest || !guestName.trim() || (hasMultipleGroups && !selectedGroupId)}
                      >
                        {joiningAsGuest ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Unirme
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Primary: registered user join */}
                    <Button
                      onClick={handleJoin}
                      className="w-full"
                      disabled={joining || (hasMultipleGroups && !selectedGroupId)}
                    >
                      {joining ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      {user ? (
                        hasMultipleGroups && !selectedGroupId 
                          ? 'Selecciona un grupo' 
                          : 'Unirme a la Ronda'
                      ) : 'Iniciar Sesión para Unirme'}
                    </Button>

                    {/* Secondary: guest join (only show if not logged in) */}
                    {!user && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setShowGuestMode(true)}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Entrar sin cuenta
                      </Button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <Button onClick={() => navigate('/')} className="w-full">
                Volver al Inicio
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Guest Conversion Modal */}
      {guestSession && roundId && (
        <GuestConversionModal
          open={showConversionModal}
          onOpenChange={setShowConversionModal}
          roundId={roundId}
          guestSessionId={guestSession.session_id}
          ghostProfileId={guestSession.ghost_profile_id}
          displayName={guestSession.display_name}
          onConverted={() => {
            setShowConversionModal(false);
            toast.success('¡Bienvenido! Tu historial está vinculado.');
            navigate('/');
          }}
          onDismissed={() => {
            setGuestJoined(false);
            setGuestSession(null);
          }}
        />
      )}
    </div>
  );
};

export default JoinRound;
