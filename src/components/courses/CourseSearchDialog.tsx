import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, MapPin, Download, Globe, CheckCircle2 } from 'lucide-react';
import { useCourseSearch, CourseSearchResult } from '@/hooks/useCourseSearch';
import { useCourseFavorites } from '@/hooks/useCourseFavorites';
import { toast } from 'sonner';

export interface LocalCourseOption {
  id: string;
  name: string;
  location: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (courseId: string) => void;
  /** Courses already available inside GreenBook (shown first, no external call). */
  localCourses?: LocalCourseOption[];
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const CourseSearchDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  onImported,
  localCourses = [],
}) => {
  const [query, setQuery] = useState('');
  const { results, searching, importing, error, search, importCourse, clearResults } = useCourseSearch();
  const { ensureFavorite } = useCourseFavorites();
  const [globalSearched, setGlobalSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const localMatches = useMemo(() => {
    const q = normalize(query);
    if (q.length < 2) return [];
    return localCourses
      .filter(c => normalize(`${c.name} ${c.location}`).includes(q))
      .slice(0, 12);
  }, [query, localCourses]);

  const localNameKeys = useMemo(
    () => new Set(localCourses.map(c => normalize(c.name))),
    [localCourses]
  );

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setGlobalSearched(false);
    clearResults();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, [clearResults]);

  const runGlobalSearch = useCallback(() => {
    if (query.trim().length < 2) return;
    setGlobalSearched(true);
    search(query);
  }, [query, search]);

  const finish = useCallback((courseId: string, message: string) => {
    toast.success(message);
    void ensureFavorite(courseId);
    onImported?.(courseId);
    onOpenChange(false);
    setQuery('');
    setGlobalSearched(false);
    clearResults();
  }, [ensureFavorite, onImported, onOpenChange, clearResults]);

  const handleSelectLocal = useCallback((course: LocalCourseOption) => {
    finish(course.id, `${course.name} ya estaba en GreenBook, lo agregamos a tus campos`);
  }, [finish]);

  const handleImport = useCallback(async (course: CourseSearchResult) => {
    const label = course.courseName || course.clubName;
    const imported = await importCourse(course.apiId);
    if (imported) {
      finish(
        imported.courseId,
        imported.cached
          ? `${label} ya estaba en GreenBook, lo agregamos a tus campos`
          : `${label} descargado y disponible para todos`
      );
    }
  }, [importCourse, finish]);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setQuery('');
      setGlobalSearched(false);
      clearResults();
    }
    onOpenChange(v);
  };

  const canSearchGlobal = query.trim().length >= 2;

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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && localMatches.length === 0) runGlobalSearch();
            }}
            placeholder="Nombre del campo o club..."
            className="pl-9"
            autoFocus
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Los campos que ya descargó cualquier usuario quedan guardados para toda la aplicación: no hay
          que volver a descargarlos.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Ya disponibles en GreenBook */}
        {localMatches.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Ya en GreenBook ({localMatches.length})
            </p>
            {localMatches.map((course) => (
              <button
                key={course.id}
                className="w-full text-left p-3 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
                onClick={() => handleSelectLocal(course)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-sm truncate">{course.name}</p>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
                        Ya en GreenBook
                      </Badge>
                    </div>
                    {course.location && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{course.location}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-medium text-primary shrink-0 mt-0.5">Usar</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Búsqueda en el catálogo mundial (consulta externa, solo a petición) */}
        {canSearchGlobal && !globalSearched && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={runGlobalSearch}
            disabled={searching}
          >
            <Globe className="h-3.5 w-3.5" />
            {localMatches.length > 0
              ? 'No es ninguno: buscar en el catálogo mundial'
              : 'Buscar en el catálogo mundial'}
          </Button>
        )}

        {globalSearched && results.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Catálogo mundial · {results.length} resultado{results.length !== 1 ? 's' : ''}
            </p>
            {results.map((course) => {
              const label = course.courseName || course.clubName;
              const alreadyLocal = localNameKeys.has(normalize(label));
              return (
                <button
                  key={course.apiId}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent/50 transition-colors disabled:opacity-50"
                  onClick={() => handleImport(course)}
                  disabled={importing}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm truncate">{label}</p>
                        {alreadyLocal && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
                            Ya en GreenBook
                          </Badge>
                        )}
                      </div>
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
                    {alreadyLocal ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                    ) : (
                      <Download className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {globalSearched && !searching && results.length === 0 && !error && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No se encontraron campos en el catálogo mundial. Prueba con otro nombre o usa "Manual".
          </p>
        )}

        {query.trim().length < 2 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Escribe al menos 2 caracteres para buscar primero entre los campos que ya están en GreenBook.
          </p>
        )}

        {canSearchGlobal && localMatches.length === 0 && !globalSearched && (
          <p className="text-xs text-muted-foreground text-center">
            Ningún campo de GreenBook coincide con "{query.trim()}".
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
