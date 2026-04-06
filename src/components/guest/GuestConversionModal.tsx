import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus, LogOut, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getAuthRedirectOrigin } from '@/lib/authRedirect';

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
  const [emailSent, setEmailSent] = useState(false);

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
      const metadata = {
        display_name: displayName,
        guest_session_id: guestSessionId,
        guest_round_id: roundId,
      };

      const {
        data: { session },
      } = await supabase.auth.getSession();

      let authError: Error | null = null;

      if (session?.user?.is_anonymous) {
        // Upgrade the existing anonymous guest if the session is still alive.
        const { error } = await supabase.auth.updateUser({
          email: email.trim(),
          password,
          data: metadata,
        });
        authError = error as Error | null;
      } else {
        // If the guest reopened the link later and the anonymous session is gone,
        // create a regular account and keep the guest session metadata for conversion.
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: getAuthRedirectOrigin(),
            data: metadata,
          },
        });
        authError = error as Error | null;
      }

      if (authError) throw authError;

      // Mark conversion as pending in localStorage (survives browser close)
      localStorage.setItem(`pending_conversion_${roundId}`, JSON.stringify({
        sessionId: guestSessionId,
        ghostProfileId,
        email: email.trim(),
      }));

      // Clean up the guest session key (no longer needed for round access)
      localStorage.removeItem(`guest_session_${roundId}`);

      setEmailSent(true);
    } catch (err: any) {
      console.error('Error initiating guest conversion:', err);
      if (err?.message?.includes('already') || err?.message?.includes('duplicate')) {
        toast.error('Este email ya está registrado. Intenta con otro.');
      } else {
        toast.error(err?.message || 'Error al crear la cuenta');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    localStorage.removeItem(`guest_session_${roundId}`);
    onDismissed();
    onOpenChange(false);
  };

  if (emailSent) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="flex justify-center mb-2">
              <Mail className="h-12 w-12 text-primary" />
            </div>
            <DialogTitle className="text-center">Confirma tu correo</DialogTitle>
            <DialogDescription className="text-center">
              Hemos enviado un enlace de confirmación a:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="bg-muted rounded-lg p-3 text-center">
              <span className="font-medium text-sm">{email}</span>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Haz clic en el enlace del correo para activar tu cuenta.
              Una vez confirmado, podrás iniciar sesión y acceder a tu historial.
            </p>

            <p className="text-xs text-muted-foreground text-center">
              Si no ves el correo, revisa tu carpeta de spam.
            </p>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onConverted();
                onOpenChange(false);
              }}
            >
              Entendido
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
