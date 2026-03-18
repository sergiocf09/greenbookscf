import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2, Download } from 'lucide-react';

export interface RoundShareImageProps {
  open: boolean;
  onClose: () => void;
  courseName: string;
  date: string;
  players: Array<{
    name: string;
    initials: string;
    color: string;
    totalNet: number;
    totalGross: number;
  }>;
  betTypes: string[];
}

const CANVAS_W = 1080;
const CANVAS_H = 1080;
const GREEN = '#006747';
const GOLD = '#FCE300';

export const RoundShareImage: React.FC<RoundShareImageProps> = ({
  open,
  onClose,
  courseName,
  date,
  players,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = GREEN;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Header — GreenBook
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 52px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('GreenBook', 540, 90);

    // Course name
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Georgia, serif';
    ctx.fillText(courseName, 540, 130);

    // Date
    ctx.fillStyle = 'rgba(252, 227, 0, 0.7)';
    ctx.font = '18px Arial, sans-serif';
    ctx.fillText(date, 540, 162);

    // Gold separator
    ctx.strokeStyle = GOLD;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 195);
    ctx.lineTo(1020, 195);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Resultados Finales', 540, 250);

    // Players sorted by totalNet descending
    const sorted = [...players].sort((a, b) => b.totalNet - a.totalNet);
    const posLabels = ['1°', '2°', '3°', '4°', '5°', '6°'];

    sorted.forEach((player, idx) => {
      const y = 320 + idx * 140;

      // Position circle (gold)
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(90, y + 30, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GREEN;
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(posLabels[idx] || `${idx + 1}°`, 90, y + 38);

      // Avatar circle
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(170, y + 30, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.initials, 170, y + 38);

      // Name
      const parts = player.name.trim().split(' ');
      const displayName =
        parts.length >= 2 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText(displayName, 225, y + 28);

      // Gross score
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '18px Arial, sans-serif';
      ctx.fillText(`Golpes: ${player.totalGross}`, 225, y + 58);

      // Net amount (right-aligned)
      ctx.textAlign = 'right';
      const netLabel =
        player.totalNet > 0
          ? `+$${player.totalNet}`
          : player.totalNet < 0
          ? `-$${Math.abs(player.totalNet)}`
          : '$0';
      ctx.fillStyle =
        player.totalNet > 0
          ? '#4ade80'
          : player.totalNet < 0
          ? '#f87171'
          : 'rgba(255,255,255,0.4)';
      ctx.font = 'bold 34px Georgia, serif';
      ctx.fillText(netLabel, 1000, y + 38);

      // Separator between players
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(60, y + 100);
      ctx.lineTo(1020, y + 100);
      ctx.stroke();
    });

    // Footer separator
    const footerY = 320 + sorted.length * 140 + 20;
    ctx.strokeStyle = GOLD;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, footerY);
    ctx.lineTo(1020, footerY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Footer text
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('¿Quieres llevar tus apuestas de golf?', 540, footerY + 45);
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillText('greenbookscf.lovable.app', 540, footerY + 78);

    // Generate preview
    setPreviewUrl(canvas.toDataURL('image/png'));
  }, [courseName, date, players]);

  useEffect(() => {
    if (open) {
      // Small delay so canvas is mounted
      const t = setTimeout(drawCanvas, 50);
      return () => clearTimeout(t);
    }
  }, [open, drawCanvas]);

  const getBlob = (): Promise<Blob> =>
    new Promise((resolve) => {
      canvasRef.current!.toBlob((blob) => resolve(blob!), 'image/png');
    });

  const handleShare = async () => {
    const blob = await getBlob();
    const file = new File([blob], 'greenbook-resultado.png', { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `GreenBook — ${courseName}`,
          text: `Resultados de hoy en ${courseName} 🏌️\ngreenbookscf.lovable.app`,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleDownload();
    }
  };

  const handleDownload = async () => {
    const blob = await getBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'greenbook-resultado.png';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Compartir Resultado</DialogTitle>
        </DialogHeader>

        {/* Hidden canvas */}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="hidden"
        />

        {/* Preview */}
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Preview del resultado"
            className="w-full rounded-lg border border-border"
          />
        )}

        <div className="space-y-2 pt-2">
          <Button onClick={handleShare} className="w-full bg-[#006747] hover:bg-[#005538] text-white">
            <Share2 className="h-4 w-4 mr-2" />
            Compartir resultado 🏌️
          </Button>
          <Button variant="outline" onClick={handleDownload} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Descargar imagen
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full">
            Ahora no
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Comparte en WhatsApp, Instagram o donde prefieras
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
