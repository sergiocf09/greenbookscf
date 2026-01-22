import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Users, MapPin, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface RoundHistoryItem {
  id: string;
  date: string;
  status: string;
  courseName: string;
  courseLocation: string;
  teeColor: string;
  totalStrokes: number;
  handicapUsed: number;
  playersCount: number;
}

interface RoundHistoryProps {
  onClose?: () => void;
}

export const RoundHistory: React.FC<RoundHistoryProps> = ({ onClose }) => {
  const { profile } = useAuth();
  const [rounds, setRounds] = useState<RoundHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    const fetchRounds = async () => {
      try {
        // Get all completed rounds for this player
        const { data: roundPlayers, error } = await supabase
          .from('round_players')
          .select(`
            id,
            handicap_for_round,
            round_id,
            rounds!inner(
              id,
              date,
              status,
              tee_color,
              golf_courses(name, location)
            )
          `)
          .eq('profile_id', profile.id)
          .eq('rounds.status', 'completed')
          .order('rounds(date)', { ascending: false });

        if (error) throw error;

        // Get hole scores for each round player
        const roundItems: RoundHistoryItem[] = [];
        
        for (const rp of roundPlayers || []) {
          const round = rp.rounds as any;
          const course = round.golf_courses as any;

          // Get total strokes
          const { data: scores } = await supabase
            .from('hole_scores')
            .select('strokes')
            .eq('round_player_id', rp.id);

          const totalStrokes = scores?.reduce((sum, s) => sum + (s.strokes || 0), 0) || 0;

          // Get player count
          const { count } = await supabase
            .from('round_players')
            .select('id', { count: 'exact', head: true })
            .eq('round_id', rp.round_id);

          roundItems.push({
            id: round.id,
            date: round.date,
            status: round.status,
            courseName: course?.name || 'Campo desconocido',
            courseLocation: course?.location || '',
            teeColor: round.tee_color,
            totalStrokes,
            handicapUsed: Number(rp.handicap_for_round) || 0,
            playersCount: count || 1,
          });
        }

        setRounds(roundItems);
      } catch (err) {
        console.error('Error fetching round history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRounds();
  }, [profile]);

  const getTeeColorClass = (tee: string) => {
    switch (tee) {
      case 'blue': return 'bg-blue-500';
      case 'white': return 'bg-white border border-gray-300';
      case 'yellow': return 'bg-yellow-400';
      case 'red': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No hay rondas completadas</p>
        <p className="text-sm">Completa tu primera ronda para ver el historial</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-lg">Historial de Rondas</h3>
      <ScrollArea className="h-[400px]">
        <div className="space-y-2 pr-4">
          {rounds.map((round) => (
            <div
              key={round.id}
              className="bg-card border border-border rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setExpandedRound(expandedRound === round.id ? null : round.id)}
                className="w-full p-3 text-left flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={cn('w-3 h-3 rounded-full', getTeeColorClass(round.teeColor))} />
                  <div>
                    <p className="font-medium text-sm">{round.courseName}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(round.date), "d MMM yyyy", { locale: es })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-bold text-lg">{round.totalStrokes}</p>
                    <p className="text-[10px] text-muted-foreground">golpes</p>
                  </div>
                  {expandedRound === round.id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {expandedRound === round.id && (
                <div className="px-3 pb-3 pt-0 border-t border-border/50 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {round.courseLocation}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {round.playersCount} jugador{round.playersCount > 1 ? 'es' : ''}
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Handicap usado:</span>
                    <span className="font-medium">{round.handicapUsed}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
