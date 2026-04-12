import React, { useState } from 'react';
import { useFriendsLive } from '@/hooks/useFriendsLive';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { Radio } from 'lucide-react';

/** Capitaliza cada palabra: "ALEJANDRO SERRANO" → "Alejandro Serrano" */
const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const VsParLabel = ({ value }: { value: number }) => {
  if (value === 0) return (
    <span className="text-base font-bold text-muted-foreground">E</span>
  );
  return (
    <span className={cn(
      'text-base font-bold',
      value < 0 ? 'text-green-500' : 'text-red-500',
    )}>
      {value > 0 ? `+${value}` : value}
    </span>
  );
};

const HighlightsLine: React.FC<{ birdies: number[]; eagles: number[] }> = ({ birdies, eagles }) => {
  if (birdies.length === 0 && eagles.length === 0) return null;

  const parts: string[] = [];
  if (eagles.length > 0) {
    parts.push(`🦅 ${eagles.length === 1 ? `Hoyo ${eagles[0]}` : `Hoyos ${eagles.join(', ')}`}`);
  }
  if (birdies.length > 0) {
    parts.push(`🐦 ${birdies.length === 1 ? `Hoyo ${birdies[0]}` : `Hoyos ${birdies.join(', ')}`}`);
  }

  return (
    <p className="text-[11px] text-green-600 dark:text-green-400 mt-0.5 truncate">
      {parts.join('  •  ')}
    </p>
  );
};

export const FriendsLiveHeaderBadge: React.FC = () => {
  const { liveRounds, refresh } = useFriendsLive();
  const [open, setOpen] = useState(false);

  if (liveRounds.length === 0) return null;

  return (
    <>
      {/* Badge en el header */}
      <button
        type="button"
        onClick={() => { refresh(); setOpen(true); }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/25 transition-colors border border-white/20"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-80" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
        </span>
        <span className="text-[10px] text-primary-foreground/80 leading-none">
          Rondas en Vivo
        </span>
        <span className="text-xs font-semibold text-primary-foreground leading-none">
          {liveRounds.length}
        </span>
      </button>

      {/* Overlay + Panel que se despliega justo debajo del header */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <div
            className="fixed left-0 right-0 z-50 bg-background border-b border-border shadow-xl overflow-y-auto animate-in slide-in-from-top duration-200"
            style={{ top: 'var(--header-height, 72px)', maxHeight: 'calc(100dvh - var(--header-height, 72px))' }}
          >
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Radio className="h-4 w-4 text-green-500" />
                Amigos jugando ahora
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cerrar
              </button>
            </div>
            <div className="space-y-2 px-4 pb-4 pt-2">
              {liveRounds.map((r) => (
                <div
                  key={r.roundId}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/40"
                >
                  <PlayerAvatar
                    initials={r.initials}
                    background={r.avatarColor}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate text-foreground">
                      {titleCase(r.displayName)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.courseName}
                    </p>
                    <HighlightsLine birdies={r.birdieHoles} eagles={r.eagleHoles} />
                  </div>
                  <div className="text-right shrink-0">
                    <VsParLabel value={r.grossVsPar} />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {r.holesPlayed > 0
                        ? `Hoyo ${r.holesPlayed}`
                        : 'Iniciando'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
};
