import React, { useState, useMemo } from 'react';
import { Copy, Check, Link2, QrCode, Hash, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

const isPreviewHost = () => {
  const { hostname } = window.location;
  return (
    hostname.includes('lovableproject.com') ||
    hostname.startsWith('id-preview--')
  );
};

interface ShareRoundDialogProps {
  roundId: string;
  onClose?: () => void;
}

export const ShareRoundDialog: React.FC<ShareRoundDialogProps> = ({
  roundId,
  onClose,
}) => {
  const [copiedType, setCopiedType] = useState<'link' | 'code' | null>(null);
  const [showQR, setShowQR] = useState(false);
  const isPreview = useMemo(() => isPreviewHost(), []);

  // Generate share link
  const shareLink = useMemo(() => {
    // IMPORTANT: use the same origin where the round was created.
    // Preview and Published run against different backend environments.
    const baseUrl = window.location.origin;
    return `${baseUrl}/join/${roundId}`;
  }, [roundId]);

  // Generate short code from round ID (first 6 chars uppercase)
  const shortCode = useMemo(() => {
    return roundId.substring(0, 6).toUpperCase();
  }, [roundId]);

  // Generate QR code URL using a free API
  const qrCodeUrl = useMemo(() => {
    const encodedUrl = encodeURIComponent(shareLink);
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedUrl}&bgcolor=ffffff&color=1a472a`;
  }, [shareLink]);

  const copyToClipboard = async (text: string, type: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      toast.success(type === 'link' ? 'Link copiado!' : 'Código copiado!');
      setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      toast.error('Error al copiar');
    }
  };

  return (
    <div className="space-y-4">
      {isPreview && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Estás en <span className="font-medium">modo preview</span>. Las rondas creadas aquí no existen en el sitio publicado.
              Para invitar a otros sin problemas, publica la app y crea la ronda desde el sitio publicado antes de compartir.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Link Section */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Link2 className="h-4 w-4" />
            <span className="text-sm font-medium">Link de Invitación</span>
          </div>
          <div className="flex gap-2">
            <Input 
              value={shareLink} 
              readOnly 
              className="text-xs font-mono bg-muted/50"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(shareLink, 'link')}
              className="shrink-0"
            >
              {copiedType === 'link' ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Code Section */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Hash className="h-4 w-4" />
            <span className="text-sm font-medium">Código de Ronda</span>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex-1 bg-muted/50 rounded-md px-4 py-3 text-center">
              <span className="text-2xl font-mono font-bold tracking-widest text-primary">
                {shortCode}
              </span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(shortCode, 'code')}
              className="shrink-0 h-12"
            >
              {copiedType === 'code' ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Dicta este código a los otros jugadores
          </p>
        </CardContent>
      </Card>

      {/* QR Toggle Button */}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setShowQR(!showQR)}
      >
        <QrCode className="h-4 w-4 mr-2" />
        {showQR ? 'Ocultar QR' : 'Mostrar QR'}
      </Button>

      {/* QR Code Section - Collapsible */}
      {showQR && (
        <Card className="bg-white animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <CardContent className="p-4 flex flex-col items-center">
            <div className="bg-white p-3 rounded-lg shadow-inner border">
              <img 
                src={qrCodeUrl} 
                alt="QR Code para unirse a la ronda"
                width={200}
                height={200}
                className="block"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Los jugadores pueden escanear para unirse
            </p>
          </CardContent>
        </Card>
      )}

      {/* Native Share Button (mobile) */}
      {typeof navigator.share === 'function' && (
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            try {
              await navigator.share({
                title: 'Únete a mi ronda de golf',
                text: `Únete a mi ronda de golf. Código: ${shortCode}`,
                url: shareLink,
              });
            } catch (err) {
              // User cancelled or error
            }
          }}
        >
          <Share2 className="h-4 w-4 mr-2" />
          Compartir vía...
        </Button>
      )}
    </div>
  );
};