import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { GolfCourse, HoleInfo } from '@/types/golf';

interface CourseHoleDB {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  stroke_index: number;
  yards_blue: number | null;
  yards_white: number | null;
  yards_yellow: number | null;
  yards_red: number | null;
}

interface CourseDB {
  id: string;
  name: string;
  location: string;
  country: string;
  created_at: string;
}

export const useGolfCourses = () => {
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true);

        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const isAbortLike = (e: any) => {
          const msg = String(e?.message ?? e ?? '');
          return msg.includes('AbortError') || msg.includes('signal is aborted');
        };

        // Retry a few times because mobile networks / tab switches can transiently fail.
        let coursesData: CourseDB[] | null = null;
        let holesData: CourseHoleDB[] | null = null;
        let lastErr: any = null;

        for (let attempt = 0; attempt < 3; attempt++) {
          lastErr = null;
          const { data: cData, error: cErr } = await supabase.from('golf_courses').select('*').order('name');
          if (cErr) {
            lastErr = cErr;
            await sleep(250 * (attempt + 1));
            continue;
          }

          const { data: hData, error: hErr } = await supabase.from('course_holes').select('*').order('hole_number');
          if (hErr) {
            lastErr = hErr;
            await sleep(250 * (attempt + 1));
            continue;
          }

          coursesData = cData as CourseDB[];
          holesData = hData as CourseHoleDB[];
          break;
        }

        if (!coursesData || !holesData) {
          if (isAbortLike(lastErr)) return;
          throw lastErr ?? new Error('No se pudieron cargar los campos');
        }
        
        // Map database records to GolfCourse type
        const mappedCourses: GolfCourse[] = coursesData.map(course => {
          const courseHoles = holesData
            .filter(h => h.course_id === course.id)
            .sort((a, b) => a.hole_number - b.hole_number)
            .map(h => ({
              number: h.hole_number,
              par: h.par,
              handicapIndex: h.stroke_index,
              yardsBlue: h.yards_blue ?? undefined,
              yardsWhite: h.yards_white ?? undefined,
              yardsYellow: h.yards_yellow ?? undefined,
              yardsRed: h.yards_red ?? undefined,
            } as HoleInfo));
          
          return {
            id: course.id,
            name: course.name,
            location: course.location,
            holes: courseHoles,
          };
        });
        
        setCourses(mappedCourses);
      } catch (err) {
        // Ignore abort-like errors (navigation/reload) to avoid flashing error state.
        const msg = String((err as any)?.message ?? err ?? '');
        if (msg.includes('AbortError') || msg.includes('signal is aborted')) {
          return;
        }
        console.error('Error fetching courses:', err);
        setError(err instanceof Error ? err.message : 'Error loading courses');
      } finally {
        setLoading(false);
      }
    };
    
    fetchCourses();
  }, []);

  const getCourseById = (id: string): GolfCourse | undefined => {
    return courses.find(course => course.id === id);
  };

  return { courses, loading, error, getCourseById };
};
