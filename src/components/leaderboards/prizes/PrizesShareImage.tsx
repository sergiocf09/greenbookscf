import React, { useCallback, useEffect, useRef, useState } from 'react';
import { trs } from '@/i18n/tr';
import i18n from '@/i18n';
import { fmtMoney } from '@/lib/formatMoney';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { roundRectPath, truncate } from '@/components/leaderboards/TeamsCupShareImage';
import type { PrizesShareItem, PrizesSharePayouts } from '@/lib/prizesShareData';

export interface PrizesShareImageProps {
  open: boolean;
  onClose: () => void;
  /** Leaderboard name. */
  title: string;
  dateLabel: string;
  /** e.g. ['Gross', 'Neto'] shown next to the date. */
  modeLabelPairs?: string[];
  payouts: PrizesSharePayouts;
  status: 'live' | 'final';
}

/* Same brand palette as RoundShareImage (deep Augusta green + gold, serif titles). */
const CANVAS_W = 1080;
const PAD = 56;
const CW = CANVAS_W - PAD * 2;
const GREEN = '#006747';
const GOLD = '#FCE300';
const MAX_PLAYERS = 12;

const HEADER_H = 270;
const PROVISIONAL_H = 58;
const SECTION_TITLE_H = 58;
const PLAYER_ROW_H = 124;
const MORE_H = 48;
const POOL_TITLE_H = 44;
const LINE_H = 40;
const BLOCK_GAP = 18;
const FOOTER_H = 150;

export const shareItemLabel = (it: PrizesShareItem): string => {
  const place = it.place != null ? ` ${it.place}º` : '';
  const tie = it.tied ? ` ${trs('(empate)')}` : '';
  return `${it.label}${place}${tie} · ${fmtMoney(it.amount)}`;
};

const awardsTitle = (labels: string[]) =>
  labels.length > 0 && labels.every(l => /^oyes/i.test(l.trim()))
    ? trs('Oyes')
    : trs('Premios especiales');

const spaced = (s: string) => s.toUpperCase().split('').join(' ');

export function computePrizesShareHeight(payouts: PrizesSharePayouts, status: 'live' | 'final'): number {
  let h = HEADER_H + (status === 'live' ? PROVISIONAL_H : 0);
  const shown = Math.min(payouts.byParticipant.length, MAX_PLAYERS);
  h += SECTION_TITLE_H + Math.max(1, shown) * PLAYER_ROW_H;
  if (payouts.byParticipant.length > MAX_PLAYERS) h += MORE_H;
  if (payouts.pools.length > 0) {
    h += BLOCK_GAP + SECTION_TITLE_H;
    for (const p of payouts.pools) h += POOL_TITLE_H + Math.max(1, p.rows.length) * LINE_H + BLOCK_GAP;
  }
  if (payouts.awards.length > 0) {
    h += BLOCK_GAP + SECTION_TITLE_H + payouts.awards.length * LINE_H;
  }
  h += FOOTER_H;
  return Math.max(1080, Math.ceil(h));
}

function sectionTitle(ctx: CanvasRenderingContext2D, text: string, y: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.60)';
  ctx.font = '500 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(truncate(ctx, spaced(text), CW), CANVAS_W / 2, y + 36);
}

export function drawPrizesShareCanvas(ctx: CanvasRenderingContext2D, props: Omit<PrizesShareImageProps, 'open' | 'onClose'>) {
  const { title, dateLabel, modeLabelPairs, payouts, status } = props;
  const W = CANVAS_W;
  const H = computePrizesShareHeight(payouts, status);
  ctx.clearRect(0, 0, W, H);

  // Background (same gradient + fairway texture as RoundShareImage)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#004d35');
  bg.addColorStop(0.5, GREEN);
  bg.addColorStop(1, '#003d2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = -H; i < W + H; i += 40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
  }
  ctx.restore();

  // Provisional watermark (behind content)
  if (status === 'live') {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.4);
    ctx.fillStyle = 'rgba(252,227,0,0.07)';
    ctx.font = 'bold 130px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(trs('PROVISIONAL'), 0, 40);
    ctx.restore();
  }

  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 12);

  // Header
  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText('GreenBook', W / 2, 96);
  ctx.fillStyle = 'rgba(255,255,255,0.60)';
  ctx.font = '500 20px Arial, sans-serif';
  ctx.fillText(spaced(trs('Premios')), W / 2, 134);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px Georgia, serif';
  ctx.fillText(truncate(ctx, title, CW), W / 2, 190);
  ctx.fillStyle = 'rgba(252,227,0,0.80)';
  ctx.font = '22px Arial, sans-serif';
  const meta = [dateLabel, ...(modeLabelPairs || [])].filter(Boolean).join('  ·  ');
  ctx.fillText(truncate(ctx, meta, CW), W / 2, 228);

  // Ornamental separator
  ctx.strokeStyle = GOLD;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PAD, 252); ctx.lineTo(W / 2 - 40, 252); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2 + 40, 252); ctx.lineTo(W - PAD, 252); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(W / 2, 252); ctx.rotate(Math.PI / 4); ctx.fillStyle = GOLD; ctx.fillRect(-8, -8, 16, 16); ctx.restore();

  let y = HEADER_H;
  if (status === 'live') {
    const label = trs('PROVISIONAL');
    ctx.font = 'bold 24px Arial, sans-serif';
    const pw = ctx.measureText(label).width + 48;
    ctx.fillStyle = GOLD;
    roundRectPath(ctx, (W - pw) / 2, y + 4, pw, 42, 21);
    ctx.fill();
    ctx.fillStyle = '#003d2e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, W / 2, y + 26);
    ctx.textBaseline = 'alphabetic';
    y += PROVISIONAL_H;
  }

  // Players
  sectionTitle(ctx, trs('Premios por jugador'), y);
  y += SECTION_TITLE_H;
  const shown = payouts.byParticipant.slice(0, MAX_PLAYERS);
  if (shown.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '24px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(trs('Aún no hay premios asignados'), W / 2, y + 66);
    y += PLAYER_ROW_H;
  }
  shown.forEach((p, idx) => {
    const top = idx === 0;
    if (top) {
      const g = ctx.createLinearGradient(PAD, y, W - PAD, y);
      g.addColorStop(0, 'rgba(252,227,0,0.18)');
      g.addColorStop(1, 'rgba(252,227,0,0.02)');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
    }
    roundRectPath(ctx, PAD, y, CW, PLAYER_ROW_H - 12, 12);
    ctx.fill();

    // Initials avatar with the player's color
    const cx = PAD + 54;
    const cy = y + (PLAYER_ROW_H - 12) / 2;
    ctx.fillStyle = p.color || '#3B82F6';
    ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(truncate(ctx, p.initials || '??', 56), cx, cy + 1);
    ctx.textBaseline = 'alphabetic';

    // Total (amber/gold, right)
    const totalText = fmtMoney(p.total);
    ctx.font = `bold ${top ? 48 : 42}px Georgia, serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = GOLD;
    const totalW = ctx.measureText(totalText).width;
    ctx.fillText(totalText, W - PAD - 24, y + 66);

    // Name + concepts
    const textX = PAD + 108;
    const nameMax = W - PAD - 24 - totalW - 28 - textX;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${top ? 32 : 30}px Georgia, serif`;
    ctx.fillText(truncate(ctx, p.name, nameMax), textX, y + 46);
    ctx.fillStyle = 'rgba(255,255,255,0.68)';
    ctx.font = '19px Arial, sans-serif';
    ctx.fillText(truncate(ctx, p.items.map(shareItemLabel).join('   •   '), nameMax), textX, y + 84);

    y += PLAYER_ROW_H;
  });
  if (payouts.byParticipant.length > MAX_PLAYERS) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`+${payouts.byParticipant.length - MAX_PLAYERS} ${trs('más')}`, W / 2, y + 30);
    y += MORE_H;
  }

  // Winners by pool (1st–3rd)
  if (payouts.pools.length > 0) {
    y += BLOCK_GAP;
    sectionTitle(ctx, trs('Ganadores por bolsa'), y);
    y += SECTION_TITLE_H;
    for (const pool of payouts.pools) {
      ctx.textAlign = 'left';
      ctx.fillStyle = GOLD;
      ctx.font = 'bold 26px Georgia, serif';
      ctx.fillText(truncate(ctx, pool.label || trs('Bolsa'), CW), PAD, y + 30);
      y += POOL_TITLE_H;
      if (pool.rows.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '21px Arial, sans-serif';
        ctx.fillText(trs('Sin ganadores aún'), PAD + 16, y + 27);
        y += LINE_H;
      }
      for (const r of pool.rows) {
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(252,227,0,0.85)';
        ctx.font = 'bold 22px Arial, sans-serif';
        ctx.fillText(r.tied ? `T${r.rank}` : `${r.rank}º`, PAD + 16, y + 27);
        const amt = fmtMoney(r.amount);
        ctx.font = 'bold 24px Arial, sans-serif';
        const amtW = ctx.measureText(amt).width;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(amt, W - PAD, y + 27);
        ctx.textAlign = 'left';
        ctx.font = '22px Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        const nameX = PAD + 84;
        ctx.fillText(truncate(ctx, r.name, W - PAD - amtW - 24 - nameX), nameX, y + 27);
        y += LINE_H;
      }
      y += BLOCK_GAP;
    }
  }

  // Oyes / special awards (hole → winner)
  if (payouts.awards.length > 0) {
    y += BLOCK_GAP;
    sectionTitle(ctx, awardsTitle(payouts.awards.map(a => a.label)), y);
    y += SECTION_TITLE_H;
    for (const a of payouts.awards) {
      const amt = fmtMoney(a.amount);
      ctx.font = 'bold 24px Arial, sans-serif';
      const amtW = ctx.measureText(amt).width;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(amt, W - PAD, y + 27);
      const labelW = CW * 0.42;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '21px Arial, sans-serif';
      ctx.fillText(truncate(ctx, a.label, labelW - 12), PAD, y + 27);
      const winX = PAD + labelW;
      const winMax = W - PAD - amtW - 24 - winX;
      if (a.winnerName) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Arial, sans-serif';
        ctx.fillText(truncate(ctx, `→ ${a.winnerName}`, winMax), winX, y + 27);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.50)';
        ctx.font = 'italic 21px Arial, sans-serif';
        ctx.fillText(truncate(ctx, trs('Sin ganador aún'), winMax), winX, y + 27);
      }
      y += LINE_H;
    }
  }

  // Footer
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, H - 12, W, 12);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.50)';
  ctx.font = '19px Arial, sans-serif';
  ctx.fillText(truncate(ctx, trs('El reparto es un cálculo; el pago es acuerdo entre participantes.'), CW), W / 2, H - 92);
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillText(truncate(ctx, trs('Calculado con GreenBook · golfgreenbookscf.com'), CW), W / 2, H - 54);
}

export const PrizesShareImage: React.FC<PrizesShareImageProps> = ({ open, onClose, ...drawProps }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const key = JSON.stringify(drawProps);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = computePrizesShareHeight(drawProps.payouts, drawProps.status);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawPrizesShareCanvas(ctx, drawProps);
    setPreviewUrl(canvas.toDataURL('image/png'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (open) {
      setShowFallback(false);
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
      const filename = i18n.language === 'en' ? 'greenbook-prizes.png' : 'greenbook-premios.png';
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `GreenBook — ${drawProps.title}`,
            text: `🏆 ${drawProps.title} — ${trs('Premios')}\n📲 golfgreenbookscf.com`,
          });
          return;
        } catch {
          // cancelled — fall through to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowFallback(true);
    }, 'image/png');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">{trs('Compartir premios')}</DialogTitle>
        </DialogHeader>

        <canvas ref={canvasRef} className="hidden" />

        {previewUrl && (
          <img src={previewUrl} alt={`${trs('Premios')} · ${drawProps.title}`} className="w-full rounded-lg border border-border" />
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
            {trs('Compartir premios')}
          </Button>

          {showFallback && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200 text-center">
              {trs('✅ Imagen guardada. Abre WhatsApp, selecciona el chat y adjunta la imagen desde tu galería.')}
            </div>
          )}

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
            {trs('Cerrar')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrizesShareImage;
