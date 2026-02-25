import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Calculator, TrendingDown, TrendingUp, Minus, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import {
  calculateDifferential,
  calculateAdjustedGrossScore,
  calculateHandicapIndexFromDifferentials,
  getNumDifferentialsToUse,
} from '@/lib/usgaHandicap';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { GolfCourse, HoleInfo } from '@/types/golf';

interface RoundScore {
  date: string;
  courseName: string;
  grossScore: number;
  adjustedGrossScore: number;
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
            id, handicap_for_round, round_id, tee_color,
            rounds!inner( id, date, status, course_id, tee_color, golf_courses(name, location) )
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
          const playerTee = (rp as any).tee_color || round.tee_color || 'white';
          const hcpUsed = Number(rp.handicap_for_round) || 0;

          // Get hole scores
          const { data: scores } = await supabase
            .from('hole_scores')
            .select('hole_number, strokes, confirmed')
            .eq('round_player_id', rp.id)
            .eq('confirmed', true)
            .not('strokes', 'is', null)
            .order('hole_number');

          if (!scores || scores.length < 18) continue;

          // Get course holes for NDB
          const { data: courseHoles } = await supabase
            .from('course_holes')
            .select('hole_number, par, stroke_index')
            .eq('course_id', round.course_id)
            .order('hole_number');

          if (!courseHoles || courseHoles.length < 18) continue;

          // Get tee-specific rating/slope
          const { data: teeData } = await supabase
            .from('course_tees')
            .select('course_rating, slope_rating')
            .eq('course_id', round.course_id)
            .eq('tee_color', playerTee)
            .maybeSingle();

          const courseRating = teeData?.course_rating || 72;
          const slopeRating = teeData?.slope_rating || 113;
          const grossScore = scores.reduce((sum, s) => sum + (s.strokes || 0), 0);

          // NDB adjustment
          const holePars = courseHoles.map(h => h.par);
          const holeStrokesArr: (number | null)[] = new Array(18).fill(null);
          for (const s of scores) {
            if (s.hole_number >= 1 && s.hole_number <= 18) holeStrokesArr[s.hole_number - 1] = s.strokes;
          }

          const minCourse: GolfCourse = {
            id: round.course_id, name: course?.name || 'Campo', location: '',
            holes: courseHoles.map(h => ({ number: h.hole_number, par: h.par, handicapIndex: h.stroke_index })) as HoleInfo[],
          };
          const strokesPerHole = calculateStrokesPerHole(hcpUsed, minCourse);
          const adjustedGrossScore = calculateAdjustedGrossScore(holeStrokesArr, holePars, strokesPerHole);
          const differential = calculateDifferential(adjustedGrossScore, courseRating, slopeRating);

          roundScores.push({
            date: round.date,
            courseName: course?.name || 'Campo',
            grossScore,
            adjustedGrossScore,
            courseRating,
            slopeRating,
            differential,
            used: false,
          });
        }

        // Sort by differential to find best
        const sortedByDifferential = [...roundScores].sort((a, b) => a.differential - b.differential);
        const numToUse = getNumDifferentialsToUse(roundScores.length);

        const usedDifferentials: number[] = [];
        for (let i = 0; i < numToUse && i < sortedByDifferential.length; i++) {
          sortedByDifferential[i].used = true;
          usedDifferentials.push(sortedByDifferential[i].differential);
        }

        if (usedDifferentials.length > 0) {
          const hi = calculateHandicapIndexFromDifferentials(usedDifferentials);
          setCalculatedHandicap(hi);
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
        * Ajuste Net Double Bogey aplicado. Ratings por tee del campo.
      </p>
    </div>
  );
};
