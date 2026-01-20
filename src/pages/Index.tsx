import React, { useState } from 'react';
import { PlayerScoreInput } from '@/components/scoring/PlayerScoreInput';
import { MarkerState, defaultMarkerState } from '@/components/scoring/ScoreMarkers';

interface PlayerData {
  name: string;
  initials: string;
  color: string;
  strokes: number;
  putts: number;
  markers: MarkerState;
  handicapStrokes: number;
}

const Index = () => {
  const [currentHole, setCurrentHole] = useState(1);
  const holePar = 4;

  const [players, setPlayers] = useState<PlayerData[]>([
    { name: 'Santiago Cruz', initials: 'SC', color: 'bg-golf-green', strokes: 0, putts: 0, markers: { ...defaultMarkerState }, handicapStrokes: 1 },
    { name: 'Fernando Mendez', initials: 'FM', color: 'bg-golf-gold text-golf-dark', strokes: 0, putts: 0, markers: { ...defaultMarkerState }, handicapStrokes: 0 },
    { name: 'Ricardo Alvarez', initials: 'RA', color: 'bg-golf-green-light', strokes: 0, putts: 0, markers: { ...defaultMarkerState }, handicapStrokes: 0 },
    { name: 'Miguel Torres', initials: 'MT', color: 'bg-golf-dark', strokes: 0, putts: 0, markers: { ...defaultMarkerState }, handicapStrokes: 1 },
  ]);

  const updatePlayer = (index: number, updates: Partial<PlayerData>) => {
    setPlayers(prev => prev.map((p, i) => i === index ? { ...p, ...updates } : p));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-4 px-4 shadow-lg">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Golf Bets</h1>
              <p className="text-xs text-primary-foreground/70">by SCF</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-accent">Hoyo {currentHole}</p>
              <p className="text-xs text-primary-foreground/70">Par {holePar}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Hole Navigation */}
      <div className="bg-card border-b border-border py-2 px-4 overflow-x-auto">
        <div className="max-w-md mx-auto flex gap-1">
          {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => (
            <button
              key={hole}
              onClick={() => setCurrentHole(hole)}
              className={`
                min-w-[2rem] h-8 rounded-full text-sm font-medium transition-all
                ${currentHole === hole 
                  ? 'bg-primary text-primary-foreground shadow-md scale-110' 
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'}
              `}
            >
              {hole}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-md mx-auto p-4 space-y-3">
        <div className="text-center mb-4">
          <p className="text-sm text-muted-foreground">
            Captura el score de cada jugador
          </p>
        </div>

        {players.map((player, index) => (
          <PlayerScoreInput
            key={player.name}
            playerName={player.name}
            playerInitials={player.initials}
            avatarColor={player.color}
            holeNumber={currentHole}
            par={holePar}
            strokes={player.strokes}
            putts={player.putts}
            markers={player.markers}
            onStrokesChange={(strokes) => updatePlayer(index, { strokes })}
            onPuttsChange={(putts) => updatePlayer(index, { putts })}
            onMarkersChange={(markers) => updatePlayer(index, { markers })}
            handicapStrokes={player.handicapStrokes}
          />
        ))}

        {/* Navigation Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={() => setCurrentHole(Math.max(1, currentHole - 1))}
            disabled={currentHole === 1}
            className="flex-1 py-3 rounded-xl border border-border bg-card text-foreground font-medium disabled:opacity-40 transition-all hover:bg-muted"
          >
            ← Anterior
          </button>
          <button
            onClick={() => setCurrentHole(Math.min(18, currentHole + 1))}
            disabled={currentHole === 18}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-40 transition-all hover:bg-primary/90"
          >
            Siguiente →
          </button>
        </div>
      </main>
    </div>
  );
};

export default Index;
