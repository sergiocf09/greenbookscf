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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface CourseSelectProps {
  selectedCourseId: string | null;
  onChange: (courseId: string) => void;
  teeColor?: 'blue' | 'white' | 'yellow' | 'red';
  onTeeColorChange?: (color: 'blue' | 'white' | 'yellow' | 'red') => void;
}

export const CourseSelect: React.FC<CourseSelectProps> = ({
  selectedCourseId,
  onChange,
  teeColor = 'white',
  onTeeColorChange,
}) => {
  const selectedCourse = queretaroCourses.find(c => c.id === selectedCourseId);

  return (
    <div className="space-y-3">
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
        <>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>{selectedCourse.location}</span>
            <span className="mx-1">•</span>
            <span>Par {selectedCourse.holes.reduce((sum, h) => sum + h.par, 0)}</span>
          </div>

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
        </>
      )}
    </div>
  );
};
