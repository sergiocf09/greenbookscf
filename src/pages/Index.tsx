import React, { useState, useEffect, useCallback } from 'react';
import { PlayerScoreInput } from '@/components/scoring/PlayerScoreInput';
import { PlayerSetup } from '@/components/setup/PlayerSetup';
import { CourseSelect } from '@/components/setup/CourseSelect';
import { BetSetup, defaultBetConfig } from '@/components/setup/BetSetup';
import { Scorecard } from '@/components/scorecard/Scorecard';
import { BetDashboard } from '@/components/bets/BetDashboard';
import { Player, PlayerScore, BetConfig, GolfCourse, HoleInfo } from '@/types/golf';
import { defaultMarkerState } from '@/types/golf';
import { getCourseById } from '@/data/queretaroCourses';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, LayoutGrid, Trophy, Users, LogOut, User, Check, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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

  const course = selectedCourseId ? getCourseById(selectedCourseId) : null;

  // Initialize base player from profile
  useEffect(() => {
    if (profile && players.length === 0) {
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
  }, [profile, players.length]);

  const canStartRound = players.length >= 2 && course !== null;

  const startRound = () => {
    // Initialize scores for all players with defaults
    const initialScores = new Map<string, PlayerScore[]>();
    players.forEach(player => {
      const strokesPerHole = calculateStrokesPerHole(player.handicap, course!);
      const playerScores: PlayerScore[] = Array.from({ length: 18 }, (_, i) => {
        const holePar = course!.holes[i]?.par || 4;
        return {
          playerId: player.id,
          holeNumber: i + 1,
          strokes: holePar, // Default to par
          putts: 2, // Default to 2 putts
          markers: { ...defaultMarkerState },
          strokesReceived: strokesPerHole[i],
          netScore: holePar - strokesPerHole[i],
          confirmed: false,
        };
      });
      initialScores.set(player.id, playerScores);
    });
    setScores(initialScores);
    setView('scoring');
  };

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
      }
      newScores.set(playerId, playerScores);
      return newScores;
    });
  }, []);

  const confirmHole = useCallback((holeNumber: number) => {
    // Mark all players' scores for this hole as confirmed
    setScores(prev => {
      const newScores = new Map(prev);
      players.forEach(player => {
        const playerScores = [...(newScores.get(player.id) || [])];
        const idx = playerScores.findIndex(s => s.holeNumber === holeNumber);
        if (idx >= 0) {
          playerScores[idx] = { ...playerScores[idx], confirmed: true };
        }
        newScores.set(player.id, playerScores);
      });
      return newScores;
    });
    setConfirmedHoles(prev => new Set([...prev, holeNumber]));
  }, [players]);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-3 px-4 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Golf Bets</h1>
            <p className="text-[10px] text-primary-foreground/70">by SCF</p>
          </div>
          
          <div className="flex items-center gap-3">
            {view !== 'setup' && course && currentHoleInfo && (
              <div className="text-right">
                <p className="text-xl font-bold text-accent">Hoyo {currentHole}</p>
                <p className="text-[10px] text-primary-foreground/70">
                  Par {holePar} • SI {holeStrokeIndex} {holeYards && `• ${holeYards}y`}
                </p>
              </div>
            )}
            
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

      {/* Navigation Tabs */}
      {view !== 'setup' && (
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
            <CourseSelect 
              selectedCourseId={selectedCourseId} 
              onChange={setSelectedCourseId}
              teeColor={teeColor}
              onTeeColorChange={setTeeColor}
            />
            <PlayerSetup players={players} onChange={setPlayers} maxPlayers={6} />
            {players.length >= 2 && <BetSetup config={betConfig} onChange={setBetConfig} players={players} />}
            <Button onClick={startRound} disabled={!canStartRound} className="w-full">
              Iniciar Ronda
            </Button>
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
          <BetDashboard
            players={players}
            scores={scores}
            betConfig={betConfig}
            course={course}
            basePlayerId={profile?.id}
            confirmedHoles={confirmedHoles}
          />
        )}
      </main>
    </div>
  );
};

export default Index;
