import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

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
  roundHighlight?: string;
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

function buildDisplayName(name: string, allNames: string[]): string {
  const parts = name.trim().split(/\s+/);
  const firstName = parts[0];
  const lastName1 = parts[1] || '';
  const lastName2 = parts[2] || '';
  const candidateName = `${firstName} ${lastName1}`.trim();
  const hasDuplicate = allNames.some(n => {
    if (n === name) return false;
    const p = n.trim().split(/\s+/);
    return p[0] === firstName && (p[1] || '') === lastName1;
  });
  if (hasDuplicate && lastName2) return `${candidateName} ${lastName2[0]}.`;
  return candidateName;
}

function computeCanvasHeight(playerCount: number, hasHighlight: boolean) {
  const base = 275 + playerCount * 138 + (hasHighlight ? 100 : 0) + 180;
  return Math.max(1080, base);
}

function drawCanvas(
  ctx: CanvasRenderingContext2D,
  courseName: string,
  date: string,
  players: RoundShareImageProps['players'],
  roundHighlight?: string,
) {
  const W = CANVAS_W;
  const H = computeCanvasHeight(players.length, !!roundHighlight);
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
  const allPlayerNames = sorted.map(p => p.name);
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
      ctx.beginPath(); ctx.arc(85, y + rowH / 2, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#003d2e';
      ctx.font = 'bold 26px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('1°', 85, y + rowH / 2 + 9);
    } else {
      ctx.fillStyle = 'rgba(252,227,0,0.25)';
      ctx.beginPath(); ctx.arc(85, y + rowH / 2, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = GOLD;
      ctx.font = 'bold 22px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(posLabels[idx] || `${idx + 1}°`, 85, y + rowH / 2 + 8);
    }

    // Name (no avatar circle — full name with differentiation)
    const displayName = buildDisplayName(player.name, allPlayerNames);
    ctx.textAlign = 'left';
    ctx.globalAlpha = rowAlpha;
    ctx.fillStyle = isWinner ? '#ffffff' : 'rgba(255,255,255,0.88)';
    ctx.font = `bold ${isWinner ? 34 : 30}px Georgia, serif`;
    ctx.fillText(displayName, 160, y + rowH / 2 + 10);
    ctx.globalAlpha = 1;

    // Gross strokes — right-middle column
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${player.totalGross}`, W - 320, y + rowH / 2 + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText('golpes', W - 320, y + rowH / 2 + 26);

    // Net amount — far right
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

  // ── Round highlight banner ──
  if (roundHighlight) {
    const bannerY = startY + sorted.length * rowH + 10;
    ctx.fillStyle = 'rgba(252,227,0,0.12)';
    roundRectPath(ctx, 60, bannerY, W - 120, 70, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(252,227,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 ' + roundHighlight, W / 2, bannerY + 42);
  }

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
  roundHighlight,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const h = computeCanvasHeight(players.length, !!roundHighlight);
    canvas.width = CANVAS_W;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCanvas(ctx, courseName, date, players, roundHighlight);
    setPreviewUrl(canvas.toDataURL('image/png'));
  }, [courseName, date, players, roundHighlight]);

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

  const downloadImage = async () => {
    render();
    const blob = await getBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'greenbook-resultado.png';
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareToWhatsApp = async () => {
    render();
    const blob = await getBlob();
    const file = new File([blob], 'greenbook-resultado.png', { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'GreenBook',
          text: `Ronda en ${courseName} 🏌️\ngolfgreenbookscf.com`,
        });
      } catch {
        // cancelled
      }
    } else {
      // Fallback: download + open WhatsApp Web
      await downloadImage();
      setTimeout(() => {
        window.open(
          'https://wa.me/?text=Mis%20resultados%20de%20golf%20en%20GreenBook%20%F0%9F%8F%8C%EF%B8%8F%20golfgreenbookscf.com',
          '_blank',
        );
      }, 800);
    }
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
          <Button
            className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-base gap-2"
            onClick={shareToWhatsApp}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.862L.057 23.428l5.7-1.496A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.893 9.893 0 01-5.031-1.378l-.361-.214-3.735.979 1.004-3.632-.235-.374A9.86 9.86 0 012.106 12C2.106 6.58 6.58 2.106 12 2.106c5.421 0 9.894 4.474 9.894 9.894 0 5.421-4.473 9.894-9.894 9.894z" />
            </svg>
            Compartir en WhatsApp
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={downloadImage}>
            <Download className="h-4 w-4" />
            Descargar imagen
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
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
