import React, { useState } from 'react';
import { useFriendsLive } from '@/hooks/useFriendsLive';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Radio } from 'lucide-react';

const VsParLabel = ({ value }: { value: number }) => {
  if (value === 0) return (
    <span className="text-sm font-bold text-muted-foreground">E</span>
  );
  return (
    <span className={cn(
      'text-sm font-bold',
      value < 0 ? 'text-green-500' : 'text-red-500',
    )}>
      {value > 0 ? `+${value}` : value}
    </span>
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
        <span className="text-xs font-semibold text-primary-foreground leading-none">
          {liveRounds.length}
        </span>
        <span className="text-[10px] text-primary-foreground/80 leading-none">
          en vivo
        </span>
      </button>

      {/* Sheet de detalle */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[65vh] overflow-y-auto rounded-t-2xl"
        >
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-green-500" />
              Amigos jugando ahora
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-2 pb-6">
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
                  <p className="font-semibold text-sm truncate">
                    {r.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.courseName}
                  </p>
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
        </SheetContent>
      </Sheet>
    </>
  );
};
