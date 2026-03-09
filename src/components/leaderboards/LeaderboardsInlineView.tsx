import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeaderboards } from '@/hooks/useLeaderboards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Plus, Search, Loader2, Calendar, Hash } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface LeaderboardsInlineViewProps {
  onNavigateToDetail: (leaderboardId: string) => void;
}

export const LeaderboardsInlineView: React.FC<LeaderboardsInlineViewProps> = ({
  onNavigateToDetail,
}) => {
  const navigate = useNavigate();
  const { events, loading, createEvent, joinByCode } = useLeaderboards();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formModes, setFormModes] = useState<string[]>(['gross', 'net']);

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
    const result = await createEvent({
      name: formName.trim(),
      description: formDescription.trim() || undefined,
      scoring_modes: formModes,
      start_date: formDate,
    });
    setCreating(false);
    if (result) {
      setShowCreateDialog(false);
      setFormName('');
      setFormDescription('');
      setFormModes(['gross', 'net']);
      onNavigateToDetail(result.id);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    const eventId = await joinByCode(joinCode.trim());
    if (eventId) {
      setShowJoinDialog(false);
      setJoinCode('');
      onNavigateToDetail(eventId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex gap-2">
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="flex-1 gap-2">
              <Plus className="h-4 w-4" /> Crear Leaderboard
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Nuevo Leaderboard</DialogTitle>
            </DialogHeader>
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
                <div className="flex flex-col gap-2 mt-1">
                  {[
                    { key: 'gross', label: 'Medal Gross' },
                    { key: 'net', label: 'Medal Neto' },
                    { key: 'stableford', label: 'Stableford' },
                  ].map(mode => (
                    <label key={mode.key} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formModes.includes(mode.key)}
                        onCheckedChange={() => toggleMode(mode.key)}
                      />
                      <span className="text-sm">{mode.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button
                onClick={handleCreate}
                disabled={!formName.trim() || formModes.length === 0 || creating}
                className="w-full"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Crear
              </Button>
            </div>
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
                onClick={() => onNavigateToDetail(ev.id)}
              >
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{ev.name}</CardTitle>
                      {ev.description && (
                        <CardDescription className="text-xs mt-0.5">{ev.description}</CardDescription>
                      )}
                    </div>
                    <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
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
                onClick={() => onNavigateToDetail(ev.id)}
              >
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base">{ev.name}</CardTitle>
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
    </div>
  );
};
