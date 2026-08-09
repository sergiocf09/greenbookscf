import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PlayerStats {
  rounds_played: number;
  holes_played: number;
  courses_played: number;
  opponents_played: number;
  avg_gross_score: number | null;
  best_gross_score: number | null;
  worst_gross_score: number | null;
  avg_score_vs_par: number | null;
  eagles_count: number;
  birdies_count: number;
  pars_count: number;
  bogeys_count: number;
  doubles_count: number;
  worse_count: number;
  avg_putts_per_round: number | null;
  avg_putts_per_gir: number | null;
  pct_one_putt: number | null;
  pct_three_putt_plus: number | null;
  gir_pct: number | null;
  gir_pct_par3: number | null;
  gir_pct_par4: number | null;
  gir_pct_par5: number | null;
  scrambling_pct: number | null;
  avg_vs_par_par3: number | null;
  avg_vs_par_par4: number | null;
  avg_vs_par_par5: number | null;
}

export interface PlayerMilestone {
  eagles_total: number;
  birdies_total: number;
  rounds_sub_100: number;
  rounds_sub_90: number;
  rounds_sub_80: number;
  rounds_sub_70: number;
  best_round_score: number | null;
  best_round_course: string | null;
  best_round_date: string | null;
  holes_in_one: number;
  birdie_streak_best: number;
  rounds_no_bogey: number;
  organizer_rounds: number;
  unique_courses: number;
  unique_opponents: number;
  total_holes: number;
  handicap_delta: number | null;
}

export interface CourseSummary {
  course_id: string;
  course_name: string;
  rounds_played: number;
  avg_score: number | null;
  best_score: number | null;
  last_played: string | null;
}

export interface HoleAvg {
  hole_number: number;
  par: number;
  avg_strokes: number;
  avg_vs_par: number;
  rounds_count: number;
}

export interface RecentRound {
  round_date: string;
  course_name: string;
  total_strokes: number;
  total_putts: number;
  vs_par: number;
  holes_played: number;
}

export function usePlayerStats(courseId: string | null) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [milestones, setMilestones] = useState<PlayerMilestone | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [holeAvgs, setHoleAvgs] = useState<HoleAvg[]>([]);
  const [recentRounds, setRecentRounds] = useState<RecentRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, milestonesRes, coursesRes, recentRes] = await Promise.all([
          supabase.rpc('get_player_stats', { p_course_id: courseId ?? null } as any),
          supabase.rpc('get_player_milestones' as any, { p_course_id: courseId ?? null } as any),
          supabase.rpc('get_player_courses_summary' as any),
          supabase.rpc('get_player_recent_rounds' as any, { p_course_id: courseId ?? null } as any),

        ]);
        if (cancelled) return;
        if (statsRes.error) throw statsRes.error;
        if (milestonesRes.error) throw milestonesRes.error;
        if (coursesRes.error) throw coursesRes.error;
        if (recentRes.error) throw recentRes.error;

        const statsData = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;
        const milestonesData = Array.isArray(milestonesRes.data) ? milestonesRes.data[0] : milestonesRes.data;

        setStats(statsData ?? null);
        setMilestones(milestonesData ?? null);
        setCourses((coursesRes.data as any[]) ?? []);
        setRecentRounds((recentRes.data as any[]) ?? []);

        if (courseId) {
          const holeRes = await supabase.rpc('get_player_score_by_hole' as any, { p_course_id: courseId });
          if (!cancelled) {
            if (holeRes.error) throw holeRes.error;
            setHoleAvgs((holeRes.data as any[]) ?? []);
          }
        } else {
          setHoleAvgs([]);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Error al cargar estadísticas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [courseId]);

  return { stats, milestones, courses, holeAvgs, recentRounds, loading, error };
}
