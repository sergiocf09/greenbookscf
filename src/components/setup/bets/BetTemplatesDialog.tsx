import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Save, Download, Star, StarOff, Trash2, Pencil, Check, X, Loader2 } from 'lucide-react';
import { BetConfig, Player } from '@/types/golf';
import { BetTemplate, useBetTemplates } from '@/hooks/useBetTemplates';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type DialogMode = 'menu' | 'save' | 'load' | 'manage';

interface BetTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  betConfig: BetConfig;
  players: Player[];
  onApplyTemplate: (config: BetConfig) => void;
}

export const BetTemplatesDialog: React.FC<BetTemplatesDialogProps> = ({
  open,
  onOpenChange,
  betConfig,
  players,
  onApplyTemplate,
}) => {
  const {
    templates,
    isLoading,
    saveTemplate,
    overwriteTemplate,
    loadTemplate,
    deleteTemplate,
    renameTemplate,
    toggleFavorite,
  } = useBetTemplates();

  const [mode, setMode] = useState<DialogMode>('menu');
  const [saveName, setSaveName] = useState('');
  const [saveFavorite, setSaveFavorite] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const resetState = () => {
    setMode('menu');
    setSaveName('');
    setSaveFavorite(false);
    setEditingId(null);
    setEditName('');
    setDeleteConfirmId(null);
  };

  const handleClose = (o: boolean) => {
    if (!o) resetState();
    onOpenChange(o);
  };

  const handleSave = async () => {
    const trimmed = saveName.trim();
    if (!trimmed) {
      toast.error('Ingresa un nombre para la plantilla');
      return;
    }
    setIsSaving(true);
    const result = await saveTemplate(trimmed, betConfig, saveFavorite);
    setIsSaving(false);

    if (result.conflict) {
      setShowOverwriteConfirm(true);
      return;
    }
    if (result.success) {
      toast.success('Plantilla guardada');
      handleClose(false);
    } else {
      toast.error('Error al guardar la plantilla');
    }
  };

  const handleOverwrite = async () => {
    setShowOverwriteConfirm(false);
    setIsSaving(true);
    const ok = await overwriteTemplate(saveName.trim(), betConfig);
    setIsSaving(false);
    if (ok) {
      toast.success('Plantilla actualizada');
      handleClose(false);
    } else {
      toast.error('Error al actualizar');
    }
  };

  const handleLoad = async (template: BetTemplate) => {
    setIsApplying(true);
    const config = await loadTemplate(template.id, players);
    setIsApplying(false);
    if (config) {
      onApplyTemplate(config);
      toast.success('Plantilla aplicada. Revisa participantes si cambió el grupo.');
      handleClose(false);
    } else {
      toast.error('Error al cargar la plantilla');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteTemplate(id);
    if (ok) toast.success('Plantilla eliminada');
    else toast.error('Error al eliminar');
    setDeleteConfirmId(null);
  };

  const handleRename = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    const ok = await renameTemplate(id, trimmed);
    if (ok) toast.success('Nombre actualizado');
    else toast.error('Error al renombrar');
    setEditingId(null);
  };

  const handleToggleFavorite = async (t: BetTemplate) => {
    await toggleFavorite(t.id, !t.is_favorite);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), 'dd MMM yyyy', { locale: es });
    } catch {
      return '';
    }
  };

  const title = mode === 'save' ? 'Guardar Plantilla'
    : mode === 'load' ? 'Cargar Plantilla'
    : mode === 'manage' ? 'Administrar Plantillas'
    : 'Plantillas de Apuestas';

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">{title}</DialogTitle>
          </DialogHeader>

          {mode === 'menu' && (
            <div className="flex flex-col gap-3 py-2">
              <Button
                variant="outline"
                className="justify-start gap-3 h-14"
                onClick={() => setMode('save')}
              >
                <Save className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Guardar plantilla</div>
                  <div className="text-xs text-muted-foreground">Guarda la configuración actual</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start gap-3 h-14"
                onClick={() => setMode('load')}
              >
                <Download className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Cargar plantilla</div>
                  <div className="text-xs text-muted-foreground">Aplica una configuración guardada</div>
                </div>
              </Button>
              {templates.length > 0 && (
                <Button
                  variant="ghost"
                  className="justify-start gap-3 h-14 text-muted-foreground"
                  onClick={() => setMode('manage')}
                >
                  <Pencil className="h-4 w-4" />
                  <span>Administrar plantillas ({templates.length})</span>
                </Button>
              )}
            </div>
          )}

          {mode === 'save' && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="template-name">Nombre de la plantilla</Label>
                <Input
                  id="template-name"
                  placeholder="Ej: Ronda semanal Club"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="template-fav" className="text-sm">Marcar como favorita</Label>
                <Switch
                  id="template-fav"
                  checked={saveFavorite}
                  onCheckedChange={setSaveFavorite}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setMode('menu')} className="flex-1">
                  Atrás
                </Button>
                <Button onClick={handleSave} disabled={isSaving || !saveName.trim()} className="flex-1">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Guardar
                </Button>
              </div>
            </div>
          )}

          {mode === 'load' && (
            <div className="space-y-2 py-2">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <p className="text-sm">No tienes plantillas guardadas.</p>
                  <Button variant="link" onClick={() => setMode('save')} className="mt-2">
                    Guardar la configuración actual
                  </Button>
                </div>
              ) : (
                <>
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleLoad(t)}
                      disabled={isApplying}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg border border-border/50',
                        'hover:bg-muted/50 transition-colors text-left',
                        isApplying && 'opacity-50 pointer-events-none'
                      )}
                    >
                      {t.is_favorite ? (
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
                      ) : (
                        <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{t.name}</div>
                        {t.last_used_at && (
                          <div className="text-xs text-muted-foreground">
                            Último uso: {formatDate(t.last_used_at)}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                  <Button variant="ghost" onClick={() => setMode('menu')} className="w-full mt-2">
                    Atrás
                  </Button>
                </>
              )}
            </div>
          )}

          {mode === 'manage' && (
            <div className="space-y-2 py-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 p-3 rounded-lg border border-border/50"
                >
                  {editingId === t.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 h-8 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(t.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRename(t.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleToggleFavorite(t)}
                        className="shrink-0"
                      >
                        {t.is_favorite ? (
                          <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        ) : (
                          <StarOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{t.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(t.updated_at)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => { setEditingId(t.id); setEditName(t.name); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteConfirmId(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              <Button variant="ghost" onClick={() => setMode('menu')} className="w-full mt-2">
                Atrás
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Overwrite confirmation */}
      <AlertDialog open={showOverwriteConfirm} onOpenChange={setShowOverwriteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Plantilla existente</AlertDialogTitle>
            <AlertDialogDescription>
              Ya tienes una plantilla llamada "{saveName.trim()}". ¿Deseas sobrescribirla con la configuración actual?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleOverwrite}>Sobrescribir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar plantilla</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. ¿Estás seguro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
