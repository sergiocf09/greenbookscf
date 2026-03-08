import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Pencil, Mail, Lock, ChevronRight, MapPin, TrendingDown } from 'lucide-react';
import { validatePlayerName, initialsFromPlayerName } from '@/lib/playerInput';
import { AddManualCourseDialog } from '@/components/courses/AddManualCourseDialog';
import { HandicapHistoryView } from '@/components/profile/HandicapHistoryView';

type EditSection = 'menu' | 'name' | 'email' | 'password' | 'handicap';

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileDialog: React.FC<ProfileDialogProps> = ({ open, onOpenChange }) => {
  const { profile, user, updateProfile } = useAuth();

  const [section, setSection] = useState<EditSection>('menu');
  const [saving, setSaving] = useState(false);
  const [showManualCourse, setShowManualCourse] = useState(false);

  // Name
  const [newName, setNewName] = useState('');

  // Email
  const [newEmail, setNewEmail] = useState('');

  // Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Handicap
  const [manualHandicap, setManualHandicap] = useState('');

  // Re-auth password (for name/email changes)
  const [currentPassword, setCurrentPassword] = useState('');
  const [reAuthError, setReAuthError] = useState('');

  // Reset state when dialog opens/closes or section changes
  useEffect(() => {
    if (open) {
      setSection('menu');
    }
    setCurrentPassword('');
    setReAuthError('');
    setSaving(false);
    setNewPassword('');
    setConfirmPassword('');
  }, [open]);

  useEffect(() => {
    if (profile) {
      setNewName(profile.display_name);
      setManualHandicap(String(profile.current_handicap ?? ''));
    }
    if (user) {
      setNewEmail(user.email || '');
    }
  }, [profile, user, section]);

  const reAuthenticate = async (): Promise<boolean> => {
    if (!user?.email) return false;
    setReAuthError('');
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (error) {
      setReAuthError('Contraseña incorrecta');
      return false;
    }
    return true;
  };

  const handleSaveName = async () => {
    if (!profile) return;

    // Validate
    let sanitizedName: string;
    try {
      sanitizedName = validatePlayerName(newName);
    } catch (e: any) {
      toast.error(e.message || 'Nombre inválido');
      return;
    }
    if (sanitizedName.length < 2) {
      toast.error('El nombre debe tener al menos 2 caracteres');
      return;
    }

    setSaving(true);
    try {
      // Re-authenticate
      const ok = await reAuthenticate();
      if (!ok) {
        setSaving(false);
        return;
      }

      // Compute new initials
      const newInitials = initialsFromPlayerName(sanitizedName);

      // Update profiles table
      await updateProfile({
        display_name: sanitizedName,
        initials: newInitials,
      });

      // Also update auth metadata
      await supabase.auth.updateUser({
        data: { display_name: sanitizedName },
      });

      toast.success('Nombre actualizado');
      setSection('menu');
    } catch (e: any) {
      toast.error('No se pudo actualizar el nombre', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!user) return;

    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error('Correo electrónico inválido');
      return;
    }

    if (trimmedEmail === user.email) {
      toast.error('El correo es el mismo que el actual');
      return;
    }

    setSaving(true);
    try {
      // Re-authenticate
      const ok = await reAuthenticate();
      if (!ok) {
        setSaving(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        email: trimmedEmail,
      });

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('already been registered')) {
          toast.error('Este correo ya está registrado');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Te enviamos un correo para confirmar el cambio. Revisa tu bandeja de entrada.');
      setSection('menu');
    } catch (e: any) {
      toast.error('No se pudo actualizar el correo', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Contraseña actualizada');
      setNewPassword('');
      setConfirmPassword('');
      setSection('menu');
    } catch (e: any) {
      toast.error('No se pudo actualizar la contraseña', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHandicap = async () => {
    if (!profile) return;
    const parsed = Number(String(manualHandicap).replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      toast.error('Handicap inválido');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({ current_handicap: parsed });
      toast.success('Handicap actualizado');
      setSection('menu');
    } catch (e: any) {
      toast.error('No se pudo actualizar', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const renderMenu = () => (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {profile?.initials && (
          <PlayerAvatar
            initials={profile.initials}
            background={profile.avatar_color || '#3B82F6'}
            size="md"
          />
        )}
        <div>
          <p className="font-semibold leading-tight">{profile?.display_name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Cuenta</p>

        <button
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left"
          onClick={() => { setSection('name'); setCurrentPassword(''); setReAuthError(''); }}
        >
          <span className="flex items-center gap-2.5">
            <Pencil className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Cambiar nombre</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        <button
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left"
          onClick={() => { setSection('email'); setCurrentPassword(''); setReAuthError(''); }}
        >
          <span className="flex items-center gap-2.5">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Cambiar correo electrónico</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        <button
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left"
          onClick={() => setSection('password')}
        >
          <span className="flex items-center gap-2.5">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Cambiar contraseña</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="border-t border-border pt-4 space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Golf</p>

        <button
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left"
          onClick={() => setSection('handicap')}
        >
          <span className="flex items-center gap-2.5">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Historial de Handicap</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">
              {profile?.current_handicap != null ? Number(profile.current_handicap).toFixed(1) : '-'}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>

        <button
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left"
          onClick={() => setShowManualCourse(true)}
        >
          <span className="flex items-center gap-2.5">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Agregar Campo Manual</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <Label htmlFor="manual-handicap">Handicap (manual)</Label>
        <div className="flex gap-2">
          <Input
            id="manual-handicap"
            inputMode="decimal"
            value={manualHandicap}
            onChange={(e) => setManualHandicap(e.target.value)}
            placeholder="Ej. 12.4"
          />
          <Button
            type="button"
            disabled={!profile || saving}
            onClick={handleSaveHandicap}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">Sobreescribe el índice calculado por USGA.</p>
      </div>
    </div>
  );

  const renderBackButton = () => (
    <Button variant="ghost" size="sm" onClick={() => setSection('menu')} className="mb-2 -ml-2">
      ← Volver
    </Button>
  );

  const renderReAuthField = () => (
    <div className="space-y-1.5">
      <Label htmlFor="current-password">Contraseña actual</Label>
      <Input
        id="current-password"
        type="password"
        value={currentPassword}
        onChange={(e) => { setCurrentPassword(e.target.value); setReAuthError(''); }}
        placeholder="Ingresa tu contraseña actual"
        autoComplete="current-password"
      />
      {reAuthError && (
        <p className="text-sm text-destructive">{reAuthError}</p>
      )}
    </div>
  );

  const renderNameSection = () => (
    <div className="space-y-4">
      {renderBackButton()}
      <div className="space-y-1.5">
        <Label htmlFor="edit-name">Nombre</Label>
        <Input
          id="edit-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Tu nombre completo"
          maxLength={100}
        />
        <p className="text-xs text-muted-foreground">El nombre se mostrará en scorecards, dashboards e historial.</p>
      </div>
      {renderReAuthField()}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={() => setSection('menu')} disabled={saving}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={!newName.trim() || newName.trim().length < 2 || !currentPassword || saving}
          onClick={handleSaveName}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
        </Button>
      </div>
    </div>
  );

  const renderEmailSection = () => (
    <div className="space-y-4">
      {renderBackButton()}
      <div className="space-y-1.5">
        <Label htmlFor="edit-email">Nuevo correo electrónico</Label>
        <Input
          id="edit-email"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="nuevo@correo.com"
          maxLength={255}
        />
        <p className="text-xs text-muted-foreground">Recibirás un correo de confirmación en la nueva dirección.</p>
      </div>
      {renderReAuthField()}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={() => setSection('menu')} disabled={saving}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={!newEmail.trim() || !currentPassword || saving}
          onClick={handleSaveEmail}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
        </Button>
      </div>
    </div>
  );

  const renderPasswordSection = () => (
    <div className="space-y-4">
      {renderBackButton()}
      <div className="space-y-1.5">
        <Label htmlFor="new-password">Nueva contraseña</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Nueva contraseña"
          minLength={6}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirmar contraseña</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirmar contraseña"
          minLength={6}
        />
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={() => setSection('menu')} disabled={saving}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={!newPassword || newPassword.length < 6 || saving}
          onClick={handleSavePassword}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Actualizar contraseña'}
        </Button>
      </div>
    </div>
  );

  const renderHandicapSection = () => (
    <div className="space-y-2">
      {renderBackButton()}
      <HandicapHistoryView profileId={profile?.id ?? null} />
    </div>
  );

  const sectionTitles: Record<EditSection, string> = {
    menu: 'Perfil',
    name: 'Cambiar nombre',
    email: 'Cambiar correo',
    password: 'Cambiar contraseña',
    handicap: 'Historial de Handicap',
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sectionTitles[section]}</DialogTitle>
          </DialogHeader>
          {section === 'menu' && renderMenu()}
          {section === 'name' && renderNameSection()}
          {section === 'email' && renderEmailSection()}
          {section === 'password' && renderPasswordSection()}
        </DialogContent>
      </Dialog>
      <AddManualCourseDialog
        open={showManualCourse}
        onOpenChange={setShowManualCourse}
      />
    </>
  );
};
