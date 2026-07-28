import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, X, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { cupSlotKey, type CupDay, type CupSessionFormat } from '@/types/leaderboard';

interface Props {
  days: CupDay[];
  onChange: (days: CupDay[]) => void;
  /** Slot keys (`day-session`) that already have matches → cannot be deleted. */
  lockedSlots?: Set<string>;
}

const FORMAT_LABEL: Record<CupSessionFormat, string> = {
  match_individual: 'Individual',
  fourball: 'Fourball',
};

/**
 * Editor of days + sessions for a Ryder-style Teams Cup.
 * Number of days and sessions per day is unlimited; each session
 * carries its own play format.
 */
export const CupDaysEditor: React.FC<Props> = ({ days, onChange, lockedSlots }) => {
  const renumber = (list: CupDay[]): CupDay[] =>
    list.map((d, i) => ({
      ...d,
      day_number: i + 1,
      sessions: d.sessions.map((s, si) => ({ ...s, session_number: si + 1 })),
    }));

  const addDay = () => {
    const last = days[days.length - 1];
    onChange(renumber([...days, {
      day_number: days.length + 1,
      date: last?.date ?? null,
      label: '',
      sessions: [{ session_number: 1, format: last?.sessions[0]?.format ?? 'match_individual' }],
    }]));
  };

  const removeDay = (idx: number) => {
    const d = days[idx];
    const locked = d.sessions.some(s => lockedSlots?.has(cupSlotKey(d.day_number, s.session_number)));
    if (locked) {
      toast.error('No puedes eliminar este día: tiene matches creados.');
      return;
    }
    if (days.length <= 1) return;
    onChange(renumber(days.filter((_, i) => i !== idx)));
  };

  const updateDay = (idx: number, patch: Partial<CupDay>) =>
    onChange(renumber(days.map((d, i) => i === idx ? { ...d, ...patch } : d)));

  const addSession = (idx: number) => {
    const d = days[idx];
    const nextLabel = d.sessions.length === 1 ? 'Vespertina' : '';
    const first = d.sessions[0];
    if (d.sessions.length === 1 && !first.label) {
      // Name the existing one for clarity when a second session appears.
      first.label = 'Matutina';
    }
    updateDay(idx, {
      sessions: [...d.sessions, {
        session_number: d.sessions.length + 1,
        label: nextLabel,
        format: first?.format ?? 'match_individual',
      }],
    });
  };

  const removeSession = (dayIdx: number, sIdx: number) => {
    const d = days[dayIdx];
    if (d.sessions.length <= 1) return;
    const s = d.sessions[sIdx];
    if (lockedSlots?.has(cupSlotKey(d.day_number, s.session_number))) {
      toast.error('No puedes eliminar esta sesión: tiene matches creados.');
      return;
    }
    updateDay(dayIdx, { sessions: d.sessions.filter((_, i) => i !== sIdx) });
  };

  const updateSession = (dayIdx: number, sIdx: number, patch: Partial<CupDay['sessions'][number]>) => {
    const d = days[dayIdx];
    updateDay(dayIdx, { sessions: d.sessions.map((s, i) => i === sIdx ? { ...s, ...patch } : s) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" /> Días y sesiones
        </Label>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addDay}>
          <Plus className="h-3 w-3" /> Día
        </Button>
      </div>

      {days.map((day, idx) => (
        <div key={idx} className="rounded-lg border p-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold w-11 shrink-0">Día {idx + 1}</span>
            <Input
              type="date"
              value={day.date ?? ''}
              onChange={e => updateDay(idx, { date: e.target.value || null })}
              className="h-7 text-xs flex-1 min-w-0"
            />
            <Input
              placeholder="Etiqueta"
              value={day.label ?? ''}
              onChange={e => updateDay(idx, { label: e.target.value })}
              className="h-7 text-xs flex-1 min-w-0"
            />
            <Button
              variant="ghost" size="icon" className="h-6 w-6 shrink-0"
              onClick={() => removeDay(idx)}
              disabled={days.length <= 1}
              aria-label="Eliminar día"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="space-y-1.5 pl-2 border-l-2 border-primary/20">
            {day.sessions.map((s, si) => (
              <div key={si} className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground w-8 shrink-0">S{si + 1}</span>
                <Input
                  placeholder={day.sessions.length > 1 ? 'Matutina' : 'Sesión'}
                  value={s.label ?? ''}
                  onChange={e => updateSession(idx, si, { label: e.target.value })}
                  className="h-7 text-xs flex-1 min-w-0"
                />
                <Select
                  value={s.format}
                  onValueChange={v => updateSession(idx, si, { format: v as CupSessionFormat })}
                >
                  <SelectTrigger className="h-7 text-xs w-[7.5rem] shrink-0">
                    <SelectValue>{FORMAT_LABEL[s.format]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="match_individual">Individual</SelectItem>
                    <SelectItem value="fourball">Fourball</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                  onClick={() => removeSession(idx, si)}
                  disabled={day.sessions.length <= 1}
                  aria-label="Eliminar sesión"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost" size="sm" className="h-6 text-[11px] gap-1 text-muted-foreground"
              onClick={() => addSession(idx)}
            >
              <Plus className="h-3 w-3" /> Agregar sesión
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CupDaysEditor;
