import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Calculator, TrendingDown, TrendingUp, Minus, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';

interface RoundScore {
  date: string;
  courseName: string;
  grossScore: number;
  courseRating: number;
  slopeRating: number;
  differential: number;
  used: boolean;
}

interface HandicapCalculatorProps {
  onClose?: () => void;
}

export const HandicapCalculator: React.FC<HandicapCalculatorProps> = ({ onClose }) => {
  const { profile } = useAuth();
  const [rounds, setRounds] = useState<RoundScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculatedHandicap, setCalculatedHandicap] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;

    const fetchScores = async () => {
      try {
        // Get last 20 completed rounds
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
              golf_courses(name, location)
            )
          `)
          .eq('profile_id', profile.id)
          .eq('rounds.status', 'completed')
          .order('rounds(date)', { ascending: false })
          .limit(20);

        if (error) throw error;

        const roundScores: RoundScore[] = [];

        for (const rp of roundPlayers || []) {
          const round = rp.rounds as any;
          const course = round.golf_courses as any;

          // Get total strokes
          const { data: scores } = await supabase
            .from('hole_scores')
            .select('strokes')
            .eq('round_player_id', rp.id);

          const grossScore = scores?.reduce((sum, s) => sum + (s.strokes || 0), 0) || 0;

          // Default course/slope ratings (would come from course data in full implementation)
          const courseRating = 72.0;
          const slopeRating = 125;

          // Calculate score differential: (113 / Slope) × (Gross - Course Rating)
          const differential = (113 / slopeRating) * (grossScore - courseRating);

          roundScores.push({
            date: round.date,
            courseName: course?.name || 'Campo',
            grossScore,
            courseRating,
            slopeRating,
            differential: Math.round(differential * 10) / 10,
            used: false,
          });
        }

        // Sort by differential (ascending) to find best scores
        const sortedByDifferential = [...roundScores].sort((a, b) => a.differential - b.differential);

        // USGA Handicap Index calculation:
        // Use best differentials based on number of rounds
        let numToUse = 0;
        const totalRounds = roundScores.length;

        if (totalRounds >= 20) numToUse = 8;
        else if (totalRounds >= 19) numToUse = 7;
        else if (totalRounds >= 18) numToUse = 7;
        else if (totalRounds >= 17) numToUse = 6;
        else if (totalRounds >= 16) numToUse = 6;
        else if (totalRounds >= 15) numToUse = 5;
        else if (totalRounds >= 14) numToUse = 5;
        else if (totalRounds >= 13) numToUse = 4;
        else if (totalRounds >= 12) numToUse = 4;
        else if (totalRounds >= 11) numToUse = 3;
        else if (totalRounds >= 10) numToUse = 3;
        else if (totalRounds >= 9) numToUse = 2;
        else if (totalRounds >= 8) numToUse = 2;
        else if (totalRounds >= 7) numToUse = 2;
        else if (totalRounds >= 6) numToUse = 1;
        else if (totalRounds >= 5) numToUse = 1;
        else if (totalRounds >= 4) numToUse = 1;
        else if (totalRounds >= 3) numToUse = 1;
        else numToUse = 0;

        // Mark which rounds are used
        const usedDifferentials: number[] = [];
        for (let i = 0; i < numToUse && i < sortedByDifferential.length; i++) {
          sortedByDifferential[i].used = true;
          usedDifferentials.push(sortedByDifferential[i].differential);
        }

        // Calculate handicap index
        if (usedDifferentials.length > 0) {
          const avgDifferential = usedDifferentials.reduce((a, b) => a + b, 0) / usedDifferentials.length;
          // Multiply by 0.96 (96%) per USGA rules
          const handicapIndex = avgDifferential * 0.96;
          setCalculatedHandicap(Math.round(handicapIndex * 10) / 10);
        }

        // Mark used in original order
        roundScores.forEach(r => {
          r.used = sortedByDifferential.some(s => s.date === r.date && s.used);
        });

        setRounds(roundScores);
      } catch (err) {
        console.error('Error calculating handicap:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchScores();
  }, [profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (rounds.length < 3) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Calculator className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Se necesitan al menos 3 rondas</p>
        <p className="text-sm">Tienes {rounds.length} ronda{rounds.length !== 1 ? 's' : ''} completada{rounds.length !== 1 ? 's' : ''}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Cálculo de Handicap</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3 w-3" />
          Reglas USGA
        </div>
      </div>

      {/* Calculated Handicap Display */}
      <div className="bg-primary/10 rounded-xl p-4 text-center">
        <p className="text-sm text-muted-foreground mb-1">Handicap Index Calculado</p>
        <p className="text-4xl font-bold text-primary">
          {calculatedHandicap !== null ? calculatedHandicap : '--'}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Basado en {rounds.filter(r => r.used).length} mejores de {rounds.length} rondas
        </p>
      </div>

      {/* Current vs Calculated */}
      {profile && calculatedHandicap !== null && (
        <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
          <div>
            <p className="text-xs text-muted-foreground">Handicap Actual</p>
            <p className="font-semibold">{profile.current_handicap}</p>
          </div>
          <div className="flex items-center gap-2">
            {calculatedHandicap < profile.current_handicap ? (
              <TrendingDown className="h-5 w-5 text-green-500" />
            ) : calculatedHandicap > profile.current_handicap ? (
              <TrendingUp className="h-5 w-5 text-orange-500" />
            ) : (
              <Minus className="h-5 w-5 text-muted-foreground" />
            )}
            <span className={cn(
              "font-medium",
              calculatedHandicap < profile.current_handicap ? "text-green-500" :
              calculatedHandicap > profile.current_handicap ? "text-orange-500" : ""
            )}>
              {calculatedHandicap < profile.current_handicap ? 
                `-${(profile.current_handicap - calculatedHandicap).toFixed(1)}` :
                calculatedHandicap > profile.current_handicap ?
                `+${(calculatedHandicap - profile.current_handicap).toFixed(1)}` :
                'Sin cambio'}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Nuevo</p>
            <p className="font-semibold text-primary">{calculatedHandicap}</p>
          </div>
        </div>
      )}

      {/* Rounds Table */}
      <div className="space-y-1">
        <div className="grid grid-cols-4 text-xs text-muted-foreground px-2 py-1">
          <span>Fecha</span>
          <span className="text-center">Gross</span>
          <span className="text-center">Dif.</span>
          <span className="text-right">Usado</span>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {rounds.map((round, idx) => (
            <div
              key={idx}
              className={cn(
                "grid grid-cols-4 text-sm px-2 py-1.5 rounded",
                round.used ? "bg-primary/10 font-medium" : "bg-muted/30"
              )}
            >
              <span className="text-muted-foreground text-xs">
                {parseLocalDate(round.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
              </span>
              <span className="text-center">{round.grossScore}</span>
              <span className={cn(
                "text-center",
                round.differential < 0 ? "text-green-500" : ""
              )}>
                {round.differential > 0 ? '+' : ''}{round.differential}
              </span>
              <span className="text-right">
                {round.used ? '✓' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        * Ratings de campo usando valores por defecto (CR: 72, Slope: 125)
      </p>
    </div>
  );
};
