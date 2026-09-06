import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/* ── Types ───────────────────────────────────────── */

export interface CupShareMatch {
  /** Foursome / playing group number (null when unknown). */
  group: number | null;
  /** Day/session label, used to keep chronological order in the Total view. */
  slotLabel?: string | null;
  /** Sort key for the day/session (day * 100 + session). */
  slotOrder?: number;
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

/* ── Canvas constants (dark app-like theme) ──────── */

const CANVAS_W = 1080;
const PAD = 44;
const GREEN = '#0E9B6B';
const GOLD = '#D9B531';
const BG = '#0A140F';
const CARD = 'rgba(255,255,255,0.045)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const TXT = '#F2F6F3';
const MUTED = 'rgba(242,246,243,0.55)';

const HEADER_H = 236;
const SCORE_H = 268;
const SLOT_HEADER_H = 54;
const SLOT_CARD_H = 148;
const GROUP_HEADER_H = 46;
const MATCH_ROW_H = 116;
const MATCHES_HEADER_H = 56;
const FOOTER_H = 128;

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

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 16, fill = CARD) {
  ctx.fillStyle = fill;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = CARD_BORDER;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  color: string,
  bg: string,
  font = 'bold 20px Arial, sans-serif',
) {
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  const w = tw + 34;
  const h = 40;
  ctx.fillStyle = bg;
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

function fmtPts(v: number): string {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1).replace('.0', '');
}

type ShareGroup = {
  key: string;
  slotLabel: string | null;
  group: number | null;
  slotOrder: number;
  matches: CupShareMatch[];
};

/**
 * Groups matches first by day/session (chronological) and then by playing
 * group, so the Total view never interleaves days.
 */
function groupEntries(matches: CupShareMatch[]): ShareGroup[] {
  const map = new Map<string, ShareGroup>();
  for (const m of matches) {
    const slotLabel = m.slotLabel ?? null;
    const group = m.group ?? null;
    const key = `${slotLabel ?? ''}|${group ?? ''}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        slotLabel,
        group,
        slotOrder: m.slotOrder ?? 0,
        matches: [],
      });
    }
    map.get(key)!.matches.push(m);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.slotOrder !== b.slotOrder) return a.slotOrder - b.slotOrder;
    if (a.group === b.group) return 0;
    if (a.group === null) return 1;
    if (b.group === null) return -1;
    return a.group - b.group;
  });
}

export function computeCupShareHeight(props: TeamsCupShareImageProps): number {
  const slots = props.slots ?? [];
  const entries = groupEntries(props.matches);
  const showGroupHeaders = entries.length > 1;
  let h = HEADER_H + SCORE_H;
  if (slots.length > 0) h += SLOT_HEADER_H + slots.length * (SLOT_CARD_H + 14) + 12;
  if (props.matches.length > 0) {
    h += MATCHES_HEADER_H;
    h += props.matches.length * MATCH_ROW_H;
    if (showGroupHeaders) h += entries.length * GROUP_HEADER_H;
    h += 12;
  }
  h += FOOTER_H;
  return Math.max(1000, h);
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function statusColors(label: string): { fg: string; bg: string } {
  if (label === 'Cerrado') return { fg: GREEN, bg: 'rgba(14,155,107,0.16)' };
  if (label === 'En juego') return { fg: GOLD, bg: 'rgba(217,181,49,0.16)' };
  return { fg: MUTED, bg: 'rgba(255,255,255,0.06)' };
}

export function drawCupShareCanvas(ctx: CanvasRenderingContext2D, props: TeamsCupShareImageProps) {
  const { cupName, subtitle, courseName, date, teamA, teamB, matches } = props;
  const slots = props.slots ?? [];
  const W = CANVAS_W;
  const H = computeCupShareHeight(props);
  const CW = W - PAD * 2;
  ctx.clearRect(0, 0, W, H);

  // ── Background (near-black green, like the dark app) ──
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W);
  glow.addColorStop(0, 'rgba(14,155,107,0.16)');
  glow.addColorStop(1, 'rgba(10,20,15,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 700);

  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 8);

  // ── Header ──
  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText('GREENBOOK', W / 2, 74);

  ctx.fillStyle = TXT;
  ctx.font = 'bold 56px Georgia, serif';
  ctx.fillText(truncate(ctx, cupName, CW), W / 2, 136);

  const metaParts: string[] = [];
  if (date) {
    metaParts.push(
      new Date(date + 'T12:00:00').toLocaleDateString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric',
      }),
    );
  }
  if (courseName) metaParts.push(courseName);
  if (metaParts.length > 0) {
    ctx.fillStyle = MUTED;
    ctx.font = '24px Arial, sans-serif';
    ctx.fillText(truncate(ctx, metaParts.join('  ·  '), CW), W / 2, 176);
  }

  pill(ctx, subtitle, W / 2, 210, GOLD, 'rgba(217,181,49,0.16)');

  // ── Scoreboard card ──
  let y = HEADER_H;
  {
    const h = SCORE_H - 32;
    card(ctx, PAD, y, CW, h, 20);

    const leftCx = PAD + CW * 0.26;
    const rightCx = PAD + CW * 0.74;

    ctx.textAlign = 'center';
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillStyle = teamA.color || GREEN;
    ctx.fillText(truncate(ctx, teamA.name, CW * 0.4), leftCx, y + 54);
    ctx.fillStyle = teamB.color || GOLD;
    ctx.fillText(truncate(ctx, teamB.name, CW * 0.4), rightCx, y + 54);

    ctx.font = 'bold 96px Georgia, serif';
    ctx.fillStyle = TXT;
    ctx.fillText(fmtPts(teamA.points), leftCx, y + 148);
    ctx.fillText(fmtPts(teamB.points), rightCx, y + 148);

    ctx.fillStyle = MUTED;
    ctx.font = '300 46px Georgia, serif';
    ctx.fillText('—', PAD + CW / 2, y + 132);

    const total = teamA.points + teamB.points;
    const barX = PAD + 44, barW = CW - 88, barY = y + 176, barH = 14;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRectPath(ctx, barX, barY, barW, barH, 7);
    ctx.fill();
    if (total > 0) {
      ctx.save();
      roundRectPath(ctx, barX, barY, barW, barH, 7);
      ctx.clip();
      const aw = (teamA.points / total) * barW;
      ctx.fillStyle = teamA.color || GREEN;
      ctx.fillRect(barX, barY, aw, barH);
      ctx.fillStyle = teamB.color || GOLD;
      ctx.fillRect(barX + aw, barY, barW - aw, barH);
      ctx.restore();
    }

    const doneTotal = matches.length;
    const doneCount = matches.filter(m => m.winner !== null).length;
    if (doneTotal > 0 || slots.length > 0) {
      ctx.fillStyle = MUTED;
      ctx.font = '22px Arial, sans-serif';
      const label = slots.length > 0
        ? `Acumulado · ${doneTotal} matches · ${doneCount} completados`
        : `${doneTotal} matches · ${doneCount} completados`;
      ctx.fillText(label, PAD + CW / 2, y + 218);
    }
    y += h + 32;
  }

  // ── Per-day breakdown (visual cards) ──
  if (slots.length > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = MUTED;
    ctx.font = '600 22px Arial, sans-serif';
    ctx.fillText('POR JORNADA', PAD + 6, y + 30);
    y += SLOT_HEADER_H;

    slots.forEach((s) => {
      card(ctx, PAD, y, CW, SLOT_CARD_H, 16);
      const sc = statusColors(s.statusLabel);

      ctx.textAlign = 'left';
      ctx.fillStyle = TXT;
      ctx.font = 'bold 30px Arial, sans-serif';
      ctx.fillText(truncate(ctx, s.label, CW * 0.5), PAD + 26, y + 48);

      ctx.font = 'bold 18px Arial, sans-serif';
      const pw = ctx.measureText(s.statusLabel).width + 34;
      pill(ctx, s.statusLabel, PAD + CW - 26 - pw / 2, y + 38, sc.fg, sc.bg, 'bold 18px Arial, sans-serif');

      // Scores centered
      ctx.textAlign = 'center';
      const cx = PAD + CW / 2;
      ctx.font = 'bold 52px Georgia, serif';
      ctx.fillStyle = teamA.color || GREEN;
      ctx.fillText(fmtPts(s.points_a), cx - 74, y + 106);
      ctx.fillStyle = teamB.color || GOLD;
      ctx.fillText(fmtPts(s.points_b), cx + 74, y + 106);
      ctx.fillStyle = MUTED;
      ctx.font = '300 32px Georgia, serif';
      ctx.fillText('—', cx, y + 100);

      // Slot progress bar
      const total = s.points_a + s.points_b;
      const barX = PAD + 26, barW = CW - 52, barY = y + SLOT_CARD_H - 24, barH = 10;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRectPath(ctx, barX, barY, barW, barH, 5);
      ctx.fill();
      if (total > 0) {
        ctx.save();
        roundRectPath(ctx, barX, barY, barW, barH, 5);
        ctx.clip();
        const aw = (s.points_a / total) * barW;
        ctx.fillStyle = teamA.color || GREEN;
        ctx.fillRect(barX, barY, aw, barH);
        ctx.fillStyle = teamB.color || GOLD;
        ctx.fillRect(barX + aw, barY, barW - aw, barH);
        ctx.restore();
      }

      y += SLOT_CARD_H + 14;
    });
    y += 12;
  }

  // ── Matches ──
  if (matches.length > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = MUTED;
    ctx.font = '600 22px Arial, sans-serif';
    ctx.fillText('MATCHES', PAD + 6, y + 32);
    y += MATCHES_HEADER_H;

    const entries = groupEntries(matches);
    const showGroupHeaders = entries.length > 1;

    entries.forEach((entry) => {
      const ms = entry.matches;
      if (showGroupHeaders) {
        ctx.textAlign = 'left';
        ctx.fillStyle = GOLD;
        ctx.font = 'bold 20px Arial, sans-serif';
        const groupPart = entry.group === null ? 'Sin grupo' : `Grupo ${entry.group}`;
        const label = entry.slotLabel ? `${entry.slotLabel} · ${groupPart}` : groupPart;
        ctx.fillText(label, PAD + 6, y + 28);
        const lw = ctx.measureText(label).width;
        ctx.strokeStyle = 'rgba(217,181,49,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD + 6 + lw + 14, y + 22);
        ctx.lineTo(PAD + CW, y + 22);
        ctx.stroke();
        y += GROUP_HEADER_H;
      }

      ms.forEach((m) => {
        const rh = MATCH_ROW_H - 12;
        card(ctx, PAD, y, CW, rh, 14);

        // Side panels: the winning side gets a strong tinted panel + border,
        // the losing side is dimmed. Halved matches keep both neutral.
        const panelW = CW * 0.365;
        const panelH = rh - 20;
        const py = y + 10;
        const colA = teamA.color || GREEN;
        const colB = teamB.color || GOLD;
        const drawPanel = (x: number, color: string, state: 'win' | 'lose' | 'neutral') => {
          ctx.save();
          ctx.globalAlpha = state === 'win' ? 0.3 : state === 'lose' ? 0.05 : 0.12;
          ctx.fillStyle = color;
          roundRectPath(ctx, x, py, panelW, panelH, 10);
          ctx.fill();
          ctx.restore();
          if (state === 'win') {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            roundRectPath(ctx, x + 1.5, py + 1.5, panelW - 3, panelH - 3, 10);
            ctx.stroke();
            ctx.restore();
          }
        };
        const stateA = m.winner === 'a' ? 'win' : m.winner === 'b' ? 'lose' : 'neutral';
        const stateB = m.winner === 'b' ? 'win' : m.winner === 'a' ? 'lose' : 'neutral';
        drawPanel(PAD + 10, colA, stateA);
        drawPanel(PAD + CW - 10 - panelW, colB, stateB);

        const drawNames = (
          names: string[],
          x: number,
          align: CanvasTextAlign,
          state: 'win' | 'lose' | 'neutral',
        ) => {
          ctx.textAlign = align;
          if (names.length === 0) return;
          const main = state === 'win' ? '#FFFFFF' : state === 'lose' ? 'rgba(242,246,243,0.5)' : TXT;
          const sec = state === 'win' ? '#FFFFFF' : state === 'lose' ? 'rgba(242,246,243,0.45)' : 'rgba(242,246,243,0.85)';
          ctx.font = `bold ${names.length === 1 ? 24 : 22}px Arial, sans-serif`;
          if (names.length === 1) {
            ctx.fillStyle = main;
            ctx.fillText(truncate(ctx, names[0], panelW - 28), x, py + panelH / 2 + 9);
            return;
          }
          names.slice(0, 2).forEach((n, i) => {
            ctx.fillStyle = i === 0 ? main : sec;
            ctx.fillText(truncate(ctx, n, panelW - 28), x, py + 34 + i * 32);
          });
        };
        drawNames(m.sideA, PAD + 24, 'left', stateA);
        drawNames(m.sideB, PAD + CW - 24, 'right', stateB);

        // Center result
        const centerX = PAD + CW / 2;
        ctx.textAlign = 'center';
        ctx.font = 'bold 38px Georgia, serif';
        ctx.fillStyle = m.winner === 'a'
          ? (teamA.color || GREEN)
          : m.winner === 'b'
            ? (teamB.color || GOLD)
            : m.winner === 'halved'
              ? GOLD
              : MUTED;
        ctx.fillText(truncate(ctx, m.resultText, CW * 0.3), centerX, y + rh / 2 + 2);
        if (m.resultNote) {
          ctx.font = '18px Arial, sans-serif';
          ctx.fillStyle = MUTED;
          ctx.fillText(truncate(ctx, m.resultNote, CW * 0.3), centerX, y + rh / 2 + 30);
        }

        y += MATCH_ROW_H;
      });
    });
    y += 12;
  }

  // ── Footer ──
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, H - 8, W, 8);
  const footerY = H - 92;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(242,246,243,0.42)';
  ctx.font = '20px Arial, sans-serif';
  ctx.fillText('¿Quieres llevar tus torneos y apuestas de golf?', W / 2, footerY + 24);
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText('golfgreenbookscf.com', W / 2, footerY + 58);
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
    canvas.height = computeCupShareHeight(props);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCupShareCanvas(ctx, props);
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
