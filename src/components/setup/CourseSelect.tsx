import React from 'react';
import { MapPin } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { queretaroCourses } from '@/data/queretaroCourses';
import { GolfCourse } from '@/types/golf';

interface CourseSelectProps {
  selectedCourseId: string | null;
  onChange: (courseId: string) => void;
}

export const CourseSelect: React.FC<CourseSelectProps> = ({
  selectedCourseId,
  onChange,
}) => {
  const selectedCourse = queretaroCourses.find(c => c.id === selectedCourseId);

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Campo de Golf</Label>
      
      <Select value={selectedCourseId || ''} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecciona un campo" />
        </SelectTrigger>
        <SelectContent>
          {queretaroCourses.map((course) => (
            <SelectItem key={course.id} value={course.id}>
              <div className="flex items-center gap-2">
                <span>{course.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedCourse && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span>{selectedCourse.location}</span>
          <span className="mx-1">•</span>
          <span>Par {selectedCourse.holes.reduce((sum, h) => sum + h.par, 0)}</span>
        </div>
      )}
    </div>
  );
};
