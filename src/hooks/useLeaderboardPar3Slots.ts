import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildPar3Slots, type Par3SlotHole, type Par3SlotRound } from '@/lib/prizeSlots';
import type { MultiDayDay, SpecialAward } from '@/types/leaderboard';

/**
 * Builds Oyes template slots from the par 3s of every round linked to a
 * leaderboard. Multi-day rounds map to a day by exact date (same as
 * MultiDayLeaderboardDetail's dayByDate).
 */
export function useLeaderboardPar3Slots(
  leaderboardId: string | null,
  isMultiDay: boolean,
  days?: MultiDayDay[] | null,
  enabled = true,
) {
  const dayKey = (days || []).map(d => `${d.day_number}:${d.date}`).join('|');
  const query = useQuery({
    queryKey: ['leaderboard_par3_slots', leaderboardId, isMultiDay, dayKey],
    enabled: !!leaderboardId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<{ slots: SpecialAward[]; hasLinkedRounds: boolean }> => {
      const { data: linked, error: linkedErr } = await supabase
        .from('leaderboard_rounds')
        .select('round_id')
        .eq('leaderboard_id', leaderboardId!);
      if (linkedErr) throw linkedErr;
      const roundIds = (linked || []).map(l => l.round_id);
      if (roundIds.length === 0) return { slots: [], hasLinkedRounds: false };

      const { data: rounds, error: roundsErr } = await supabase
        .from('rounds')
        .select('id, course_id, date')
        .in('id', roundIds);
      if (roundsErr) throw roundsErr;

      const courseIds = [...new Set((rounds || []).map(r => r.course_id))];
      const holesByCourse: Record<string, Par3SlotHole[]> = {};
      if (courseIds.length > 0) {
        const { data: holes, error: holesErr } = await supabase
          .from('course_holes')
          .select('course_id, hole_number, par, stroke_index')
          .in('course_id', courseIds);
        if (holesErr) throw holesErr;
        for (const h of holes || []) {
          (holesByCourse[h.course_id] ||= []).push({ hole_number: h.hole_number, par: h.par });
        }
      }

      const dayByDate: Record<string, number> = {};
      for (const d of days || []) dayByDate[d.date] = d.day_number;

      const slotRounds: Par3SlotRound[] = (rounds || []).map(r => ({
        roundId: r.id,
        date: r.date,
        courseId: r.course_id,
        dayNumber: isMultiDay ? (dayByDate[r.date] ?? null) : null,
      }));

      return {
        slots: buildPar3Slots({ rounds: slotRounds, holesByCourse, isMultiDay }),
        hasLinkedRounds: true,
      };
    },
  });

  return {
    slots: query.data?.slots ?? [],
    hasLinkedRounds: query.data?.hasLinkedRounds ?? false,
    loading: query.isLoading,
  };
}
