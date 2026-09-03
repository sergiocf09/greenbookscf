import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/* ── Types ───────────────────────────────────────── */

export interface CupShareMatch {
  /** Foursome / playing group number (null when unknown). */
  group: number | null;
  sideA: string[];
  sideB: string[];
  /** Main result label: '3&2', 'AS', '2UP', 'Pendiente'… */
  resultText: string;
  /** Secondary label: 'Final', 'thru 14', 'Sin scores'… */
  resultNote?: string;
  winner: 'a' | 'b' | 'halved' | null;
}

export interface CupShareSlot {
  label: string;
  points_a: number;
  points_b: number;
  /** 'Cerrado' | 'En juego' | 'Pendiente' */
  statusLabel: string;
}

export interface TeamsCupShareImageProps {
  open: boolean;
  onClose: () => void;
  cupName: string;
  /** 'Total acumulado' or the day/session label. */
  subtitle: string;
  courseName?: string | null;
  /** ISO date (yyyy-mm-dd). */
  date?: string | null;
  teamA: { name: string; color: string; points: number };
  teamB: { name: string; color: string; points: number };
  /** Per-day breakdown (only for the accumulated view). */
  slots?: CupShareSlot[];
  matches: CupShareMatch[];
}

/* ── Canvas constants ────────────────────────────── */

const CANVAS_W = 1080;
const GREEN = '#006747';
const GOLD = '#FCE300';

const HEADER_H = 250;
const SCORE_H = 230;
const SLOT_ROW_H = 46;
const SLOT_HEADER_H = 46;
const GROUP_HEADER_H = 40;
const MATCH_ROW_H = 92;
const MATCHES_HEADER_H = 50;
const FOOTER_H = 120;

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

function fmtPts(v: number): string {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1).replace('.0', '');
}

function groupEntries(matches: CupShareMatch[]) {
  const map = new Map<number | null, CupShareMatch[]>();
  for (const m of matches) {
    const key = m.group ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });
}

function computeHeight(props: TeamsCupShareImageProps): number {
  const slots = props.slots ?? [];
  const entries = groupEntries(props.matches);
  const showGroupHeaders = entries.length > 1;
  let h = HEADER_H + SCORE_H;
  if (slots.length > 0) h += SLOT_HEADER_H + slots.length * SLOT_ROW_H + 16;
  if (props.matches.length > 0) {
    h += MATCHES_HEADER_H;
    h += props.matches.length * MATCH_ROW_H;
    if (showGroupHeaders) h += entries.length * GROUP_HEADER_H;
    h += 16;
  }
  h += FOOTER_H;
  return Math.max(1080, h);
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function drawCanvas(ctx: CanvasRenderingContext2D, props: TeamsCupShareImageProps) {
  const { cupName, subtitle, courseName, date, teamA, teamB, matches } = props;
  const slots = props.slots ?? [];
  const W = CANVAS_W;
  const H = computeHeight(props);
  ctx.clearRect(0, 0, W, H);

  // ── Background ──
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#004d35');
  bgGrad.addColorStop(0.5, GREEN);
  bgGrad.addColorStop(1, '#003d2e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

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

  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 12);

  // ── Header ──
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 64px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('GreenBook', W / 2, 92);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText(truncate(ctx, cupName, W - 120), W / 2, 146);

  const metaParts: string[] = [];
  if (courseName) metaParts.push(courseName);
  if (date) {
    metaParts.push(
      new Date(date + 'T12:00:00').toLocaleDateString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric',
      }),
    );
  }
  if (metaParts.length > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '24px Georgia, serif';
    ctx.fillText(truncate(ctx, metaParts.join('  ·  '), W - 120), W / 2, 184);
  }

  // Subtitle pill
  {
    ctx.font = 'bold 20px Arial, sans-serif';
    const label = subtitle.toUpperCase();
    const tw = ctx.measureText(label).width;
    const bw = tw + 36;
    const bh = 36;
    const bx = (W - bw) / 2;
    const by = 200;
    ctx.fillStyle = 'rgba(252,227,0,0.18)';
    roundRectPath(ctx, bx, by, bw, bh, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(252,227,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, W / 2, by + bh / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // ── Scoreboard ──
  let y = HEADER_H;
  {
    const cardX = 40, cardW = W - 80, cardH = SCORE_H - 30;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRectPath(ctx, cardX, y, cardW, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const leftCx = cardX + cardW * 0.25;
    const rightCx = cardX + cardW * 0.75;

    ctx.textAlign = 'center';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillStyle = teamA.color;
    ctx.fillText(truncate(ctx, teamA.name, cardW * 0.42), leftCx, y + 48);
    ctx.fillStyle = teamB.color;
    ctx.fillText(truncate(ctx, teamB.name, cardW * 0.42), rightCx, y + 48);

    ctx.font = 'bold 88px Georgia, serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fmtPts(teamA.points), leftCx, y + 132);
    ctx.fillText(fmtPts(teamB.points), rightCx, y + 132);

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '300 44px Georgia, serif';
    ctx.fillText('—', cardX + cardW / 2, y + 122);

    // Progress bar
    const total = teamA.points + teamB.points;
    const barX = cardX + 40, barW = cardW - 80, barY = y + 158, barH = 14;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRectPath(ctx, barX, barY, barW, barH, 7);
    ctx.fill();
    if (total > 0) {
      ctx.save();
      roundRectPath(ctx, barX, barY, barW, barH, 7);
      ctx.clip();
      const aw = (teamA.points / total) * barW;
      ctx.fillStyle = teamA.color;
      ctx.fillRect(barX, barY, aw, barH);
      ctx.fillStyle = teamB.color;
      ctx.fillRect(barX + aw, barY, barW - aw, barH);
      ctx.restore();
    }
    y += cardH + 30;
  }

  // ── Per-day breakdown ──
  if (slots.length > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 20px Arial, sans-serif';
    ctx.fillText('POR JORNADA', 55, y + 26);
    y += SLOT_HEADER_H;

    slots.forEach((s, i) => {
      const rx = 40, rw = W - 80, rh = SLOT_ROW_H - 8;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)';
      roundRectPath(ctx, rx, y, rw, rh, 8);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.fillText(truncate(ctx, s.label, rw * 0.45), rx + 18, y + rh / 2 + 8);

      ctx.font = '18px Arial, sans-serif';
      ctx.fillStyle = s.statusLabel === 'Cerrado' ? 'rgba(74,222,128,0.9)' : 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'center';
      ctx.fillText(s.statusLabel, rx + rw * 0.62, y + rh / 2 + 7);

      ctx.textAlign = 'right';
      ctx.font = 'bold 24px Georgia, serif';
      ctx.fillStyle = teamA.color;
      const ptsA = fmtPts(s.points_a);
      const ptsB = fmtPts(s.points_b);
      const dash = ' — ';
      const wB = ctx.measureText(ptsB).width;
      const wD = ctx.measureText(dash).width;
      ctx.fillStyle = teamB.color;
      ctx.fillText(ptsB, rx + rw - 18, y + rh / 2 + 8);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(dash, rx + rw - 18 - wB, y + rh / 2 + 8);
      ctx.fillStyle = teamA.color;
      ctx.fillText(ptsA, rx + rw - 18 - wB - wD, y + rh / 2 + 8);

      y += SLOT_ROW_H;
    });
    y += 16;
  }

  // ── Matches ──
  if (matches.length > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 20px Arial, sans-serif';
    ctx.fillText('MATCHES', 55, y + 28);
    y += MATCHES_HEADER_H;

    const entries = groupEntries(matches);
    const showGroupHeaders = entries.length > 1;

    entries.forEach(([groupNumber, ms]) => {
      if (showGroupHeaders) {
        ctx.textAlign = 'left';
        ctx.fillStyle = GOLD;
        ctx.font = 'bold 18px Arial, sans-serif';
        const label = groupNumber === null ? 'Sin grupo' : `Grupo ${groupNumber}`;
        ctx.fillText(label, 55, y + 24);
        const lw = ctx.measureText(label).width;
        ctx.strokeStyle = 'rgba(252,227,0,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(55 + lw + 12, y + 18);
        ctx.lineTo(W - 55, y + 18);
        ctx.stroke();
        y += GROUP_HEADER_H;
      }

      ms.forEach((m) => {
        const rx = 40, rw = W - 80, rh = MATCH_ROW_H - 10;
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        roundRectPath(ctx, rx, y, rw, rh, 10);
        ctx.fill();

        // Winner accent bar
        if (m.winner === 'a' || m.winner === 'b') {
          ctx.fillStyle = m.winner === 'a' ? teamA.color : teamB.color;
          const barX = m.winner === 'a' ? rx : rx + rw - 6;
          roundRectPath(ctx, barX, y, 6, rh, 3);
          ctx.fill();
        }

        const centerX = rx + rw / 2;
        const sideW = rw / 2 - 110;

        // Side A names
        ctx.textAlign = 'left';
        ctx.font = 'bold 22px Arial, sans-serif';
        m.sideA.forEach((n, i) => {
          ctx.fillStyle = i === 0 ? '#ffffff' : 'rgba(255,255,255,0.85)';
          const ny = m.sideA.length > 1 ? y + 32 + i * 30 : y + rh / 2 + 8;
          ctx.fillText(truncate(ctx, n, sideW), rx + 22, ny);
        });

        // Side B names
        ctx.textAlign = 'right';
        m.sideB.forEach((n, i) => {
          ctx.fillStyle = i === 0 ? '#ffffff' : 'rgba(255,255,255,0.85)';
          const ny = m.sideB.length > 1 ? y + 32 + i * 30 : y + rh / 2 + 8;
          ctx.fillText(truncate(ctx, n, sideW), rx + rw - 22, ny);
        });

        // Center result
        ctx.textAlign = 'center';
        ctx.font = 'bold 30px Georgia, serif';
        ctx.fillStyle = m.winner === 'a'
          ? teamA.color
          : m.winner === 'b'
            ? teamB.color
            : m.winner === 'halved'
              ? GOLD
              : 'rgba(255,255,255,0.55)';
        ctx.fillText(m.resultText, centerX, y + rh / 2 + 2);
        if (m.resultNote) {
          ctx.font = '16px Arial, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillText(m.resultNote, centerX, y + rh / 2 + 26);
        }

        y += MATCH_ROW_H;
      });
    });
    y += 16;
  }

  // ── Footer ──
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, H - 12, W, 12);
  const footerY = H - 90;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.font = '18px Arial, sans-serif';
  ctx.fillText('¿Quieres llevar tus torneos y apuestas de golf?', W / 2, footerY + 20);
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillText('golfgreenbookscf.com', W / 2, footerY + 52);
}

/* ── Component ───────────────────────────────────── */

export const TeamsCupShareImage: React.FC<TeamsCupShareImageProps> = (props) => {
  const { open, onClose, cupName, subtitle } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = computeHeight(props);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCanvas(ctx, props);
    setPreviewUrl(canvas.toDataURL('image/png'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(props.matches), JSON.stringify(props.slots), cupName, subtitle,
      props.teamA.points, props.teamB.points, props.courseName, props.date]);

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
      const file = new File([blob], 'greenbook-teams-cup.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `GreenBook — ${cupName}`,
            text: `🏌️ ${cupName} — ${subtitle}\n📲 golfgreenbookscf.com`,
          });
          return;
        } catch {
          // cancelled — fall through to download
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'greenbook-teams-cup.png';
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
          <DialogTitle className="text-center">Compartir Resultado</DialogTitle>
        </DialogHeader>

        <canvas ref={canvasRef} className="hidden" />

        {previewUrl && (
          <img
            src={previewUrl}
            alt={`Resultado de ${cupName}`}
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

          {showFallback && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200 text-center">
              ✅ Imagen guardada. Abre WhatsApp, selecciona el chat y adjunta la imagen desde tu galería.
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
