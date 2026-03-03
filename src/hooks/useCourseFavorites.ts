import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { devError } from '@/lib/logger';

export const useCourseFavorites = () => {
  const { profile } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }

    const fetch = async () => {
      try {
        const { data, error } = await supabase
          .from('course_favorites')
          .select('course_id')
          .eq('profile_id', profile.id);

        if (error) throw error;
        setFavoriteIds(new Set((data || []).map((r: any) => r.course_id)));
      } catch (e) {
        devError('Error fetching course favorites:', e);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [profile]);

  const toggleFavorite = useCallback(async (courseId: string) => {
    if (!profile) return;

    const isFav = favoriteIds.has(courseId);

    // Optimistic update
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(courseId);
      else next.add(courseId);
      return next;
    });

    try {
      if (isFav) {
        await supabase
          .from('course_favorites')
          .delete()
          .eq('profile_id', profile.id)
          .eq('course_id', courseId);
      } else {
        await supabase
          .from('course_favorites')
          .insert({ profile_id: profile.id, course_id: courseId });
      }
    } catch (e) {
      // Revert
      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (isFav) next.add(courseId);
        else next.delete(courseId);
        return next;
      });
      devError('Error toggling favorite:', e);
    }
  }, [profile, favoriteIds]);

  return { favoriteIds, loading, toggleFavorite };
};
