import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuditLogEntry } from '@/hooks/useRoundAuditLog';

interface RoundAuditSheetProps {
  open: boolean;
  onClose: () => void;
  entries: AuditLogEntry[];
  isLoading: boolean;
  onRefresh: () => void;
}

const EVENT_LABELS: Record<string, string> = {
  score_captured: 'Captura de score',
  score_modified: 'Score modificado',
  hole_confirmed: 'Hoyo confirmado',
  bet_config_changed: 'Apuesta modificada',
  handicap_changed: 'Hándicap modificado',
  player_added: 'Jugador agregado',
  player_removed: 'Jugador eliminado',
  round_created: 'Ronda creada',
  round_closed: 'Ronda cerrada',
};

const EVENT_COLOR: Record<string, string> = {
  score_captured: 'text-blue-500',
  score_modified: 'text-amber-500',
  hole_confirmed: 'text-green-500',
  bet_config_changed: 'text-purple-500',
  handicap_changed: 'text-orange-500',
  player_added: 'text-emerald-500',
  player_removed: 'text-red-500',
  round_created: 'text-primary',
  round_closed: 'text-primary',
};

const FILTER_GROUPS: { key: string; label: string; types?: string[] }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'scores', label: 'Scores', types: ['score_captured', 'score_modified', 'hole_confirmed'] },
  { key: 'bets', label: 'Apuestas', types: ['bet_config_changed'] },
  { key: 'handicap', label: 'Hándicap', types: ['handicap_changed'] },
  { key: 'round', label: 'Ronda', types: ['player_added', 'player_removed', 'round_created', 'round_closed'] },
];

function formatPayload(entry: AuditLogEntry): string {
  const p = entry.payload;
  switch (entry.eventType) {
    case 'score_captured':
      return `Hoyo ${p.hole_number} · ${entry.targetName ?? '?'}: ${p.strokes} golpes${p.putts != null ? `, ${p.putts} putts` : ''}`;
    case 'score_modified':
      return `Hoyo ${p.hole_number} · ${entry.targetName ?? '?'}: ${p.prev_strokes}→${p.new_strokes}${p.prev_putts != null ? ` (putts: ${p.prev_putts}→${p.new_putts})` : ''}`;
    case 'hole_confirmed':
      return `Hoyo ${p.hole_number} confirmado`;
    case 'bet_config_changed':
      return p.description ?? 'Configuración de apuestas actualizada';
    case 'handicap_changed':
      return `${entry.targetName ?? '?'}: HCP ${p.prev_handicap}→${p.new_handicap}`;
    case 'player_added':
      return `${entry.targetName ?? p.player_name ?? '?'} agregado`;
    case 'player_removed':
      return `${entry.targetName ?? p.player_name ?? '?'} eliminado`;
    case 'round_created':
      return 'Ronda iniciada';
    case 'round_closed':
      return 'Ronda cerrada';
    default:
      return JSON.stringify(p);
  }
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export const RoundAuditSheet: React.FC<RoundAuditSheetProps> = ({
  open, onClose, entries, isLoading, onRefresh,
}) => {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all'
    ? entries
    : entries.filter(e => {
        const group = FILTER_GROUPS.find(g => g.key === filter);
        return group?.types?.includes(e.eventType);
      });

  const firstCaptures = filtered.filter(e =>
    e.eventType === 'score_captured' ||
    e.eventType === 'hole_confirmed' ||
    e.eventType === 'round_created' ||
    e.eventType === 'player_added'
  );
  const modifications = filtered.filter(e =>
    e.eventType === 'score_modified' ||
    e.eventType === 'handicap_changed' ||
    e.eventType === 'bet_config_changed' ||
    e.eventType === 'player_removed' ||
    e.eventType === 'round_closed'
  );

  const renderEntries = (list: AuditLogEntry[]) =>
    list.map(entry => (
      <div key={entry.id} className="flex gap-2 py-2 border-b border-border/40 last:border-0">
        <div className="text-[10px] text-muted-foreground tabular-nums w-10 shrink-0 pt-0.5">
          {formatTime(entry.createdAt)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-foreground truncate">{entry.actorName}</span>
            <span className={cn('text-[10px] font-medium', EVENT_COLOR[entry.eventType] ?? 'text-muted-foreground')}>
              · {EVENT_LABELS[entry.eventType] ?? entry.eventType}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 break-words">
            {formatPayload(entry)}
          </div>
        </div>
      </div>
    ));

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="h-[80vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
          <div className="flex items-center pr-20">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4" />
              Bitácora de Ronda
            </SheetTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-12 top-3 h-8 w-8 shrink-0"
            onClick={() => onRefresh()}
            aria-label="Actualizar bitácora"
            title="Actualizar bitácora"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>

          <div className="flex gap-1.5 overflow-x-auto pt-2 -mx-1 px-1">
            {FILTER_GROUPS.map(g => (
              <button
                key={g.key}
                onClick={() => setFilter(g.key)}
                className={cn(
                  'px-2.5 py-1 text-[10px] rounded-full border whitespace-nowrap transition-colors',
                  filter === g.key
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : 'bg-muted text-muted-foreground border-border'
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">Sin eventos registrados</div>
          ) : (
            <div>
              {firstCaptures.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider pt-2 pb-1">
                    Primera Captura
                  </div>
                  {renderEntries(firstCaptures)}
                </div>
              )}
              {modifications.length > 0 && (
                <div className={firstCaptures.length > 0 ? 'mt-3' : ''}>
                  <div className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider pt-2 pb-1">
                    ✏️ Modificaciones
                  </div>
                  {renderEntries(modifications)}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
