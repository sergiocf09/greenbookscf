import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GuestConversionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId: string;
  guestSessionId: string;
  ghostProfileId: string;
  displayName: string;
  onConverted: () => void;
  onDismissed: () => void;
}

export const GuestConversionModal: React.FC<GuestConversionModalProps> = ({
  open,
  onOpenChange,
  roundId,
  guestSessionId,
  ghostProfileId,
  displayName,
  onConverted,
  onDismissed,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateAccount = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error('Ingresa email y contraseña');
      return;
    }
    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      // Upgrade anonymous session to permanent account
      // Supabase supports linking email/password to an anonymous user via updateUser
      const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        email: email.trim(),
        password,
        data: { display_name: displayName },
      });

      if (updateError) throw updateError;
      if (!updateData.user) throw new Error('No se pudo crear la cuenta');

      // Convert ghost profile to real profile
      const { error: convertError } = await supabase.rpc('convert_ghost_to_profile', {
        p_session_id: guestSessionId,
        p_auth_uid: updateData.user.id,
      });

      if (convertError) throw convertError;

      // Clean up localStorage
      localStorage.removeItem(`guest_session_${roundId}`);

      toast.success('¡Cuenta creada! Tu historial ha sido vinculado.');
      onConverted();
    } catch (err: any) {
      console.error('Error converting guest:', err);
      toast.error(err?.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    // Remove guest session from localStorage (loses future access)
    localStorage.removeItem(`guest_session_${roundId}`);
    onDismissed();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center">La ronda ha finalizado</DialogTitle>
          <DialogDescription className="text-center">
            ¿Quieres conservar tu historial y resultados?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="bg-muted rounded-lg p-3 text-center text-sm">
            <span className="font-medium">{displayName}</span>, tus scores y resultados
            están guardados. Crea una cuenta para acceder a ellos siempre.
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="guest-name">Nombre</Label>
              <Input id="guest-name" value={displayName} disabled className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-email">Email</Label>
              <Input
                id="guest-email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-password">Contraseña</Label>
              <Input
                id="guest-password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Button
              onClick={handleCreateAccount}
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Crear cuenta gratis
            </Button>

            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={handleDismiss}
              disabled={loading}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Salir sin guardar acceso
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Tus datos permanecerán visibles para los demás jugadores
            aunque no crees una cuenta.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
