import React, { useState } from 'react';
import { MapPin, Loader2, Star, Plus, Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGolfCourses } from '@/hooks/useGolfCourses';
import { useCourseFavorites } from '@/hooks/useCourseFavorites';
import { AddManualCourseDialog } from '@/components/courses/AddManualCourseDialog';
import { CourseSearchDialog } from '@/components/courses/CourseSearchDialog';
import { cn } from '@/lib/utils';

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
  const { courses, loading, error, getCourseById, refresh } = useGolfCourses({ enabled });
  const { favoriteIds, toggleFavorite } = useCourseFavorites();
  const [showAll, setShowAll] = useState(false);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const selectedCourse = selectedCourseId ? getCourseById(selectedCourseId) : null;

  // Split courses into favorites and others
  const favoriteCourses = courses.filter(c => favoriteIds.has(c.id));
  const otherCourses = courses.filter(c => !favoriteIds.has(c.id));
  const displayCourses = showAll ? courses : (favoriteCourses.length > 0 ? favoriteCourses : courses);

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
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Campo de Golf</Label>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setShowSearch(true)}
          >
            <Search className="h-3 w-3" />
            Buscar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setShowAddCourse(true)}
          >
            <Plus className="h-3 w-3" />
            Manual
          </Button>
        </div>
      </div>
      
      <Select value={selectedCourseId || ''} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecciona un campo" />
        </SelectTrigger>
        <SelectContent>
          {displayCourses.map((course) => (
            <SelectItem key={course.id} value={course.id}>
              <div className="flex items-center gap-2">
                <span>{course.name}</span>
                {course.isManual && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                    *Manual
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
          {!showAll && otherCourses.length > 0 && (
            <div className="px-2 py-1.5">
              <button
                className="text-xs text-primary hover:underline w-full text-left"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAll(true);
                }}
              >
                Ver todos los campos ({otherCourses.length} más)
              </button>
            </div>
          )}
          {showAll && favoriteCourses.length > 0 && (
            <div className="px-2 py-1.5">
              <button
                className="text-xs text-primary hover:underline w-full text-left"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAll(false);
                }}
              >
                Solo mis campos visibles
              </button>
            </div>
          )}
        </SelectContent>
      </Select>

      {selectedCourse && (
        <>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>{selectedCourse.location}</span>
            <span className="mx-1">•</span>
            <span>Par {selectedCourse.holes.reduce((sum, h) => sum + h.par, 0)}</span>
            {selectedCourse.isManual && (
              <>
                <span className="mx-1">•</span>
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">*Manual</Badge>
              </>
            )}
            <button
              className="ml-auto p-0.5 hover:text-primary transition-colors"
              onClick={() => toggleFavorite(selectedCourse.id)}
              title={favoriteIds.has(selectedCourse.id) ? 'Quitar de visibles' : 'Agregar a mis visibles'}
            >
              <Star
                className={cn(
                  'h-3.5 w-3.5',
                  favoriteIds.has(selectedCourse.id) ? 'fill-primary text-primary' : ''
                )}
              />
            </button>
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
                  <ToggleGroupItem value="blue" className="w-8 h-8 rounded-full bg-blue-600 data-[state=on]:bg-blue-600 data-[state=on]:ring-2 ring-offset-2 ring-primary" />
                  <ToggleGroupItem value="white" className="w-8 h-8 rounded-full bg-white border data-[state=on]:bg-white data-[state=on]:ring-2 ring-offset-2 ring-primary" />
                  <ToggleGroupItem value="yellow" className="w-8 h-8 rounded-full bg-yellow-400 data-[state=on]:bg-yellow-400 data-[state=on]:ring-2 ring-offset-2 ring-primary" />
                  <ToggleGroupItem value="red" className="w-8 h-8 rounded-full bg-red-500 data-[state=on]:bg-red-500 data-[state=on]:ring-2 ring-offset-2 ring-primary" />
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

      <AddManualCourseDialog
        open={showAddCourse}
        onOpenChange={setShowAddCourse}
        onCreated={(courseId) => {
          refresh();
          setTimeout(() => onChange(courseId), 500);
        }}
      />

      <CourseSearchDialog
        open={showSearch}
        onOpenChange={setShowSearch}
        onImported={(courseId) => {
          refresh();
          setTimeout(() => onChange(courseId), 500);
        }}
      />
    </div>
  );
};
