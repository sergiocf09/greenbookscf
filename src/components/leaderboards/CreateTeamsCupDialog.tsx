import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { AddCupParticipantsDialog } from '@/components/leaderboards/AddCupParticipantsDialog';
import { CupDaysEditor } from '@/components/leaderboards/CupDaysEditor';
import type { CupDay } from '@/types/leaderboard';

const todayISO = () => new Date().toISOString().split('T')[0];

const defaultDays = (): CupDay[] => ([
  { day_number: 1, date: todayISO(), label: '', sessions: [{ session_number: 1, format: 'match_individual' }] },
]);

const TEAM_COLORS = [
  { hex: '#ef4444', label: 'Rojo' },
  { hex: '#3B82F6', label: 'Azul' },
  { hex: '#22c55e', label: 'Verde' },
  { hex: '#f97316', label: 'Naranja' },
  { hex: '#8b5cf6', label: 'Morado' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export const CreateTeamsCupDialog: React.FC<Props> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [creating, setCreating] = useState(false);
  const [createdEvent, setCreatedEvent] = useState<{ id: string; teams: Array<{ id: string; name: string; color: string }> } | null>(null);
  const [showAddPlayers, setShowAddPlayers] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState<CupDay[]>(defaultDays);

  // Step 2
  const [teamAName, setTeamAName] = useState('Equipo A');
  const [teamAColor, setTeamAColor] = useState('#3B82F6');
  const [teamBName, setTeamBName] = useState('Equipo B');
  const [teamBColor, setTeamBColor] = useState('#ef4444');

  const reset = () => {
    setStep(1);
    setName('');
    setDescription('');
    setDays(defaultDays());
    setTeamAName('Equipo A');
    setTeamAColor('#3B82F6');
    setTeamBName('Equipo B');
    setTeamBColor('#ef4444');
    setCreatedEvent(null);
    setShowAddPlayers(false);
  };

  const handleCreate = async () => {
    if (!profile) return;
    setCreating(true);
    try {
      const sortedDates = days.map(d => d.date).filter(Boolean).sort() as string[];
      const { data: ev, error: evErr } = await supabase
        .from('leaderboard_events')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          competition_type: 'teams_cup',
          cup_format: days[0]?.sessions[0]?.format ?? 'match_individual',
          type: 'tournament',
          scoring_modes: ['gross', 'net'],
          start_date: sortedDates[0] ?? todayISO(),
          end_date: sortedDates[sortedDates.length - 1] ?? null,
          rules_json: { cup_days: days } as any,
          created_by: profile.id,
        } as any)
        .select()
        .single();
      if (evErr) throw evErr;


      const { data: createdTeams, error: teamsErr } = await supabase.from('cup_teams').insert([
        { leaderboard_id: ev.id, name: teamAName.trim() || 'Equipo A', color: teamAColor },
        { leaderboard_id: ev.id, name: teamBName.trim() || 'Equipo B', color: teamBColor },
      ]).select();
      if (teamsErr) throw teamsErr;

      toast.success('Teams Cup creada');
      queryClient.invalidateQueries({ queryKey: ['leaderboard_events'] });
      setCreatedEvent({ id: ev.id, teams: (createdTeams as any[]) || [] });
      setStep(3);
    } catch (err: any) {
      toast.error('Error al crear: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const goToCup = () => {
    const id = createdEvent?.id;
    reset();
    onClose();
    if (id) navigate('/leaderboards/cup/' + id);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🏆 Nueva Teams Cup
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              Paso {step} de 3
            </span>
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Nombre de la competencia *</Label>
              <Input
                placeholder="Torneo Querétaro 2026"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input
                placeholder="Opcional"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <CupDaysEditor days={days} onChange={setDays} />
            <p className="text-[11px] text-muted-foreground -mt-2">
              Los puntos de cada día/sesión se acumulan en el marcador general.
            </p>

            <Button
              className="w-full"
              disabled={!name.trim()}
              onClick={() => setStep(2)}
            >
              Siguiente →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Team A */}
              <div className="space-y-2">
                <Label className="text-xs">Equipo A</Label>
                <Input
                  value={teamAName}
                  onChange={e => setTeamAName(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="flex gap-1.5">
                  {TEAM_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => setTeamAColor(c.hex)}
                      className="w-7 h-7 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c.hex,
                        borderColor: teamAColor === c.hex ? 'hsl(var(--foreground))' : 'transparent',
                        boxShadow: teamAColor === c.hex ? '0 0 0 2px hsl(var(--background)), 0 0 0 4px ' + c.hex : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Team B */}
              <div className="space-y-2">
                <Label className="text-xs">Equipo B</Label>
                <Input
                  value={teamBName}
                  onChange={e => setTeamBName(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="flex gap-1.5">
                  {TEAM_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => setTeamBColor(c.hex)}
                      className="w-7 h-7 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c.hex,
                        borderColor: teamBColor === c.hex ? 'hsl(var(--foreground))' : 'transparent',
                        boxShadow: teamBColor === c.hex ? '0 0 0 2px hsl(var(--background)), 0 0 0 4px ' + c.hex : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                ← Anterior
              </Button>
              <Button
                className="flex-1"
                disabled={creating}
                onClick={handleCreate}
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Crear Competencia ✓
              </Button>
            </div>
          </div>
        )}

        {step === 3 && createdEvent && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">¡Competencia creada!</p>
              <p className="text-xs text-muted-foreground">
                ¿Quieres agregar jugadores ahora? También puedes hacerlo después desde el detalle.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button className="w-full gap-1" onClick={() => setShowAddPlayers(true)}>
                <UserPlus className="h-4 w-4" /> Agregar Jugadores Ahora
              </Button>
              <Button variant="outline" className="w-full" onClick={goToCup}>
                Más tarde
              </Button>
            </div>

            <AddCupParticipantsDialog
              open={showAddPlayers}
              onClose={() => { setShowAddPlayers(false); goToCup(); }}
              leaderboardId={createdEvent.id}
              teams={createdEvent.teams as any}
              existingProfileIds={new Set()}
              existingGuestNames={new Set()}
              onAdded={() => { /* navegación ocurre al cerrar */ }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
