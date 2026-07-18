import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy } from 'lucide-react';

const LeagueLeaderboard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/leaderboards')}
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Trophy className="h-5 w-5 text-amber-500" />
          <h1 className="text-base font-semibold">Liga</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-lg border bg-card p-6 text-center">
          <Trophy className="h-10 w-10 mx-auto mb-3 text-amber-500 opacity-70" />
          <p className="text-sm text-muted-foreground">
            Detalle de la liga <span className="font-mono text-xs">{id}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            La vista de standings y jornadas se implementará en el siguiente paso.
          </p>
        </div>
      </main>
    </div>
  );
};

export default LeagueLeaderboard;
