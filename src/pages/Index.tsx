import React, { useState } from 'react';
import { PlayerScoreInput } from '@/components/scoring/PlayerScoreInput';
import { PlayerSetup } from '@/components/setup/PlayerSetup';
import { CourseSelect } from '@/components/setup/CourseSelect';
import { BetSetup, defaultBetConfig } from '@/components/setup/BetSetup';
import { Scorecard } from '@/components/scorecard/Scorecard';
import { GeneralBetTable, PlayerBetIcons, BetDetailView } from '@/components/bets/BetViews';
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { defaultMarkerState } from '@/types/golf';
import { getCourseById } from '@/data/queretaroCourses';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, LayoutGrid, Trophy, Users } from 'lucide-react';

type AppView = 'setup' | 'scoring' | 'scorecard' | 'bets';

const Index = () => {
  const [view, setView] = useState<AppView>('setup');
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [betConfig, setBetConfig] = useState<BetConfig>(defaultBetConfig);
  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState<Map<string, PlayerScore[]>>(new Map());
  const [selectedRival, setSelectedRival] = useState<string | null>(null);

  const course = selectedCourseId ? getCourseById(selectedCourseId) : null;

  const canStartRound = players.length >= 2 && course !== null;

  const startRound = () => {
    // Initialize scores for all players
    const initialScores = new Map<string, PlayerScore[]>();
    players.forEach(player => {
      const strokesPerHole = calculateStrokesPerHole(player.handicap, course!);
      const playerScores: PlayerScore[] = Array.from({ length: 18 }, (_, i) => ({
        playerId: player.id,
        holeNumber: i + 1,
        strokes: 0,
        putts: 0,
        markers: { ...defaultMarkerState },
        strokesReceived: strokesPerHole[i],
        netScore: 0,
      }));
      initialScores.set(player.id, playerScores);
    });
    setScores(initialScores);
    setView('scoring');
  };

  const updateScore = (playerId: string, holeNumber: number, updates: Partial<PlayerScore>) => {
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
  };

  const holePar = course?.holes[currentHole - 1]?.par || 4;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-3 px-4 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Golf Bets</h1>
            <p className="text-[10px] text-primary-foreground/70">by SCF</p>
          </div>
          {view !== 'setup' && course && (
            <div className="text-right">
              <p className="text-xl font-bold text-accent">Hoyo {currentHole}</p>
              <p className="text-[10px] text-primary-foreground/70">Par {holePar} • {course.name.split(' ')[0]}</p>
            </div>
          )}
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
            <CourseSelect selectedCourseId={selectedCourseId} onChange={setSelectedCourseId} />
            <PlayerSetup players={players} onChange={setPlayers} />
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
              {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => (
                <button
                  key={hole}
                  onClick={() => setCurrentHole(hole)}
                  className={`min-w-[2rem] h-8 rounded-full text-sm font-medium transition-all
                    ${currentHole === hole ? 'bg-primary text-primary-foreground scale-110' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  {hole}
                </button>
              ))}
            </div>

            {/* Player Score Inputs */}
            {players.map(player => {
              const playerScores = scores.get(player.id) || [];
              const holeScore = playerScores.find(s => s.holeNumber === currentHole);
              return (
                <PlayerScoreInput
                  key={player.id}
                  playerName={player.name}
                  playerInitials={player.initials}
                  avatarColor={player.color}
                  holeNumber={currentHole}
                  par={holePar}
                  strokes={holeScore?.strokes || 0}
                  putts={holeScore?.putts || 0}
                  markers={holeScore?.markers || defaultMarkerState}
                  onStrokesChange={(strokes) => updateScore(player.id, currentHole, { strokes })}
                  onPuttsChange={(putts) => updateScore(player.id, currentHole, { putts })}
                  onMarkersChange={(markers) => updateScore(player.id, currentHole, { markers })}
                  handicapStrokes={holeScore?.strokesReceived || 0}
                />
              );
            })}

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
          <Scorecard players={players} course={course} scores={scores} currentHole={currentHole} onHoleClick={h => { setCurrentHole(h); setView('scoring'); }} />
        )}

        {view === 'bets' && (
          <>
            {players.length > 0 && (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">Selecciona un rival</p>
                  <PlayerBetIcons
                    player={players[0]}
                    allPlayers={players}
                    betConfig={betConfig}
                    betSummaries={[]}
                    onPlayerClick={setSelectedRival}
                    selectedRival={selectedRival}
                  />
                </div>
                {selectedRival && (
                  <BetDetailView
                    player={players[0]}
                    rival={players.find(p => p.id === selectedRival)!}
                    summaries={[]}
                    betConfig={betConfig}
                  />
                )}
                <GeneralBetTable players={players} summaries={[]} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
