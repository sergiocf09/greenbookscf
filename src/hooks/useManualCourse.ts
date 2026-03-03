import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { devError } from '@/lib/logger';

export interface ManualHoleData {
  par: number | null;
  strokeIndex: number | null;
  yards: number | null;
}

export interface ManualCourseData {
  name: string;
  city: string;
  country: string;
  teeName: string;
  slope: number;
  rating: number;
  holes: ManualHoleData[];
  captureYards: boolean;
}

export const emptyManualCourse = (): ManualCourseData => ({
  name: '',
  city: '',
  country: 'México',
  teeName: 'white',
  slope: 113,
  rating: 72,
  holes: Array.from({ length: 18 }, () => ({ par: null, strokeIndex: null, yards: null })),
  captureYards: false,
});

export const useManualCourse = () => {
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);

  const saveCourse = useCallback(async (data: ManualCourseData): Promise<string | null> => {
    if (!profile) {
      toast.error('Debes iniciar sesión');
      return null;
    }

    // Validate all holes have par and strokeIndex
    for (let i = 0; i < 18; i++) {
      if (!data.holes[i].par || !data.holes[i].strokeIndex) {
        toast.error(`Hoyo ${i + 1} incompleto`);
        return null;
      }
    }

    // Validate unique stroke indices
    const indices = data.holes.map(h => h.strokeIndex!);
    if (new Set(indices).size !== 18) {
      toast.error('Los índices de hándicap deben ser únicos (1-18)');
      return null;
    }

    setSaving(true);
    try {
      // 1. Insert course
      const { data: courseRow, error: courseErr } = await supabase
        .from('golf_courses')
        .insert({
          name: data.name.trim(),
          location: `${data.city.trim()}, ${data.country.trim()}`,
          country: data.country.trim(),
          is_manual: true,
          created_by_profile_id: profile.id,
          course_rating: data.rating,
          slope_rating: data.slope,
        })
        .select('id')
        .single();

      if (courseErr || !courseRow) throw courseErr || new Error('No course created');

      const courseId = courseRow.id;

      // 2. Insert tee
      const teeColorMap: Record<string, string> = {
        blue: 'blue', white: 'white', yellow: 'yellow', red: 'red',
      };
      const teeColor = teeColorMap[data.teeName] || 'white';

      await supabase.from('course_tees').insert({
        course_id: courseId,
        tee_color: teeColor,
        course_rating: data.rating,
        slope_rating: data.slope,
      });

      // 3. Insert holes
      const holesPayload = data.holes.map((h, i) => {
        const yardCol = `yards_${teeColor}` as string;
        const base: any = {
          course_id: courseId,
          hole_number: i + 1,
          par: h.par!,
          stroke_index: h.strokeIndex!,
        };
        if (data.captureYards && h.yards) {
          base[yardCol] = h.yards;
        }
        return base;
      });

      const { error: holesErr } = await supabase.from('course_holes').insert(holesPayload);
      if (holesErr) throw holesErr;

      // 4. Insert visibility (owner)
      await supabase.from('course_visibility').insert({
        course_id: courseId,
        profile_id: profile.id,
        reason: 'owner',
      });

      // 5. Auto-add to favorites
      await supabase.from('course_favorites').insert({
        profile_id: profile.id,
        course_id: courseId,
      });

      toast.success('Campo manual creado');
      return courseId;
    } catch (e: any) {
      devError('Error saving manual course:', e);
      toast.error('Error al guardar el campo', { description: e?.message });
      return null;
    } finally {
      setSaving(false);
    }
  }, [profile]);

  return { saving, saveCourse };
};
