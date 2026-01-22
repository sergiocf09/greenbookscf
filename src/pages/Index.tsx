import React, { useState, useEffect, useCallback } from 'react';
import { PlayerScoreInput } from '@/components/scoring/PlayerScoreInput';
import { PlayerSetup } from '@/components/setup/PlayerSetup';
import { CourseSelect } from '@/components/setup/CourseSelect';
import { BetSetup, defaultBetConfig } from '@/components/setup/BetSetup';
import { Scorecard } from '@/components/scorecard/Scorecard';
import { BetDashboard } from '@/components/bets/BetDashboard';
import { Player, PlayerScore, BetConfig, GolfCourse, HoleInfo } from '@/types/golf';
import { defaultMarkerState } from '@/types/golf';
import { useGolfCourses } from '@/hooks/useGolfCourses';
import { useRoundManagement } from '@/hooks/useRoundManagement';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Settings, LayoutGrid, Trophy, Users, LogOut, User, Check, CheckCircle2, Calendar as CalendarIcon, Share2, Lock, Play, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

type AppView = 'setup' | 'scoring' | 'scorecard' | 'bets';

const Index = () => {
  const { profile, signOut } = useAuth();
  const [view, setView] = useState<AppView>('setup');
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [betConfig, setBetConfig] = useState<BetConfig>(defaultBetConfig);
  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState<Map<string, PlayerScore[]>>(new Map());
  const [confirmedHoles, setConfirmedHoles] = useState<Set<number>>(new Set());
  
  const [teeColor, setTeeColor] = useState<'blue' | 'white' | 'yellow' | 'red'>('white');

  const { getCourseById } = useGolfCourses();
  const course = selectedCourseId ? getCourseById(selectedCourseId) : null;

  // Round management hook with restoration
  const {
    roundState,
    isLoading,
    isRestoring,
    isRoundStarted,
    roundPlayerIds,
    createRound,
    startRound: startRoundInDb,
    closeScorecard,
    setRoundDate,
    copyShareLink,
    getShareableLink,
  } = useRoundManagement({
    players,
    setPlayers,
    scores,
    setScores,
    setConfirmedHoles,
    betConfig,
    setBetConfig,
    course,
    setSelectedCourseId,
    setTeeColor,
    getCourseById,
  });
  // Track if we've done initial navigation after restore
  const [hasInitialNavigated, setHasInitialNavigated] = useState(false);

  // Auto-navigate to scoring view ONLY once when round is first restored
  useEffect(() => {
    if (!isRestoring && isRoundStarted && !hasInitialNavigated && roundState.status !== 'completed') {
      setView('scoring');
      setHasInitialNavigated(true);
    } else if (!isRestoring && !hasInitialNavigated) {
      setHasInitialNavigated(true);
    }
  }, [isRestoring, isRoundStarted, hasInitialNavigated, roundState.status]);

  // Function to start a new round (reset everything)
  const startNewRound = useCallback(() => {
    // Reset all state
    setPlayers([]);
    setScores(new Map());
    setConfirmedHoles(new Set());
    setSelectedCourseId(null);
    setBetConfig(defaultBetConfig);
    setCurrentHole(1);
    setHasInitialNavigated(true); // Prevent auto-navigate
    setView('setup');
    
    // Force page reload to reset hook state
    window.location.reload();
  }, []);

  // Initialize base player from profile (only if not restoring and no players)
  useEffect(() => {
    if (!isRestoring && profile && players.length === 0) {
      const basePlayer: Player = {
        id: profile.id,
        name: profile.display_name,
        initials: profile.initials,
        color: profile.avatar_color,
        handicap: Number(profile.current_handicap) || 0,
        profileId: profile.id,
      };
      setPlayers([basePlayer]);
    }
  }, [profile, players.length, isRestoring]);

  // Can create and start round with just 1 player (for solo score tracking)
  const canCreateRound = players.length >= 1 && course !== null;
  const canStartScoring = players.length >= 1 && course !== null;

  // Initialize scores locally (for when continuing or starting)
  const initializeScores = useCallback(() => {
    if (!course) return;
    const initialScores = new Map<string, PlayerScore[]>();
    players.forEach(player => {
      const strokesPerHole = calculateStrokesPerHole(player.handicap, course);
      const playerScores: PlayerScore[] = Array.from({ length: 18 }, (_, i) => {
        const holePar = course.holes[i]?.par || 4;
        return {
          playerId: player.id,
          holeNumber: i + 1,
          strokes: holePar,
          putts: 2,
          markers: { ...defaultMarkerState },
          strokesReceived: strokesPerHole[i],
          netScore: holePar - strokesPerHole[i],
          confirmed: false,
        };
      });
      initialScores.set(player.id, playerScores);
    });
    setScores(initialScores);
  }, [course, players]);

  // Create round in database (can do with 1 player to get share link)
  const handleCreateRound = async () => {
    if (!course || !selectedCourseId) return;
    
    if (!roundState.id) {
      await createRound(selectedCourseId, teeColor, roundState.date);
    }
  };

  // Start scoring (can do with 1 player for solo tracking)
  const handleStartRound = async () => {
    if (!course || !selectedCourseId) return;
    
    // Create round in database first if not exists
    if (!roundState.id) {
      const roundId = await createRound(selectedCourseId, teeColor, roundState.date);
      if (!roundId) return;
    }
    
    // Initialize scores and start
    initializeScores();
    const success = await startRoundInDb();
    if (success) {
      setView('scoring');
    }
  };

  const handleContinueRound = () => {
    // Just navigate to scoring without reinitializing
    setView('scoring');
  };

  // Save score to database when updated
  const saveScoreToDb = useCallback(async (playerId: string, holeNumber: number, score: Partial<PlayerScore>) => {
    const rpId = roundPlayerIds.get(playerId);
    if (!rpId || !roundState.id) return;

    try {
      const { error } = await supabase
        .from('hole_scores')
        .upsert({
          round_player_id: rpId,
          hole_number: holeNumber,
          strokes: score.strokes,
          putts: score.putts,
          net_score: score.netScore,
          strokes_received: score.strokesReceived,
          oyes_proximity: score.oyesProximity ?? null,
          confirmed: score.confirmed ?? false,
        }, {
          onConflict: 'round_player_id,hole_number',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Error saving score:', error);
      }
    } catch (err) {
      console.error('Error in saveScoreToDb:', err);
    }
  }, [roundPlayerIds, roundState.id]);

  const updateScore = useCallback((playerId: string, holeNumber: number, updates: Partial<PlayerScore>) => {
    setScores(prev => {
      const newScores = new Map(prev);
      const playerScores = [...(newScores.get(playerId) || [])];
      const idx = playerScores.findIndex(s => s.holeNumber === holeNumber);
      if (idx >= 0) {
        playerScores[idx] = { ...playerScores[idx], ...updates };
        if (updates.strokes !== undefined) {
          playerScores[idx].netScore = updates.strokes - playerScores[idx].strokesReceived;
        }
        // Save to database
        if (roundState.id) {
          saveScoreToDb(playerId, holeNumber, playerScores[idx]);
        }
      }
      newScores.set(playerId, playerScores);
      return newScores;
    });
  }, [saveScoreToDb, roundState.id]);

  const confirmHole = useCallback((holeNumber: number) => {
    // Mark all players' scores for this hole as confirmed
    setScores(prev => {
      const newScores = new Map(prev);
      players.forEach(player => {
        const playerScores = [...(newScores.get(player.id) || [])];
        const idx = playerScores.findIndex(s => s.holeNumber === holeNumber);
        if (idx >= 0) {
          playerScores[idx] = { ...playerScores[idx], confirmed: true };
          // Save confirmed state to database
          if (roundState.id) {
            saveScoreToDb(player.id, holeNumber, playerScores[idx]);
          }
        }
        newScores.set(player.id, playerScores);
      });
      return newScores;
    });
    setConfirmedHoles(prev => new Set([...prev, holeNumber]));
  }, [players, saveScoreToDb, roundState.id]);

  const isHoleConfirmed = (holeNumber: number): boolean => {
    return confirmedHoles.has(holeNumber);
  };

  const currentHoleInfo: HoleInfo | null = course?.holes[currentHole - 1] || null;
  const holePar = currentHoleInfo?.par || 4;
  const holeStrokeIndex = currentHoleInfo?.handicapIndex || 1;
  const holeYards = teeColor === 'blue' ? currentHoleInfo?.yardsBlue :
                    teeColor === 'white' ? currentHoleInfo?.yardsWhite :
                    teeColor === 'yellow' ? currentHoleInfo?.yardsYellow :
                    currentHoleInfo?.yardsRed;

  // Calculate stroke advantage indicators for base player vs rivals
  const getStrokeIndicators = (rivalId: string, holeNumber: number): { receiving: boolean; giving: boolean } => {
    if (!profile) return { receiving: false, giving: false };
    
    const basePlayer = players.find(p => p.profileId === profile.id);
    const rival = players.find(p => p.id === rivalId);
    
    if (!basePlayer || !rival || !course) return { receiving: false, giving: false };
    
    const baseStrokes = calculateStrokesPerHole(basePlayer.handicap, course);
    const rivalStrokes = calculateStrokesPerHole(rival.handicap, course);
    
    const baseReceives = baseStrokes[holeNumber - 1];
    const rivalReceives = rivalStrokes[holeNumber - 1];
    
    return {
      receiving: baseReceives > rivalReceives, // Base player gets advantage
      giving: baseReceives < rivalReceives,     // Base player gives advantage
    };
  };

  // Show loading while restoring
  if (isRestoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-3 px-4 shadow-lg">
        <div className="max-w-md mx-auto flex items-center">
          {/* Left: Logo - fixed width */}
          <div className="w-16 flex-shrink-0">
            <h1 className="text-lg font-bold tracking-tight">Golf Bets</h1>
            <p className="text-[10px] text-primary-foreground/70">by SCF</p>
          </div>
          
          {/* Center: Hole Info - takes remaining space */}
          <div className="flex-1 text-center">
            {view !== 'setup' && course && currentHoleInfo && (
              <>
                <p className="text-xl font-bold text-accent">Hoyo {currentHole}</p>
                <p className="text-[10px] text-primary-foreground/70">
                  Par {holePar} • SI {holeStrokeIndex}
                  {holeYards && <span> • {holeYards} yds</span>}
                </p>
              </>
            )}
          </div>
          
          {/* Right: Profile Menu - fixed width to match left */}
          <div className="w-16 flex-shrink-0 flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: profile?.avatar_color || '#3B82F6' }}
                  >
                    {profile?.initials || <User className="h-4 w-4" />}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5">
                  <p className="font-medium text-sm">{profile?.display_name}</p>
                  <p className="text-xs text-muted-foreground">HCP: {profile?.current_handicap}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Cerrar Sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Navigation Tabs - show when round is in progress OR not in setup view */}
      {(isRoundStarted || view !== 'setup') && (
        <div className="bg-card border-b border-border">
          <div className="max-w-md mx-auto">
            <Tabs value={view} onValueChange={(v) => setView(v as AppView)}>
              <TabsList className="w-full grid grid-cols-4 h-12">
                <TabsTrigger value="setup" className="text-xs"><Settings className="h-4 w-4" /></TabsTrigger>
                <TabsTrigger value="scoring" className="text-xs"><Users className="h-4 w-4" /></TabsTrigger>
                <TabsTrigger value="scorecard" className="text-xs"><LayoutGrid className="h-4 w-4" /></TabsTrigger>
                <TabsTrigger value="bets" className="text-xs"><Trophy className="h-4 w-4" /></TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-md mx-auto p-4 space-y-4">
        {view === 'setup' && (
          <>
            {/* Date Picker */}
            <div className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
              <span className="text-sm font-medium">Fecha de la Ronda</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !roundState.date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(roundState.date, "d 'de' MMMM, yyyy", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={roundState.date}
                    onSelect={(date) => date && setRoundDate(date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <CourseSelect 
              selectedCourseId={selectedCourseId} 
              onChange={setSelectedCourseId}
              teeColor={teeColor}
              onTeeColorChange={setTeeColor}
            />
            <PlayerSetup players={players} onChange={setPlayers} maxPlayers={6} />
            
            {/* Share Link Button - show after round is created */}
            {roundState.id && (
              <Button 
                variant="outline" 
                onClick={copyShareLink}
                className="w-full"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Copiar Link para Invitar Jugadores
              </Button>
            )}

            {players.length >= 2 && <BetSetup config={betConfig} onChange={setBetConfig} players={players} />}
            
            {/* Action Buttons */}
            <div className="space-y-2">
              {/* Create Round button - shows when no round exists yet */}
              {!roundState.id && (
                <Button 
                  onClick={handleCreateRound} 
                  disabled={!canCreateRound || isLoading} 
                  className="w-full"
                  variant="outline"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Crear Ronda y Obtener Link
                </Button>
              )}

              {/* Start Scoring button */}
              {!isRoundStarted ? (
                <Button 
                  onClick={handleStartRound} 
                  disabled={!canStartScoring || isLoading} 
                  className="w-full"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Ronda
                </Button>
              ) : (
                <>
                  <Button 
                    onClick={handleContinueRound}
                    className="w-full"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Continuar Ronda
                  </Button>
                  <Button 
                    variant="outline"
                    disabled
                    className="w-full opacity-50"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Ronda Iniciada
                  </Button>
                </>
              )}
            </div>
          </>
        )}

        {view === 'scoring' && course && (
          <>
            {/* Hole Navigation */}
            <div className="flex gap-1 overflow-x-auto pb-2">
              {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
                const confirmed = isHoleConfirmed(hole);
                return (
                  <button
                    key={hole}
                    onClick={() => setCurrentHole(hole)}
                    className={`min-w-[2rem] h-8 rounded-full text-sm font-medium transition-all relative
                      ${currentHole === hole ? 'bg-primary text-primary-foreground scale-110' : 
                        confirmed ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}
                      ${hole === 9 ? 'mr-2' : ''}`}
                  >
                    {confirmed && currentHole !== hole ? <CheckCircle2 className="h-4 w-4 mx-auto" /> : hole}
                  </button>
                );
              })}
            </div>

            {/* Player Score Inputs */}
            {players.map(player => {
              const playerScores = scores.get(player.id) || [];
              const holeScore = playerScores.find(s => s.holeNumber === currentHole);
              const isBasePlayer = player.profileId === profile?.id;
              const isPar3 = holePar === 3;
              
              // Check if player has Oyeses enabled
              const oyesPlayerConfig = betConfig.oyeses.playerConfigs.find(pc => pc.playerId === player.id);
              const oyesEnabled = betConfig.oyeses.enabled && (oyesPlayerConfig?.enabled ?? false);
              
              return (
                <PlayerScoreInput
                  key={player.id}
                  playerName={player.name}
                  playerInitials={player.initials}
                  avatarColor={player.color}
                  holeNumber={currentHole}
                  par={holePar}
                  strokes={holeScore?.strokes || holePar}
                  putts={holeScore?.putts || 2}
                  markers={holeScore?.markers || defaultMarkerState}
                  onStrokesChange={(strokes) => updateScore(player.id, currentHole, { strokes })}
                  onPuttsChange={(putts) => updateScore(player.id, currentHole, { putts })}
                  onMarkersChange={(markers) => updateScore(player.id, currentHole, { markers })}
                  handicapStrokes={holeScore?.strokesReceived || 0}
                  isBasePlayer={isBasePlayer}
                  isPar3={isPar3}
                  oyesEnabled={oyesEnabled}
                  oyesProximity={holeScore?.oyesProximity}
                  onOyesProximityChange={(proximity) => updateScore(player.id, currentHole, { oyesProximity: proximity })}
                />
              );
            })}

            {/* Confirm Button */}
            <Button 
              onClick={() => confirmHole(currentHole)}
              disabled={isHoleConfirmed(currentHole)}
              className={`w-full ${isHoleConfirmed(currentHole) ? 'bg-green-600 hover:bg-green-600' : 'bg-accent hover:bg-accent/90'}`}
            >
              {isHoleConfirmed(currentHole) ? (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Hoyo Confirmado</>
              ) : (
                <><Check className="h-4 w-4 mr-2" /> Confirmar Scores del Hoyo {currentHole}</>
              )}
            </Button>

            {/* Navigation Buttons */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setCurrentHole(Math.max(1, currentHole - 1))} disabled={currentHole === 1} className="flex-1">
                ← Anterior
              </Button>
              <Button onClick={() => setCurrentHole(Math.min(18, currentHole + 1))} disabled={currentHole === 18} className="flex-1">
                Siguiente →
              </Button>
            </div>
          </>
        )}

        {view === 'scorecard' && course && (
          <Scorecard 
            players={players} 
            course={course} 
            scores={scores} 
            currentHole={currentHole} 
            onHoleClick={h => { setCurrentHole(h); setView('scoring'); }}
            basePlayerId={profile?.id}
            getStrokeIndicators={getStrokeIndicators}
            confirmedHoles={confirmedHoles}
          />
        )}

        {view === 'bets' && course && (
          <>
            <BetDashboard
              players={players}
              scores={scores}
              betConfig={betConfig}
              course={course}
              basePlayerId={profile?.id}
              confirmedHoles={confirmedHoles}
              onBetConfigChange={setBetConfig}
            />
            
            {/* Close Scorecard Button */}
            {isRoundStarted && roundState.status !== 'completed' && (
              <Button 
                variant="destructive"
                onClick={async () => {
                  // TODO: Collect all bet results from BetDashboard
                  const allBetResults: any[] = [];
                  const success = await closeScorecard(allBetResults);
                  if (success) {
                    toast.success('Tarjeta cerrada exitosamente');
                  }
                }}
                disabled={isLoading}
                className="w-full mt-4"
              >
                <Lock className="h-4 w-4 mr-2" />
                Cerrar Tarjeta y Guardar
              </Button>
            )}
            
            {roundState.status === 'completed' && (
              <div className="space-y-4">
                <div className="text-center text-muted-foreground text-sm py-4 bg-muted rounded-lg">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
                  Tarjeta cerrada y guardada
                </div>
                <Button 
                  onClick={startNewRound}
                  className="w-full"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Nueva Ronda
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
