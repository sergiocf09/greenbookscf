import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUSGAHandicap, RoundDifferential } from '@/hooks/useUSGAHandicap';
import { calculateCourseHandicap } from '@/lib/usgaHandicap';
import { Loader2, TrendingDown, Calendar, Flag, CheckCircle2, AlertCircle, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';

interface USGAHandicapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string | null;
  playerName: string;
  onApplyHandicap?: (handicap: number) => void;
  courseId?: string | null; // Current course for Course Handicap calculation
  teeColor?: string; // Player's selected tee
}

interface CourseData {
  courseRating: number;
  slopeRating: number;
  coursePar: number;
}

// calculateCourseHandicap now imported from @/lib/usgaHandicap

export const USGAHandicapDialog: React.FC<USGAHandicapDialogProps> = ({
  open,
  onOpenChange,
  profileId,
  playerName,
  onApplyHandicap,
  courseId = null,
  teeColor = 'white',
}) => {
  const {
    handicapIndex,
    differentials,
    roundsUsed,
    totalRounds,
    minimumRoundsNeeded,
    isLoading,
    error,
  } = useUSGAHandicap(profileId);

  const [courseData, setCourseData] = useState<CourseData | null>(null);
  const [loadingCourse, setLoadingCourse] = useState(false);

  // Fetch course data for the selected course and tee
  useEffect(() => {
    const fetchCourseData = async () => {
      if (!courseId || !open) {
        setCourseData(null);
        return;
      }

      setLoadingCourse(true);
      try {
        // Get tee-specific rating and slope
        const { data: teeData } = await supabase
          .from('course_tees')
          .select('course_rating, slope_rating')
          .eq('course_id', courseId)
          .eq('tee_color', teeColor)
          .maybeSingle();

        // Get course par from holes
        const { data: holes } = await supabase
          .from('course_holes')
          .select('par')
          .eq('course_id', courseId);

        const coursePar = holes?.reduce((sum, h) => sum + h.par, 0) || 72;
        const courseRating = teeData?.course_rating || 72;
        const slopeRating = teeData?.slope_rating || 113;

        setCourseData({ courseRating, slopeRating, coursePar });
      } catch (err) {
        console.error('Error fetching course data:', err);
        setCourseData(null);
      } finally {
        setLoadingCourse(false);
      }
    };

    fetchCourseData();
  }, [courseId, teeColor, open]);

  // Calculate course handicap if we have both index and course data
  const courseHandicap = handicapIndex !== null && courseData
    ? calculateCourseHandicap(
        handicapIndex,
        courseData.slopeRating,
        courseData.courseRating,
        courseData.coursePar
      )
    : null;

  const handleApply = () => {
    // Apply the Course Handicap (not the Index)
    const handicapToApply = courseHandicap ?? (handicapIndex !== null ? Math.round(handicapIndex) : null);
    if (handicapToApply !== null && onApplyHandicap) {
      onApplyHandicap(handicapToApply);
      onOpenChange(false);
    }
  };

  // Sort differentials by value to show which ones are used
  const sortedDifferentials = [...differentials].sort((a, b) => a.differential - b.differential);
  const usedDifferentialIds = new Set(
    sortedDifferentials.slice(0, roundsUsed).map(d => d.roundId)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Índice USGA - {playerName}
          </DialogTitle>
          <DialogDescription>
            El handicap de juego se ajusta según el campo y tee seleccionados
          </DialogDescription>
        </DialogHeader>

        {isLoading || loadingCourse ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-destructive">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">Error al cargar datos</p>
          </div>
        ) : totalRounds < minimumRoundsNeeded ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">
                Se necesitan mínimo {minimumRoundsNeeded} rondas completas
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Tienes {totalRounds} ronda{totalRounds !== 1 ? 's' : ''} confirmada{totalRounds !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Dual Display: Handicap Index + Course Handicap */}
            <div className="grid grid-cols-2 gap-3">
              {/* Handicap Index */}
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Índice USGA</p>
                <p className="text-2xl font-bold text-foreground">
                  {handicapIndex !== null ? handicapIndex.toFixed(1) : '-'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  (siempre igual)
                </p>
              </div>

              {/* Course Handicap */}
              <div className="bg-primary/10 rounded-xl p-3 text-center border-2 border-primary/30">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Target className="h-3 w-3 text-primary" />
                  <p className="text-xs text-primary font-medium">Handicap de Juego</p>
                </div>
                <p className="text-2xl font-bold text-primary">
                  {courseHandicap !== null ? courseHandicap : handicapIndex !== null ? Math.round(handicapIndex) : '-'}
                </p>
                {courseData && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    R:{courseData.courseRating} / S:{courseData.slopeRating}
                  </p>
                )}
              </div>
            </div>

            {/* Course Handicap Formula Explanation */}
            {courseData && handicapIndex !== null && (
              <div className="bg-muted/30 rounded-lg p-2 text-[10px] text-muted-foreground text-center">
                <span className="font-mono">
                  {handicapIndex.toFixed(1)} × ({courseData.slopeRating}/113) + ({courseData.courseRating} - {courseData.coursePar}) = {courseHandicap}
                </span>
              </div>
            )}

            {/* Stats */}
            <p className="text-xs text-muted-foreground text-center">
              Usando {roundsUsed} de {totalRounds} mejores diferenciales
            </p>

            {/* USGA Scale Reference */}
            <div className="bg-muted/50 rounded-lg p-3 text-xs">
              <p className="font-medium mb-1">Escala USGA:</p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>3-5 rondas → 1 diferencial</span>
                <span>6-8 rondas → 2 diferenciales</span>
                <span>9-11 rondas → 3 diferenciales</span>
                <span>12-14 rondas → 4 diferenciales</span>
                <span>15-16 rondas → 5 diferenciales</span>
                <span>20+ rondas → 8 diferenciales</span>
              </div>
            </div>

            {/* Rounds List */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Historial de Rondas</p>
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {differentials.map((round) => (
                  <RoundRow
                    key={round.roundId}
                    round={round}
                    isUsed={usedDifferentialIds.has(round.roundId)}
                  />
                ))}
              </div>
            </div>

            {/* Apply Button */}
            {onApplyHandicap && (courseHandicap !== null || handicapIndex !== null) && (
              <Button onClick={handleApply} className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Aplicar Handicap {courseHandicap ?? Math.round(handicapIndex!)}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const TEE_COLORS: Record<string, string> = {
  blue: 'bg-blue-600',
  white: 'bg-white border border-gray-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-600',
};

const RoundRow: React.FC<{ round: RoundDifferential; isUsed: boolean }> = ({
  round,
  isUsed,
}) => {
  const teeColorClass = TEE_COLORS[round.teeColor] || TEE_COLORS.white;
  
  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg text-xs',
        isUsed ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30'
      )}
    >
      {isUsed && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Flag className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium truncate">{round.courseName}</span>
          {/* Tee color indicator */}
          <span 
            className={cn('w-2.5 h-2.5 rounded-full shrink-0', teeColorClass)} 
            title={`Tee ${round.teeColor}`}
          />
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{format(parseLocalDate(round.date), 'dd MMM yyyy', { locale: es })}</span>
          <span className="text-[10px]">
            (R:{round.courseRating}/S:{round.slopeRating})
          </span>
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className="font-bold">{round.totalStrokes}</p>
        {round.adjustedGrossScore !== round.totalStrokes && (
          <p className="text-[10px] text-muted-foreground">Adj: {round.adjustedGrossScore}</p>
        )}
        <p className="text-muted-foreground">
          Dif: {round.differential > 0 ? '+' : ''}{round.differential.toFixed(1)}
        </p>
      </div>
    </div>
  );
};
