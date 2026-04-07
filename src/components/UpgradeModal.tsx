import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/hooks/useSubscription';
import { Loader2, Trophy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: 'create_round' | 'history' | 'share' | 'leaderboard';
}

const REASON_MESSAGES = {
  create_round: {
    title: "Continúa jugando sin límites",
    subtitle: "Alcanzaste el límite de 12 rondas gratuitas como organizador",
  },
  history: {
    title: "Accede a tu historial completo",
    subtitle: "Suscríbete para ver todas tus rondas, balances y rankings",
  },
  share: {
    title: "Comparte tus resultados",
    subtitle: "Suscríbete para compartir resúmenes de ronda por WhatsApp",
  },
  leaderboard: {
    title: "Crea tu propio Leaderboard",
    subtitle: "Organiza torneos y competencias grupales con GreenBook Pro",
  },
};

const FEATURES = [
  "Rondas ilimitadas como organizador",
  "Historial completo de rondas y balances",
  "Rankings grupales de dinero y hándicap",
  "Crear y gestionar Leaderboards",
  "Compartir resúmenes por WhatsApp",
  "Todas las features futuras incluidas",
];

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  open,
  onClose,
  reason = 'create_round',
}) => {
  const { startCheckout } = useSubscription();
  const [loading, setLoading] = useState<"anual" | "semestral" | null>(null);
  const message = REASON_MESSAGES[reason];

  const handleCheckout = async (plan: "semestral" | "anual") => {
    setLoading(plan);
    try {
      await startCheckout(plan);
    } catch {
      toast.error("Pagos próximamente disponibles. ¡Gracias por tu interés!");
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground text-center">
          <Trophy className="h-10 w-10 mx-auto mb-2" />
          <h2 className="text-lg font-bold">{message.title}</h2>
          <p className="text-sm opacity-90 mt-1">{message.subtitle}</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <ul className="space-y-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          <Button
            className="w-full"
            size="lg"
            onClick={() => handleCheckout("anual")}
            disabled={loading !== null}
          >
            {loading === "anual" && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Suscribirse — $999 MXN / año
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleCheckout("semestral")}
            disabled={loading !== null}
          >
            {loading === "semestral" && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Plan semestral — $599 MXN / 6 meses
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Menos que un green fee en tu club
          </p>
          <p className="text-[10px] text-muted-foreground text-center">
            Sin renovación automática · Sin penalización por cancelar
          </p>

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
            Ahora no
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
