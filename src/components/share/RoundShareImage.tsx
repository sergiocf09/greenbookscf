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
const GREEN = '#006747';
const GOLD = '#FCE300';

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function computeCanvasHeight(playerCount: number) {
  return Math.max(1080, 275 + playerCount * 138 + 180);
}

function drawCanvas(
  ctx: CanvasRenderingContext2D,
  courseName: string,
  date: string,
  players: RoundShareImageProps['players'],
) {
  const W = CANVAS_W;
  const H = computeCanvasHeight(players.length);
  ctx.clearRect(0, 0, W, H);

  // ── Background gradient ──
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#004d35');
  bgGrad.addColorStop(0.5, GREEN);
  bgGrad.addColorStop(1, '#003d2e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ── Fairway texture ──
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = -H; i < W + H; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }
  ctx.restore();

  // ── Top gold banner ──
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 12);

  // ── Header ──
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 72px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('GreenBook', W / 2, 105);

  ctx.fillStyle = 'rgba(255,255,255,0.90)';
  ctx.font = '28px Georgia, serif';
  ctx.fillText(courseName, W / 2, 148);

  ctx.fillStyle = 'rgba(252,227,0,0.75)';
  ctx.font = '20px Arial, sans-serif';
  ctx.fillText(date, W / 2, 180);

  // ── Ornamental separator ──
  ctx.strokeStyle = GOLD;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(60, 208); ctx.lineTo(460, 208); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(620, 208); ctx.lineTo(1020, 208); ctx.stroke();
  ctx.globalAlpha = 1;

  // Diamond ornament
  ctx.fillStyle = GOLD;
  ctx.save();
  ctx.translate(540, 208);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-8, -8, 16, 16);
  ctx.restore();

  // ── Section title ──
  ctx.fillStyle = 'rgba(255,255,255,0.60)';
  ctx.font = '500 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('R E S U L T A D O S   F I N A L E S', W / 2, 250);

  // ── Player rows ──
  const sorted = [...players].sort((a, b) => b.totalNet - a.totalNet);
  const rowH = 138;
  const startY = 275;
  const posLabels = ['1°', '2°', '3°', '4°', '5°', '6°'];

  sorted.forEach((player, idx) => {
    const y = startY + idx * rowH;
    const isWinner = idx === 0;
    const isLoser = player.totalNet < 0;
    const rowAlpha = isWinner ? 1 : 0.88 - idx * 0.06;

    // Row background highlight
    if (isWinner) {
      const rowGrad = ctx.createLinearGradient(40, y, W - 40, y);
      rowGrad.addColorStop(0, 'rgba(252,227,0,0.18)');
      rowGrad.addColorStop(0.5, 'rgba(252,227,0,0.08)');
      rowGrad.addColorStop(1, 'rgba(252,227,0,0.02)');
      ctx.fillStyle = rowGrad;
      roundRectPath(ctx, 40, y + 4, W - 80, rowH - 12, 12);
      ctx.fill();
    } else if (isLoser) {
      ctx.fillStyle = 'rgba(220,50,50,0.06)';
      roundRectPath(ctx, 40, y + 4, W - 80, rowH - 12, 8);
      ctx.fill();
    }

    // Position badge
    if (isWinner) {
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(105, y + rowH / 2, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#003d2e';
      ctx.font = 'bold 26px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('1°', 105, y + rowH / 2 + 9);
    } else {
      ctx.fillStyle = 'rgba(252,227,0,0.25)';
      ctx.beginPath(); ctx.arc(105, y + rowH / 2, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = GOLD;
      ctx.font = 'bold 22px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(posLabels[idx] || `${idx + 1}°`, 105, y + rowH / 2 + 8);
    }

    // Avatar
    const avatarR = isWinner ? 38 : 32;
    const avatarX = 195;
    const avatarY = y + rowH / 2;
    if (isWinner) {
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarR + 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = player.color;
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${isWinner ? 22 : 18}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(player.initials, avatarX, avatarY + 7);

    // Name
    const parts = player.name.trim().split(' ');
    const displayName = parts.length >= 2 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
    ctx.textAlign = 'left';
    ctx.globalAlpha = rowAlpha;
    ctx.fillStyle = isWinner ? '#ffffff' : 'rgba(255,255,255,0.88)';
    ctx.font = `bold ${isWinner ? 34 : 30}px Georgia, serif`;
    ctx.fillText(displayName, 252, y + rowH / 2 - 4);

    // Gross strokes
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '18px Arial, sans-serif';
    ctx.fillText(`${player.totalGross} golpes`, 252, y + rowH / 2 + 26);
    ctx.globalAlpha = 1;

    // Net amount
    const netLabel = player.totalNet > 0
      ? `+$${player.totalNet.toLocaleString()}`
      : player.totalNet < 0
        ? `-$${Math.abs(player.totalNet).toLocaleString()}`
        : 'Par';
    ctx.textAlign = 'right';
    ctx.font = `bold ${isWinner ? 52 : 44}px Georgia, serif`;
    ctx.fillStyle = player.totalNet > 0
      ? (isWinner ? GOLD : '#4ade80')
      : player.totalNet < 0
        ? '#f87171'
        : 'rgba(255,255,255,0.5)';
    ctx.fillText(netLabel, W - 55, y + rowH / 2 + 12);

    // Row separator
    if (idx < sorted.length - 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(80, y + rowH - 8);
      ctx.lineTo(W - 80, y + rowH - 8);
      ctx.stroke();
    }
  });

  // ── Bottom gold banner ──
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, H - 12, W, 12);

  // ── Footer ──
  const footerY = H - 90;
  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.font = '18px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('¿Quieres llevar tus apuestas de golf?', W / 2, footerY + 20);
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillText('golfgreenbookscf.com', W / 2, footerY + 52);
}

export const RoundShareImage: React.FC<RoundShareImageProps> = ({
  open,
  onClose,
  courseName,
  date,
  players,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const h = computeCanvasHeight(players.length);
    canvas.width = CANVAS_W;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCanvas(ctx, courseName, date, players);
    setPreviewUrl(canvas.toDataURL('image/png'));
  }, [courseName, date, players]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(render, 50);
      return () => clearTimeout(t);
    }
  }, [open, render]);

  const getBlob = (): Promise<Blob> =>
    new Promise((resolve) => {
      canvasRef.current!.toBlob((blob) => resolve(blob!), 'image/png');
    });

  const handleShare = async () => {
    render(); // re-draw before export
    const blob = await getBlob();
    const file = new File([blob], 'greenbook-resultado.png', { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `GreenBook — ${courseName}`,
          text: `Resultados de hoy en ${courseName} 🏌️\ngolfgreenbookscf.com`,
        });
      } catch {
        // cancelled
      }
    } else {
      handleDownload();
    }
  };

  const handleDownload = async () => {
    render();
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

        <canvas ref={canvasRef} className="hidden" />

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
