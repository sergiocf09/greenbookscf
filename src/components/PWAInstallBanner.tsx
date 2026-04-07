import { useState, useEffect } from "react";
import { X, Download, Share, Plus, SquareArrowOutUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isIOS = () => {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};

const isInStandaloneMode = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

export const PWAInstallBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) {
      setIsInstalled(true);
      return;
    }

    const dismissedAt = localStorage.getItem("pwa-install-dismissed");
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        setDismissed(true);
        return;
      }
    }

    // iOS: show banner directly (no beforeinstallprompt event)
    if (isIOS()) {
      setShowBanner(true);
      return;
    }

    // Android/Chrome: wait for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (isIOS()) {
      setShowIOSGuide(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
  };

  const handleIOSGuideDone = () => {
    setShowIOSGuide(false);
    handleDismiss();
  };

  if (isInstalled || dismissed || !showBanner) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg">
          <img src="/pwa-icon-192.png" alt="GreenBook" className="h-10 w-10 rounded-lg" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-card-foreground">Instalar GreenBook</p>
            <p className="text-xs text-muted-foreground truncate">Acceso rápido desde tu pantalla</p>
          </div>
          <Button size="sm" onClick={handleInstall} className="shrink-0 gap-1.5">
            <Download className="h-4 w-4" />
            Instalar
          </Button>
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* iOS Installation Guide Dialog */}
      <Dialog open={showIOSGuide} onOpenChange={setShowIOSGuide}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">
              Instalar GreenBook en iPhone
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-1 pb-2">
            <img src="/pwa-icon-192.png" alt="GreenBook" className="h-16 w-16 rounded-2xl shadow-md" />
            <p className="text-xs text-muted-foreground">Tu ronda. Tus apuestas.</p>
          </div>

          <div className="space-y-4">
            {/* Step 1 */}
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                1
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Toca el botón de <strong>Compartir</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Es el ícono <SquareArrowOutUpRight className="inline h-3.5 w-3.5 align-text-bottom" /> en la barra inferior de Safari.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                2
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Desplázate y toca <strong>"Agregar a Inicio"</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Busca la opción <Plus className="inline h-3.5 w-3.5 align-text-bottom" /> Agregar a pantalla de inicio.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                3
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Toca <strong>"Agregar"</strong> para confirmar
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ¡Listo! GreenBook aparecerá en tu pantalla de inicio.
                </p>
              </div>
            </div>
          </div>

          <Button onClick={handleIOSGuideDone} className="w-full mt-2">
            ¡Entendido!
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
