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
        
        // Fetch all courses
        const { data: coursesData, error: coursesError } = await supabase
          .from('golf_courses')
          .select('*')
          .order('name');
        
        if (coursesError) throw coursesError;
        
        // Fetch all holes
        const { data: holesData, error: holesError } = await supabase
          .from('course_holes')
          .select('*')
          .order('hole_number');
        
        if (holesError) throw holesError;
        
        // Map database records to GolfCourse type
        const mappedCourses: GolfCourse[] = (coursesData as CourseDB[]).map(course => {
          const courseHoles = (holesData as CourseHoleDB[])
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
