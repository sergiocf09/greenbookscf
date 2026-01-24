import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { initialsFromPlayerName, validatePlayerName } from '@/lib/playerInput';

type HoleScores = Record<number, number | ''>;

export interface AddGuestPayload {
  name: string;
  initials: string;
  color: string; // hex
  strokesByHole: Record<number, number>; // 1..18
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId: string;
  onAddGuest: (payload: AddGuestPayload) => Promise<void>;
}

export const AddPlayerFromScorecardDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  roundId,
  onAddGuest,
}) => {
  const [tab, setTab] = useState<'guest' | 'invite'>('guest');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [saving, setSaving] = useState(false);

  const [scores, setScores] = useState<HoleScores>(() =>
    Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, ''])) as HoleScores
  );

  const shareLink = useMemo(() => `${window.location.origin}/join/${roundId}`, [roundId]);

  const canSave = useMemo(() => {
    const parsed = (() => {
      try {
        validatePlayerName(name);
        return true;
      } catch {
        return false;
      }
    })();

    if (!parsed) return false;
    for (let h = 1; h <= 18; h++) {
      const v = scores[h];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return false;
    }
    return true;
  }, [name, scores]);

  const setScore = (hole: number, value: string) => {
    const num = value === '' ? '' : Number(value);
    setScores((prev) => ({
      ...prev,
      [hole]: value === '' ? '' : Number.isFinite(num) ? num : prev[hole],
    }));
  };

  const handleSaveGuest = async () => {
    if (!canSave) {
      toast.error('Completa nombre y 18 hoyos');
      return;
    }

    setSaving(true);
    try {
      const strokesByHole: Record<number, number> = {};
      for (let h = 1; h <= 18; h++) strokesByHole[h] = scores[h] as number;

      const safeName = validatePlayerName(name);

      await onAddGuest({
        name: safeName,
        initials: initialsFromPlayerName(safeName),
        color,
        strokesByHole,
      });

      toast.success('Jugador agregado y scores confirmados');
      onOpenChange(false);
      setName('');
      setScores(Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, ''])) as HoleScores);
      setTab('guest');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'No se pudo agregar el jugador');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Agregar jugador y capturar scores</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="guest">Invitado</TabsTrigger>
            <TabsTrigger value="invite">Usuario (link)</TabsTrigger>
          </TabsList>

          <TabsContent value="guest" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="text-xs text-muted-foreground">Nombre</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Toño" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Color</label>
                <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />
              </div>
            </div>

            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-9 gap-2">
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
                    <div key={hole} className="space-y-1">
                      <div className="text-[10px] text-muted-foreground text-center">H{hole}</div>
                      <Input
                        inputMode="numeric"
                        type="number"
                        min={1}
                        value={scores[hole]}
                        onChange={(e) => setScore(hole, e.target.value)}
                        className={cn('h-8 text-center px-2', 'text-sm')}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Se guardan los 18 hoyos como <span className="font-medium">confirmados</span>.
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSaveGuest} disabled={!canSave || saving}>
                {saving ? 'Guardando…' : 'Agregar y confirmar'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="invite" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Para agregar un usuario registrado, compártele este link para que se una a la ronda.
            </p>
            <div className="flex gap-2">
              <Input value={shareLink} readOnly className="text-xs font-mono bg-muted/50" />
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareLink);
                  toast.success('Link copiado');
                }}
              >
                Copiar
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
