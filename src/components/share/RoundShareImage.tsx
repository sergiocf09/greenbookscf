import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ShareHighlights, BadgeData } from '@/lib/shareHighlights';
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
  coursePar?: number;
  highlights?: {
    medalTotal: { label: string; value: string };
    front9: { label: string; value: string };
    back9: { label: string; value: string };
  };
  players: Array<{
    name: string;
    initials: string;
    color: string;
    totalNet: number;
    totalGross: number;
    wonFrom?: number;
    lostTo?: number;
    rivalStats?: {
      won: number;
      lost: number;
    };
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

function buildDisplayName(name: string, allNames: string[]): string {
  return name.trim();
}

function computeCanvasHeight(
  playerCount: number,
  hasHighlights: boolean,
) {
  let h = 275 + playerCount * 150;
  if (hasHighlights) h += 120;
  h += 120; // footer
  return Math.max(1080, h);
}

function drawCanvas(
  ctx: CanvasRenderingContext2D,
  courseName: string,
  date: string,
  players: RoundShareImageProps['players'],
  coursePar: number,
  highlights?: RoundShareImageProps['highlights'],
) {
  const W = CANVAS_W;
  const H = computeCanvasHeight(players.length, !!highlights);
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
  const rowH = 150;
  const startY = 275;
  const posLabels = ['1°', '2°', '3°', '4°', '5°', '6°'];

  sorted.forEach((player, idx) => {
    const y = startY + idx * rowH;
    const isFirst = idx === 0;
    const isLoser = player.totalNet < 0;

    // ── Row background ──
    if (isFirst) {
      const rowGrad = ctx.createLinearGradient(40, y, W - 40, y);
      rowGrad.addColorStop(0, 'rgba(252,227,0,0.18)');
      rowGrad.addColorStop(1, 'rgba(252,227,0,0.02)');
      ctx.fillStyle = rowGrad;
    } else if (isLoser) {
      ctx.fillStyle = 'rgba(220,50,50,0.06)';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
    }
    roundRectPath(ctx, 40, y + 4, W - 80, rowH - 12, 10);
    ctx.fill();

    // ── Position badge ──
    if (isFirst) {
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(95, y + rowH / 2, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#003d2e';
      ctx.font = 'bold 26px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('1°', 95, y + rowH / 2 + 9);
    } else {
      ctx.fillStyle = 'rgba(252,227,0,0.25)';
      ctx.beginPath(); ctx.arc(95, y + rowH / 2, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = GOLD;
      ctx.font = 'bold 22px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(posLabels[idx] || `${idx + 1}°`, 95, y + rowH / 2 + 8);
    }

    // ── LEFT COLUMN: Name + Score + Stats (all inline on row 2) ──
    const nameX = 165;
    const displayName = buildDisplayName(player.name, allPlayerNames);

    // Row 1: Full name
    ctx.textAlign = 'left';
    ctx.fillStyle = isFirst ? '#ffffff' : 'rgba(255,255,255,0.88)';
    ctx.font = `bold ${isFirst ? 36 : 32}px Georgia, serif`;
    ctx.fillText(displayName, nameX, y + 48);

    // Row 2: Gross score bold + differential + won/lost badges — all inline
    const lineY = y + 90;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial, sans-serif';
    const grossText = `${player.totalGross}`;
    ctx.fillText(grossText, nameX, lineY);
    let cursorX = nameX + ctx.measureText(grossText).width + 8;

    const diff = player.totalGross - coursePar;
    const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.fillText(`(${diffLabel})`, cursorX, lineY);
    cursorX += ctx.measureText(`(${diffLabel})`).width + 18;

    // Thin vertical separator
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(cursorX, lineY - 20, 1.5, 26);
    cursorX += 14;

    const wonFrom = player.wonFrom || 0;
    const lostTo = player.lostTo || 0;
    const rivalStats = player.rivalStats;
    if (rivalStats && rivalStats.won > 0) {
      const wonText = `▲ +$${wonFrom.toLocaleString()} (${rivalStats.won})`;
      ctx.font = 'bold 20px Arial, sans-serif';
      const wonW = ctx.measureText(wonText).width + 16;
      ctx.fillStyle = 'rgba(74,222,128,0.15)';
      roundRectPath(ctx, cursorX, lineY - 22, wonW, 30, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(74,222,128,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(74,222,128,0.95)';
      ctx.fillText(wonText, cursorX + 8, lineY);
      cursorX += wonW + 8;
    }
    if (rivalStats && rivalStats.lost > 0) {
      const lostText = `▼ -$${lostTo.toLocaleString()} (${rivalStats.lost})`;
      ctx.font = 'bold 20px Arial, sans-serif';
      const lostW = ctx.measureText(lostText).width + 16;
      ctx.fillStyle = 'rgba(248,113,113,0.12)';
      roundRectPath(ctx, cursorX, lineY - 22, lostW, 30, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(248,113,113,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(248,113,113,0.90)';
      ctx.fillText(lostText, cursorX + 8, lineY);
    }

    // ── RIGHT COLUMN: Net amount ──
    const netLabel = player.totalNet > 0
      ? `+$${player.totalNet.toLocaleString()}`
      : player.totalNet < 0
        ? `-$${Math.abs(player.totalNet).toLocaleString()}`
        : '$0';
    ctx.textAlign = 'right';
    ctx.font = `bold ${isFirst ? 52 : 44}px Georgia, serif`;
    ctx.fillStyle = player.totalNet > 0
      ? (isFirst ? GOLD : '#4ade80')
      : player.totalNet < 0
        ? '#f87171'
        : 'rgba(255,255,255,0.5)';
    ctx.fillText(netLabel, W - 55, y + 60);

    // Row separator
    if (idx < sorted.length - 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(80, y + rowH - 6);
      ctx.lineTo(W - 80, y + rowH - 6);
      ctx.stroke();
    }
  });

  // Track current Y for remaining sections
  let curY = startY + sorted.length * rowH + 15;

  // ── Highlight badges ──
  if (highlights) {
    const badges = [highlights.medalTotal, highlights.front9, highlights.back9];
    const badgeW = 278;
    const gap = 27;
    const totalBW = badgeW * 3 + gap * 2;
    const bStartX = (W - totalBW) / 2;

    badges.forEach((badge, i) => {
      const bx = bStartX + i * (badgeW + gap);
      ctx.fillStyle = 'rgba(252,227,0,0.10)';
      roundRectPath(ctx, bx, curY, badgeW, 72, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(252,227,0,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(252,227,0,0.60)';
      ctx.font = '13px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(badge.label.toUpperCase(), bx + badgeW / 2, curY + 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Georgia, serif';
      ctx.fillText(badge.value, bx + badgeW / 2, curY + 55);
    });
    curY += 92;
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
  coursePar,
  highlights,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showFallbackInstructions, setShowFallbackInstructions] = useState(false);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const h = computeCanvasHeight(players.length, !!highlights);
    canvas.width = CANVAS_W;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCanvas(ctx, courseName, date, players, coursePar || 72, highlights);
    setPreviewUrl(canvas.toDataURL('image/png'));
  }, [courseName, date, players, coursePar, highlights]);

  useEffect(() => {
    if (open) {
      setShowFallbackInstructions(false);
      const t = setTimeout(render, 50);
      return () => clearTimeout(t);
    }
  }, [open, render]);

  const handleShare = async () => {
    render();
    await new Promise(r => setTimeout(r, 100));
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'greenbook-resultado.png', { type: 'image/png' });

      // Try native Web Share API with file
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `GreenBook — ${courseName}`,
            text: `🏌️ Mis resultados de golf en ${courseName}\n📲 golfgreenbookscf.com`,
          });
          return;
        } catch {
          // User cancelled or failed — fall through
        }
      }

      // Fallback: download + instructions
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'greenbook-resultado.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowFallbackInstructions(true);
    }, 'image/png');
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
            onClick={handleShare}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.862L.057 23.428l5.7-1.496A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.893 9.893 0 01-5.031-1.378l-.361-.214-3.735.979 1.004-3.632-.235-.374A9.86 9.86 0 012.106 12C2.106 6.58 6.58 2.106 12 2.106c5.421 0 9.894 4.474 9.894 9.894 0 5.421-4.473 9.894-9.894 9.894z" />
            </svg>
            Compartir resultado 🏌️
          </Button>

          {showFallbackInstructions && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200 text-center">
              ✅ Imagen guardada en tu galería. Abre WhatsApp, selecciona el chat y adjunta la imagen desde tu galería de fotos.
            </div>
          )}

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
            Ahora no
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
