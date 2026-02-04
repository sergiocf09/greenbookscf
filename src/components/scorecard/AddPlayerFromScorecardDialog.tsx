import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { initialsFromPlayerName, validatePlayerName } from '@/lib/playerInput';
import { AlertTriangle, Users } from 'lucide-react';
import { AddFromFriendsDialog } from '@/components/friends/AddFromFriendsDialog';



export interface AddGuestPayload {
  name: string;
  initials: string;
  color: string; // hex
  handicap: number; // Course handicap for this round
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId: string;
  onAddGuest: (payload: AddGuestPayload) => Promise<void>;
  onAddFromFriends?: (players: Array<{
    profileId: string;
    name: string;
    initials: string;
    color: string;
    handicap: number;
  }>) => void;
  existingPlayerIds?: string[];
  currentPlayerCount?: number;
  maxPlayersRecommended?: number;
}

export const AddPlayerFromScorecardDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  roundId,
  onAddGuest,
  onAddFromFriends,
  existingPlayerIds = [],
  currentPlayerCount = 0,
  maxPlayersRecommended = 6,
}) => {
  const [tab, setTab] = useState<'guest' | 'friends' | 'invite'>('guest');
  const [showFriendsDialog, setShowFriendsDialog] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [handicap, setHandicap] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  const shareLink = useMemo(() => `${window.location.origin}/join/${roundId}`, [roundId]);
  
  const isOverRecommendedLimit = currentPlayerCount >= maxPlayersRecommended;

  const canSave = useMemo(() => {
    try {
      validatePlayerName(name);
      return true;
    } catch {
      return false;
    }
  }, [name]);

  const handleSaveGuest = async () => {
    if (!canSave) {
      toast.error('Ingresa un nombre válido');
      return;
    }

    setSaving(true);
    try {
      const safeName = validatePlayerName(name);

      await onAddGuest({
        name: safeName,
        initials: initialsFromPlayerName(safeName),
        color,
        handicap: typeof handicap === 'number' ? handicap : 0,
      });

      toast.success('Jugador agregado. Usa ⚡ para capturar scores.');
      onOpenChange(false);
      setName('');
      setHandicap('');
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
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="guest">Invitado</TabsTrigger>
            <TabsTrigger value="friends">
              <Users className="h-3.5 w-3.5 mr-1" />
              Amigos
            </TabsTrigger>
            <TabsTrigger value="invite">Link</TabsTrigger>
          </TabsList>

          <TabsContent value="guest" className="mt-4 space-y-4">
            {isOverRecommendedLimit && (
              <Alert variant="default" className="bg-amber-500/10 border-amber-500/50">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-amber-700 dark:text-amber-400 text-sm">
                  Ya tienes {currentPlayerCount} jugadores (máximo recomendado: {maxPlayersRecommended}). 
                  Puedes continuar, pero algunas apuestas pueden no estar optimizadas para más jugadores.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
              <div>
                <label className="text-xs text-muted-foreground">Nombre</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Toño" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Hándicap</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={54}
                  step={0.1}
                  value={handicap}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                    setHandicap(val);
                  }}
                  placeholder="0"
                  className="h-10 w-20"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Color</label>
                <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              El jugador se agregará a la ronda. Usa el ícono ⚡ en el scorecard para capturar sus scores.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSaveGuest} disabled={!canSave || saving}>
                {saving ? 'Guardando…' : 'Agregar y confirmar'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="friends" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Selecciona jugadores de tu lista de amigos para agregarlos a la ronda.
            </p>
            <Button 
              onClick={() => setShowFriendsDialog(true)} 
              className="w-full"
            >
              <Users className="h-4 w-4 mr-2" />
              Abrir Lista de Amigos
            </Button>
            <p className="text-xs text-muted-foreground">
              Los jugadores agregados competirán en los 18 hoyos. Podrás capturar sus scores parcialmente.
            </p>
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

        {/* Friends Dialog */}
        <AddFromFriendsDialog
          open={showFriendsDialog}
          onOpenChange={setShowFriendsDialog}
          onAddPlayers={(players) => {
            if (onAddFromFriends) {
              onAddFromFriends(players);
              setShowFriendsDialog(false);
              onOpenChange(false);
            }
          }}
          existingPlayerIds={existingPlayerIds}
          multiSelect={true}
        />
      </DialogContent>
    </Dialog>
  );
};
