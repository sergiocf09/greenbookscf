import React, { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, MapPin, Download } from 'lucide-react';
import { useCourseSearch, CourseSearchResult } from '@/hooks/useCourseSearch';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (courseId: string) => void;
}

export const CourseSearchDialog: React.FC<Props> = ({ open, onOpenChange, onImported }) => {
  const [query, setQuery] = useState('');
  const { results, searching, importing, error, search, importCourse, clearResults } = useCourseSearch();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => search(value), 400);
    } else {
      clearResults();
    }
  }, [search, clearResults]);

  const handleImport = useCallback(async (course: CourseSearchResult) => {
    const courseId = await importCourse(course.apiId);
    if (courseId) {
      toast.success(`${course.courseName || course.clubName} importado`);
      onImported?.(courseId);
      onOpenChange(false);
      setQuery('');
      clearResults();
    }
  }, [importCourse, onImported, onOpenChange, clearResults]);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setQuery('');
      clearResults();
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buscar Campo de Golf</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Nombre del campo o club..."
            className="pl-9"
            autoFocus
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {results.length > 0 && (
          <div className="space-y-1 mt-2">
            <p className="text-xs text-muted-foreground">{results.length} resultado{results.length !== 1 ? 's' : ''}</p>
            {results.map((course) => (
              <button
                key={course.apiId}
                className="w-full text-left p-3 rounded-lg border hover:bg-accent/50 transition-colors disabled:opacity-50"
                onClick={() => handleImport(course)}
                disabled={importing}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {course.courseName || course.clubName}
                    </p>
                    {course.clubName && course.courseName && course.clubName !== course.courseName && (
                      <p className="text-xs text-muted-foreground truncate">{course.clubName}</p>
                    )}
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {[course.city, course.state, course.country].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  </div>
                  <Download className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                </div>
              </button>
            ))}
          </div>
        )}

        {!searching && query.length >= 2 && results.length === 0 && !error && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No se encontraron campos. Prueba con otro nombre o usa "Agregar campo manual".
          </p>
        )}

        {query.length < 2 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Escribe al menos 2 caracteres para buscar en la base de datos global de campos.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
