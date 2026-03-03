import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { devError } from '@/lib/logger';

export interface CourseSearchResult {
  apiId: number;
  clubName: string;
  courseName: string;
  location: string;
  city: string;
  state: string;
  country: string;
}

export const useCourseSearch = () => {
  const [results, setResults] = useState<CourseSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        setError('Debes iniciar sesión');
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/golf-course-proxy?action=search&q=${encodeURIComponent(query.trim())}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Search failed: ${res.status} ${body}`);
      }

      const json = await res.json();
      setResults(json.courses || []);
    } catch (e: any) {
      devError('Course search error:', e);
      setError(e?.message || 'Error en búsqueda');
    } finally {
      setSearching(false);
    }
  }, []);

  const importCourse = useCallback(async (apiId: number): Promise<string | null> => {
    setImporting(true);
    setError(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        setError('Debes iniciar sesión');
        return null;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/golf-course-proxy?action=import&id=${apiId}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Import failed: ${res.status} ${body}`);
      }

      const json = await res.json();
      return json.courseId || null;
    } catch (e: any) {
      devError('Course import error:', e);
      setError(e?.message || 'Error al importar campo');
      return null;
    } finally {
      setImporting(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, searching, importing, error, search, importCourse, clearResults };
};
