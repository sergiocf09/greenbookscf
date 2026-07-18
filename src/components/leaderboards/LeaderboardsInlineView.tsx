import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeaderboards } from '@/hooks/useLeaderboards';
import { useAuth } from '@/contexts/AuthContext';
import { CreateTeamsCupDialog } from '@/components/leaderboards/CreateTeamsCupDialog';
import { EditLeaderboardConfigDialog } from '@/components/leaderboards/EditLeaderboardConfigDialog';
import { EditMultiDayConfigDialog } from '@/components/leaderboards/EditMultiDayConfigDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Plus, Search, Loader2, Calendar, Hash, X, CalendarDays, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { MultiDayRulesJson } from '@/types/leaderboard';
import { toast } from 'sonner';
import { CreateLeagueDialog } from '@/components/leaderboards/CreateLeagueDialog';



interface LeaderboardsInlineViewProps {
  onNavigateToDetail: (leaderboardId: string, competitionType?: string | null) => void;
}

export const LeaderboardsInlineView: React.FC<LeaderboardsInlineViewProps> = ({
  onNavigateToDetail,
}) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { events, loading, createEvent, joinByCode, fetchEvents } = useLeaderboards();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCupDialog, setShowCupDialog] = useState(false);
  const [showLeagueDialog, setShowLeagueDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [createType, setCreateType] = useState<'standard' | 'multi_day' | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formModes, setFormModes] = useState<string[]>(['gross', 'net']);

  // Multi-day state
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [mdDays, setMdDays] = useState<Array<{ date: string; label: string }>>([
    { date: todayStr, label: '' },
    { date: todayStr, label: '' },
  ]);
  const [mdAggregation, setMdAggregation] = useState<'sum' | 'best_n'>('sum');
  const [mdBestN, setMdBestN] = useState<number>(2);

  const addDay = () => setMdDays(prev => [...prev, { date: prev[prev.length - 1]?.date || todayStr, label: '' }]);
  const removeDay = (idx: number) => setMdDays(prev => prev.filter((_, i) => i !== idx));
  const updateDay = (idx: number, field: 'date' | 'label', value: string) =>
    setMdDays(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));

  const resetForms = () => {
    setFormName('');
    setFormDescription('');
    setFormModes(['gross', 'net']);
    setMdDays([{ date: todayStr, label: '' }, { date: todayStr, label: '' }]);
    setMdAggregation('sum');
    setMdBestN(2);
  };


  const activeEvents = events.filter(e => e.status === 'active');
  const completedEvents = events.filter(e => e.status === 'completed');

  const toggleMode = (mode: string) => {
    setFormModes(prev =>
      prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
    );
  };

  const handleCreate = async () => {
    if (!formName.trim() || formModes.length === 0) return;
    setCreating(true);
    let result;
    if (createType === 'multi_day') {
      const validDays = mdDays.filter(d => d.date);
      if (validDays.length < 2) {
        toast.error('Agrega al menos 2 días con fecha');
        setCreating(false);
        return;
      }
      const sortedDays = [...validDays].sort((a, b) => a.date.localeCompare(b.date));
      const rules: MultiDayRulesJson = {
        days: sortedDays.map((d, idx) => ({
          day_number: idx + 1,
          date: d.date,
          label: d.label.trim() || undefined,
        })),
        aggregation: mdAggregation,
        best_n: mdAggregation === 'best_n' ? Math.min(mdBestN, sortedDays.length) : undefined,
      };
      result = await createEvent({
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        scoring_modes: formModes,
        start_date: sortedDays[0].date,
        end_date: sortedDays[sortedDays.length - 1].date,
        competition_type: 'multi_day',
        rules_json: rules as unknown as Record<string, any>,
      });
    } else {
      result = await createEvent({
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        scoring_modes: formModes,
        start_date: formDate,
        competition_type: 'standard',
      });
    }
    setCreating(false);
    if (result) {
      setShowCreateDialog(false);
      setCreateType(null);
      resetForms();
      onNavigateToDetail(result.id, createType === 'multi_day' ? 'multi_day' : 'standard');
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    const result = await joinByCode(joinCode.trim());
    if (result) {
      setShowJoinDialog(false);
      setJoinCode('');
      onNavigateToDetail(result.id, result.competition_type);
    }
  };

  const handleOpenEvent = (eventId: string, competitionType?: string | null) => {
    onNavigateToDetail(eventId, competitionType);
  };


  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex gap-2">
        <Dialog
          open={showCreateDialog}
          onOpenChange={(v) => {
            setShowCreateDialog(v);
            if (!v) setCreateType(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="flex-1 gap-2">
              <Plus className="h-4 w-4" /> Crear Leaderboard
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Nueva Competencia</DialogTitle>
            </DialogHeader>
            {createType === null && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  ¿Qué tipo de competencia quieres crear?
                </p>

                <button
                  type="button"
                  onClick={() => setCreateType('standard')}
                  className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <Trophy className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-medium text-foreground">Leaderboard</div>
                      <div className="text-sm text-muted-foreground">
                        Tabla de posiciones individual (Medal, Stableford)
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setCreateType(null);
                    setShowCupDialog(true);
                  }}
                  className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg leading-none">🏆</span>
                    <div>
                      <div className="font-medium text-foreground">Teams Cup</div>
                      <div className="text-sm text-muted-foreground">
                        Competencia por equipos estilo Ryder Cup
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCreateType('multi_day')}
                  className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-medium text-foreground">Multi-día</div>
                      <div className="text-sm text-muted-foreground">
                        Varios días con standings por día y acumulado
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            )}


            {createType === 'standard' && (
              <div className="space-y-4">
                <div>
                  <Label>Nombre *</Label>
                  <Input
                    placeholder="Ej: Torneo del Club"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Descripción</Label>
                  <Input
                    placeholder="Descripción breve (opcional)"
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Modalidades *</Label>
                  <div className="mt-1 flex flex-col gap-2">
                    {[
                      { key: 'gross', label: 'Medal Gross' },
                      { key: 'net', label: 'Medal Neto' },
                      { key: 'stableford', label: 'Stableford' },
                    ].map(mode => (
                      <label key={mode.key} className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={formModes.includes(mode.key)}
                          onCheckedChange={() => toggleMode(mode.key)}
                        />
                        <span className="text-sm">{mode.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Button variant="outline" onClick={() => setCreateType(null)} className="w-full">
                  ← Atrás
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!formName.trim() || formModes.length === 0 || creating}
                  className="w-full"
                >
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Crear
                </Button>
              </div>
            )}

            {createType === 'multi_day' && (
              <div className="space-y-4">
                <div>
                  <Label>Nombre *</Label>
                  <Input
                    placeholder="Ej: Copa de Verano"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Descripción</Label>
                  <Input
                    placeholder="Descripción breve (opcional)"
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-2 border-l-2 border-primary/30 pl-3">
                  <Label className="text-xs">Días del torneo *</Label>
                  {mdDays.map((day, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="text-xs w-12 shrink-0">Día {idx + 1}</span>
                      <Input
                        type="date"
                        value={day.date}
                        onChange={e => updateDay(idx, 'date', e.target.value)}
                        className="h-8 text-xs flex-1"
                      />
                      <Input
                        placeholder="Etiqueta"
                        value={day.label}
                        onChange={e => updateDay(idx, 'label', e.target.value)}
                        className="h-8 text-xs flex-1"
                      />
                      {mdDays.length > 2 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => removeDay(idx)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 w-full"
                    onClick={addDay}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Agregar día
                  </Button>

                  <div className="space-y-1 mt-3">
                    <Label className="text-xs">Agregación</Label>
                    <select
                      value={mdAggregation}
                      onChange={e => setMdAggregation(e.target.value as 'sum' | 'best_n')}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="sum">Suma total de todos los días</option>
                      <option value="best_n">Mejores N días</option>
                    </select>
                    {mdAggregation === 'best_n' && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Label className="text-xs">N =</Label>
                        <Input
                          type="number"
                          min={1}
                          max={mdDays.length}
                          value={mdBestN}
                          onChange={e => setMdBestN(parseInt(e.target.value) || 1)}
                          className="h-7 w-16 text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">
                          de {mdDays.length} días
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label>Modalidades *</Label>
                  <div className="mt-1 flex flex-col gap-2">
                    {[
                      { key: 'gross', label: 'Medal Gross' },
                      { key: 'net', label: 'Medal Neto' },
                      { key: 'stableford', label: 'Stableford' },
                    ].map(mode => (
                      <label key={mode.key} className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={formModes.includes(mode.key)}
                          onCheckedChange={() => toggleMode(mode.key)}
                        />
                        <span className="text-sm">{mode.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Button variant="outline" onClick={() => setCreateType(null)} className="w-full">
                  ← Atrás
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!formName.trim() || formModes.length === 0 || mdDays.length < 2 || creating}
                  className="w-full"
                >
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Crear Multi-día
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>


        <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" className="flex-1 gap-2">
              <Search className="h-4 w-4" /> Unirse por Código
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Unirse a Leaderboard</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Código del leaderboard</Label>
                <Input
                  placeholder="Ej: a1b2c3"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                />
              </div>
              <Button onClick={handleJoin} disabled={!joinCode.trim()} className="w-full">
                Buscar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs: Active / History */}
      <Tabs defaultValue="active">
        <TabsList className="w-full">
          <TabsTrigger value="active" className="flex-1">Activos</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-3 mt-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No hay leaderboards activos</p>
              <p className="text-sm mt-1">Crea uno o únete con un código</p>
            </div>
          ) : (
            activeEvents.map(ev => (
              <Card
                key={ev.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => handleOpenEvent(ev.id, (ev as any).competition_type)}
              >
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{ev.name}</CardTitle>
                        {(ev as any).competition_type === 'teams_cup' && (
                          <Badge variant="secondary" className="border border-primary/20 bg-primary/10 text-primary">
                            TEAMS CUP
                          </Badge>
                        )}
                      </div>
                      {ev.description && (
                        <CardDescription className="text-xs mt-0.5">{ev.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {ev.created_by === profile?.id && (ev as any).competition_type !== 'teams_cup' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Editar configuración"
                          onClick={(e) => { e.stopPropagation(); setEditTarget(ev); }}
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                      <Trophy className="h-5 w-5 text-amber-500" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(ev.start_date + 'T12:00:00'), 'd MMM yyyy', { locale: es })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      {ev.code}
                    </span>
                    <span>
                      {ev.scoring_modes.map(m =>
                        m === 'gross' ? 'Gross' : m === 'net' ? 'Neto' : 'Stb'
                      ).join(' · ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Creado por {ev.creator_name}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 mt-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : completedEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No hay leaderboards completados</p>
            </div>
          ) : (
            completedEvents.map(ev => (
              <Card
                key={ev.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors opacity-80"
                onClick={() => handleOpenEvent(ev.id, (ev as any).competition_type)}
              >
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{ev.name}</CardTitle>
                    {(ev as any).competition_type === 'teams_cup' && (
                      <Badge variant="secondary" className="border border-primary/20 bg-primary/10 text-primary">
                        TEAMS CUP
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{format(new Date(ev.start_date + 'T12:00:00'), 'd MMM yyyy', { locale: es })}</span>
                    <span>{ev.scoring_modes.map(m =>
                      m === 'gross' ? 'Gross' : m === 'net' ? 'Neto' : 'Stb'
                    ).join(' · ')}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <CreateTeamsCupDialog open={showCupDialog} onClose={() => setShowCupDialog(false)} />

      {editTarget && (editTarget.competition_type === 'multi_day' ? (
        <EditMultiDayConfigDialog
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          event={{
            id: editTarget.id,
            name: editTarget.name,
            description: editTarget.description,
            scoring_modes: editTarget.scoring_modes || ['gross', 'net'],
            rules_json: editTarget.rules_json || {},
          }}
          onSaved={() => { setEditTarget(null); fetchEvents(); }}
        />
      ) : (
        <EditLeaderboardConfigDialog
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          event={{
            id: editTarget.id,
            name: editTarget.name,
            description: editTarget.description,
            start_date: editTarget.start_date,
            scoring_modes: editTarget.scoring_modes || ['gross', 'net'],
          }}
          onSaved={() => { setEditTarget(null); fetchEvents(); }}
        />
      ))}
    </div>
  );
};
