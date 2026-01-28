import React from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useGolfCourses } from '@/hooks/useGolfCourses';

interface CourseSelectProps {
  selectedCourseId: string | null;
  onChange: (courseId: string) => void;
  teeColor?: 'blue' | 'white' | 'yellow' | 'red';
  onTeeColorChange?: (color: 'blue' | 'white' | 'yellow' | 'red') => void;
  startingHole?: 1 | 10;
  onStartingHoleChange?: (hole: 1 | 10) => void;
  enabled?: boolean;
}

export const CourseSelect: React.FC<CourseSelectProps> = ({
  selectedCourseId,
  onChange,
  teeColor = 'white',
  onTeeColorChange,
  startingHole = 1,
  onStartingHoleChange,
  enabled = true,
}) => {
  const { courses, loading, error, getCourseById } = useGolfCourses({ enabled });
  const selectedCourse = selectedCourseId ? getCourseById(selectedCourseId) : null;

  if (loading) {
    return (
      <div className="space-y-3">
        <Label className="text-sm font-medium">Campo de Golf</Label>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Cargando campos...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <Label className="text-sm font-medium">Campo de Golf</Label>
        <p className="text-sm text-destructive">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Campo de Golf</Label>
      
      <Select value={selectedCourseId || ''} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecciona un campo" />
        </SelectTrigger>
        <SelectContent>
          {courses.map((course) => (
            <SelectItem key={course.id} value={course.id}>
              <div className="flex items-center gap-2">
                <span>{course.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedCourse && (
        <>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>{selectedCourse.location}</span>
            <span className="mx-1">•</span>
            <span>Par {selectedCourse.holes.reduce((sum, h) => sum + h.par, 0)}</span>
          </div>

          <div className="flex gap-6">
            {onTeeColorChange && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tee de salida</Label>
                <ToggleGroup 
                  type="single" 
                  value={teeColor} 
                  onValueChange={(v) => v && onTeeColorChange(v as 'blue' | 'white' | 'yellow' | 'red')}
                  className="justify-start"
                >
                  <ToggleGroupItem value="blue" className="w-8 h-8 rounded-full bg-blue-600 data-[state=on]:ring-2 ring-offset-2" />
                  <ToggleGroupItem value="white" className="w-8 h-8 rounded-full bg-white border data-[state=on]:ring-2 ring-offset-2" />
                  <ToggleGroupItem value="yellow" className="w-8 h-8 rounded-full bg-yellow-400 data-[state=on]:ring-2 ring-offset-2" />
                  <ToggleGroupItem value="red" className="w-8 h-8 rounded-full bg-red-500 data-[state=on]:ring-2 ring-offset-2" />
                </ToggleGroup>
              </div>
            )}

            {onStartingHoleChange && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hoyo de inicio</Label>
                <ToggleGroup 
                  type="single" 
                  value={String(startingHole)} 
                  onValueChange={(v) => v && onStartingHoleChange(Number(v) as 1 | 10)}
                  className="justify-start"
                >
                  <ToggleGroupItem 
                    value="1" 
                    className="px-3 py-1.5 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    Hoyo 1
                  </ToggleGroupItem>
                  <ToggleGroupItem 
                    value="10" 
                    className="px-3 py-1.5 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    Hoyo 10
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
