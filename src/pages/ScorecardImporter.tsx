import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Upload, Image as ImageIcon, ArrowLeft, ArrowRight, Loader2, AlertTriangle,
  CheckCircle2, XCircle, Calendar as CalendarIcon, User, Users, UserPlus, Search,
  Plus, Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCourseSearch } from '@/hooks/useCourseSearch';
import { useGolfCourses } from '@/hooks/useGolfCourses';
import { useFriends } from '@/hooks/useFriends';
import {
  useScorecardImporter, TeeColorDbValue, PlayerMappingKind,
} from '@/hooks/useScorecardImporter';

const TEE_OPTIONS: { value: TeeColorDbValue; label: string; swatch: string }[] = [
  { value: 'white', label: 'Blanco', swatch: '#ffffff' },
  { value: 'blue', label: 'Azul', swatch: '#3b82f6' },
  { value: 'yellow', label: 'Amarillo', swatch: '#eab308' },
  { value: 'red', label: 'Rojo', swatch: '#ef4444' },
];


export default function ScorecardImporterPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const importer = useScorecardImporter();

  const {
    step, setStep,
    imageFile, imagePreviewUrl, analyzing, analyzeError, pickImage, analyze,
    parsed,
    editablePlayers, updateScoreCell, updatePuttCell, updatePlayerName, removePlayer,
    courseId, setCourseId, courseName, setCourseName,
    teeColor, setTeeColor, playerTeeColors, setPlayerTeeColor,
    roundDate, setRoundDate,
    mappings, setMapping, mappingsValid,
    progress, runSave, reset,
  } = importer;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Importar tarjeta manual</h1>
            <p className="text-xs text-muted-foreground">Paso {step} de 4</p>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-3">
          <Progress value={(step / 4) * 100} className="h-1" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {step === 1 && (
          <Step1Upload
            imagePreviewUrl={imagePreviewUrl}
            imageFile={imageFile}
            analyzing={analyzing}
            analyzeError={analyzeError}
            onPick={pickImage}
            onAnalyze={analyze}
          />
        )}

        {step === 2 && (
          <Step2Validate
            editablePlayers={editablePlayers}
            updateScoreCell={updateScoreCell}
            updatePuttCell={updatePuttCell}
            updatePlayerName={updatePlayerName}
            removePlayer={removePlayer}
            courseId={courseId}
            setCourseId={setCourseId}
            courseName={courseName}
            setCourseName={setCourseName}
            teeColor={teeColor}
            setTeeColor={setTeeColor}
            roundDate={roundDate}
            setRoundDate={setRoundDate}
            confidence={parsed?.confidence ?? 'low'}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <Step3Mapping
            editablePlayers={editablePlayers}
            mappings={mappings}
            setMapping={setMapping}
            mappingsValid={mappingsValid}
            profileDisplayName={profile?.display_name ?? 'Yo'}
            onBack={() => setStep(2)}
            onConfirm={runSave}
          />
        )}

        {step === 4 && (
          <Step4Saving
            progress={progress}
            onRetry={runSave}
            onGoHistory={() => {
              // Reset before leaving so importer is fresh next time
              const rid = progress.createdRoundId;
              reset();
              if (rid) {
                // Historial view is inside Index; deep link is the safest fallback.
                navigate('/');
              } else {
                navigate('/');
              }
            }}
            onStartOver={() => reset()}
          />
        )}
      </main>
    </div>
  );
}

// ────────────────────────────── STEP 1 ──────────────────────────────
function Step1Upload({
  imagePreviewUrl, imageFile, analyzing, analyzeError, onPick, onAnalyze,
}: {
  imagePreviewUrl: string | null;
  imageFile: File | null;
  analyzing: boolean;
  analyzeError: string | null;
  onPick: (f: File | null) => void;
  onAnalyze: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sube una foto de la tarjeta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!imagePreviewUrl ? (
          <label
            htmlFor="scorecard-file"
            className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-lg p-10 cursor-pointer hover:bg-accent/40 transition"
          >
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">Seleccionar foto del carrete</p>
              <p className="text-xs text-muted-foreground mt-1">
                Elige una imagen de tu galería (JPG o PNG)
              </p>
            </div>
            <input
              id="scorecard-file"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden border border-border bg-black/5 flex items-center justify-center">
              <img
                src={imagePreviewUrl}
                alt="Vista previa de la tarjeta"
                className="max-h-[420px] w-auto"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="scorecard-file-replace"
                className="text-xs text-muted-foreground underline cursor-pointer inline-flex items-center gap-1"
              >
                <ImageIcon className="h-3 w-3" />
                Cambiar foto
              </label>
              <input
                id="scorecard-file-replace"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
              <span className="text-xs text-muted-foreground truncate max-w-[50%]">
                {imageFile?.name}
              </span>
            </div>
          </div>
        )}

        {analyzeError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{analyzeError}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={onAnalyze}
          disabled={!imageFile || analyzing}
          className="w-full"
        >
          {analyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analizando tarjeta…
            </>
          ) : (
            <>Analizar tarjeta <ArrowRight className="h-4 w-4 ml-2" /></>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────── STEP 2 ──────────────────────────────
function Step2Validate(props: {
  editablePlayers: ReturnType<typeof useScorecardImporter>['editablePlayers'];
  updateScoreCell: (k: string, i: number, v: number | null) => void;
  updatePuttCell: (k: string, i: number, v: number | null) => void;
  updatePlayerName: (k: string, name: string) => void;
  removePlayer: (k: string) => void;
  courseId: string | null;
  setCourseId: (id: string | null) => void;
  courseName: string;
  setCourseName: (name: string) => void;
  teeColor: TeeColorDbValue;
  setTeeColor: (t: TeeColorDbValue) => void;
  roundDate: Date;
  setRoundDate: (d: Date) => void;
  confidence: 'high' | 'medium' | 'low';
  onBack: () => void;
  onContinue: () => void;
}) {
  const {
    editablePlayers, updateScoreCell, updatePuttCell, updatePlayerName, removePlayer,
    courseId, setCourseId, courseName, setCourseName,
    teeColor, setTeeColor, roundDate, setRoundDate,
    confidence, onBack, onContinue,
  } = props;

  const canContinue = !!courseId && editablePlayers.length > 0;

  return (
    <div className="space-y-4">
      {confidence === 'low' && (
        <Alert variant="default" className="bg-amber-500/10 border-amber-500/50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Revisa antes de continuar</AlertTitle>
          <AlertDescription>
            Algunos scores pueden ser incorrectos — la tarjeta no se detectó con alta confianza.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Datos de la ronda</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CoursePicker
            courseId={courseId}
            courseName={courseName}
            onPick={(id, name) => {
              setCourseId(id);
              setCourseName(name);
            }}
          />
          <div>
            <Label className="text-xs text-muted-foreground">Color de tee</Label>
            <Select value={teeColor} onValueChange={(v) => setTeeColor(v as TeeColorDbValue)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="white">Blanco</SelectItem>
                <SelectItem value="blue">Azul</SelectItem>
                <SelectItem value="yellow">Amarillo</SelectItem>
                <SelectItem value="red">Rojo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Fecha de la ronda</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('mt-1 w-full justify-start text-left font-normal')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(roundDate, "d 'de' MMMM, yyyy", { locale: es })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={roundDate}
                  onSelect={(d) => d && setRoundDate(d)}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scores detectados</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-2 py-2 sticky left-0 bg-card z-10">Hoyo</th>
                {editablePlayers.map((p) => (
                  <th key={p.key} className="px-2 py-2 min-w-[140px]">
                    <div className="flex items-center gap-1">
                      <Input
                        value={p.nameInCard}
                        onChange={(e) => updatePlayerName(p.key, e.target.value)}
                        className="h-8 text-xs"
                        placeholder="Nombre"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removePlayer(p.key)}
                        title="Quitar jugador"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 18 }).map((_, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="px-2 py-1.5 font-medium sticky left-0 bg-card z-10">
                    {i + 1}
                  </td>
                  {editablePlayers.map((p) => {
                    const s = p.scores[i];
                    const pu = p.putts?.[i] ?? null;
                    return (
                      <td key={p.key} className="px-1 py-1.5">
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={20}
                            value={s ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') {
                                updateScoreCell(p.key, i, null);
                              } else {
                                const n = parseInt(raw, 10);
                                if (Number.isFinite(n)) updateScoreCell(p.key, i, Math.max(1, Math.min(20, n)));
                              }
                            }}
                            placeholder="—"
                            className="h-8 text-xs px-1 text-center"
                          />
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={10}
                            value={pu ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') {
                                updatePuttCell(p.key, i, null);
                              } else {
                                const n = parseInt(raw, 10);
                                if (Number.isFinite(n)) updatePuttCell(p.key, i, Math.max(0, Math.min(10, n)));
                              }
                            }}
                            placeholder="putt"
                            className="h-8 text-xs px-1 text-center text-muted-foreground"
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Regresar
        </Button>
        <Button onClick={onContinue} disabled={!canContinue}>
          Continuar
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
      {!courseId && (
        <p className="text-xs text-muted-foreground text-right">
          Selecciona el campo para poder continuar.
        </p>
      )}
    </div>
  );
}

function CoursePicker({
  courseId, courseName, onPick,
}: {
  courseId: string | null;
  courseName: string;
  onPick: (id: string, name: string) => void;
}) {
  const { results, searching, search, importCourse, clearResults } = useCourseSearch();
  const [query, setQuery] = useState(courseName ?? '');
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (query.trim().length >= 2) search(query);
      else clearResults();
    }, 300);
    return () => clearTimeout(t);
  }, [query, open, search, clearResults]);

  return (
    <div>
      <Label className="text-xs text-muted-foreground">Campo de golf</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="mt-1 w-full justify-start text-left font-normal"
          >
            <Search className="mr-2 h-4 w-4 opacity-70" />
            <span className="truncate">
              {courseId ? (courseName || 'Campo seleccionado') : 'Buscar campo…'}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="p-2 border-b border-border">
            <Input
              autoFocus
              placeholder="Nombre del campo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {searching && (
              <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
              </div>
            )}
            {!searching && results.length === 0 && query.length >= 2 && (
              <div className="p-3 text-xs text-muted-foreground">Sin resultados</div>
            )}
            {results.map((r) => (
              <button
                key={r.apiId}
                type="button"
                disabled={importing}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b border-border/40 last:border-0 disabled:opacity-60"
                onClick={async () => {
                  setImporting(true);
                  try {
                    const newId = await importCourse(r.apiId);
                    if (newId) {
                      onPick(newId, `${r.clubName}${r.courseName ? ` — ${r.courseName}` : ''}`);
                      setOpen(false);
                    }
                  } finally {
                    setImporting(false);
                  }
                }}
              >
                <div className="font-medium">{r.clubName}</div>
                {r.courseName && (
                  <div className="text-xs text-muted-foreground">{r.courseName}</div>
                )}
                {(r.city || r.state) && (
                  <div className="text-[10px] text-muted-foreground">
                    {[r.city, r.state, r.country].filter(Boolean).join(', ')}
                  </div>
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {courseId && (
        <p className="text-[10px] text-muted-foreground mt-1 truncate">{courseName}</p>
      )}
    </div>
  );
}

// ────────────────────────────── STEP 3 ──────────────────────────────
function Step3Mapping(props: {
  editablePlayers: ReturnType<typeof useScorecardImporter>['editablePlayers'];
  mappings: ReturnType<typeof useScorecardImporter>['mappings'];
  setMapping: ReturnType<typeof useScorecardImporter>['setMapping'];
  mappingsValid: boolean;
  profileDisplayName: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { editablePlayers, mappings, setMapping, mappingsValid, profileDisplayName, onBack, onConfirm } = props;
  const selfAssignedKey = useMemo(() => {
    const entry = Object.entries(mappings).find(([, m]) => m.kind === 'self');
    return entry?.[0] ?? null;
  }, [mappings]);

  return (
    <div className="space-y-4">
      <Alert>
        <User className="h-4 w-4" />
        <AlertDescription>
          Asigna cada nombre detectado a un jugador. Exactamente uno debe ser
          <strong> "Soy yo"</strong> (serás el organizador de esta ronda).
        </AlertDescription>
      </Alert>

      {editablePlayers.map((p) => {
        const m = mappings[p.key];
        const kind: PlayerMappingKind = m?.kind ?? 'guest';
        const disableSelf = selfAssignedKey && selfAssignedKey !== p.key;

        return (
          <Card key={p.key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  En la tarjeta:
                </span>
                {p.nameInCard || <em className="text-muted-foreground">Sin nombre</em>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  variant={kind === 'self' ? 'default' : 'outline'}
                  onClick={() =>
                    setMapping(p.key, { kind: 'self' })
                  }
                  disabled={!!disableSelf}
                  size="sm"
                  className="justify-start"
                >
                  <User className="h-4 w-4 mr-2" />
                  Soy yo
                  {disableSelf && (
                    <span className="ml-auto text-[10px] opacity-70">ya asignado</span>
                  )}
                </Button>
                <Button
                  variant={kind === 'registered' ? 'default' : 'outline'}
                  onClick={() => setMapping(p.key, { kind: 'registered', profileId: null })}
                  size="sm"
                  className="justify-start"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Registrado
                </Button>
                <Button
                  variant={kind === 'guest' ? 'default' : 'outline'}
                  onClick={() => setMapping(p.key, { kind: 'guest' })}
                  size="sm"
                  className="justify-start"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invitado
                </Button>
              </div>

              {kind === 'self' && (
                <p className="text-xs text-muted-foreground">
                  Se asignará a tu perfil: <strong>{profileDisplayName}</strong>.
                </p>
              )}

              {kind === 'registered' && (
                <RegisteredPicker
                  onSelect={(profileId, displayName, handicap) =>
                    setMapping(p.key, {
                      kind: 'registered',
                      profileId,
                      displayName,
                      handicap,
                    })
                  }
                  currentProfileId={m?.profileId ?? null}
                  currentDisplayName={m?.displayName ?? ''}
                />
              )}

              {kind === 'guest' && (
                <p className="text-xs text-muted-foreground">
                  Se guardará como jugador invitado con el nombre &quot;{p.nameInCard}&quot;.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Regresar
        </Button>
        <Button onClick={onConfirm} disabled={!mappingsValid}>
          Confirmar y guardar
        </Button>
      </div>
      {!mappingsValid && (
        <p className="text-xs text-muted-foreground text-right">
          Cada jugador debe estar mapeado y uno debe ser "Soy yo".
        </p>
      )}
    </div>
  );
}

function RegisteredPicker({
  onSelect, currentProfileId, currentDisplayName,
}: {
  onSelect: (profileId: string, displayName: string, handicap: number) => void;
  currentProfileId: string | null;
  currentDisplayName: string;
}) {
  const { searchProfiles, searchResults, searching } = useFriends();
  const [query, setQuery] = useState(currentDisplayName ?? '');

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length >= 2) searchProfiles(query);
    }, 300);
    return () => clearTimeout(t);
  }, [query, searchProfiles]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar jugador registrado…"
          className="h-8 pl-7 text-sm"
        />
      </div>
      {currentProfileId && (
        <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Seleccionado: {currentDisplayName || 'jugador registrado'}
        </div>
      )}
      {searching && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
        </div>
      )}
      <div className="max-h-40 overflow-auto rounded-md border border-border/60 divide-y divide-border/40">
        {searchResults.map((r) => (
          <button
            key={r.id}
            type="button"
            className={cn(
              'w-full text-left px-2 py-1.5 text-xs hover:bg-accent',
              currentProfileId === r.id && 'bg-accent/60'
            )}
            onClick={() => onSelect(r.id, r.displayName, r.currentHandicap ?? 0)}
          >
            <div className="font-medium">{r.displayName}</div>
            <div className="text-[10px] text-muted-foreground">
              HCP {r.currentHandicap ?? 0}
            </div>
          </button>
        ))}
        {!searching && query.length >= 2 && searchResults.length === 0 && (
          <div className="p-2 text-xs text-muted-foreground">Sin resultados</div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────── STEP 4 ──────────────────────────────
function Step4Saving({
  progress, onRetry, onGoHistory, onStartOver,
}: {
  progress: ReturnType<typeof useScorecardImporter>['progress'];
  onRetry: () => void;
  onGoHistory: () => void;
  onStartOver: () => void;
}) {
  if (progress.stage === 'done') {
    return (
      <Card>
        <CardContent className="pt-8 pb-6 flex flex-col items-center gap-4 text-center">
          <div className="h-14 w-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">¡Ronda importada!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Se guardó como una ronda histórica ya cerrada. Puedes reabrirla
              desde el historial si quieres ajustar algo o configurar apuestas.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button onClick={onGoHistory} className="w-full sm:w-auto">
              Ver ronda
            </Button>
            <Button variant="outline" onClick={onStartOver} className="w-full sm:w-auto">
              Importar otra
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {progress.stage === 'error' ? (
            <>
              <XCircle className="h-5 w-5 text-destructive" />
              Error al guardar
            </>
          ) : (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Guardando ronda…
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={progress.percent} />
        <p className="text-sm text-muted-foreground">
          {progress.stage === 'error'
            ? (progress.error || 'Ocurrió un error inesperado')
            : progress.message}
        </p>

        {progress.stage === 'error' && (
          <div className="flex gap-2">
            <Button onClick={onRetry}>Reintentar</Button>
            <Button variant="outline" onClick={onStartOver}>
              Volver al inicio
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
