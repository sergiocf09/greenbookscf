// Card-crossing (cruce de tarjeta) settlement between two players from different rounds.
// Each player's net comes from their own round (their own course/handicap allocation).

export interface CrossHoleScore { holeNumber: number; strokes: number; net: number; putts: number | null }

export interface CrossLine {
  key: string;        // bet key
  label: string;
  segment: 'front' | 'back' | 'total' | 'hole';
  holeNumber?: number;
  /** Positive = initiator wins this amount from target; negative = target wins. */
  amount: number;
  final: boolean;     // segment complete for both
}

export const CROSS_CALCULABLE = ['medal', 'matchPlay', 'skins', 'putts'] as const;

const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];

export function computeCrossBet(
  cfg: Record<string, any>,
  a: CrossHoleScore[],
  b: CrossHoleScore[],
): CrossLine[] {
  const ma = new Map(a.map(s => [s.holeNumber, s]));
  const mb = new Map(b.map(s => [s.holeNumber, s]));
  const both = (holes: number[]) => holes.filter(h => ma.has(h) && mb.has(h));
  const on = (k: string) => !!(cfg[k]?.enabled ?? cfg[k]?.included);
  const amt = (k: string) => Math.max(0, Number(cfg[k]?.amount ?? 50));
  const lines: CrossLine[] = [];
  const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

  const segs: [CrossLine['segment'], number[], string][] = [
    ['front', FRONT, 'Front'], ['back', BACK, 'Back'], ['total', [...FRONT, ...BACK], 'Total'],
  ];

  if (on('medal')) {
    for (const [seg, holes, name] of segs) {
      const hs = both(holes);
      if (!hs.length) continue;
      const diff = hs.reduce((s, h) => s + mb.get(h)!.net - ma.get(h)!.net, 0); // >0: A lower
      lines.push({ key: 'medal', label: `Medal ${name}`, segment: seg, amount: sign(diff) * amt('medal'), final: hs.length === holes.length });
    }
  }
  if (on('putts')) {
    for (const [seg, holes, name] of segs.slice(0, 2)) {
      const hs = both(holes).filter(h => ma.get(h)!.putts != null && mb.get(h)!.putts != null);
      if (!hs.length) continue;
      const diff = hs.reduce((s, h) => s + (mb.get(h)!.putts! - ma.get(h)!.putts!), 0);
      lines.push({ key: 'putts', label: `Putts ${name}`, segment: seg, amount: sign(diff) * amt('putts'), final: hs.length === holes.length });
    }
  }
  if (on('matchPlay')) {
    const all = [...FRONT, ...BACK];
    const hs = both(all);
    if (hs.length) {
      const up = hs.reduce((s, h) => s + sign(mb.get(h)!.net - ma.get(h)!.net), 0);
      lines.push({ key: 'matchPlay', label: 'Match Play', segment: 'total', amount: sign(up) * amt('matchPlay'), final: hs.length === all.length });
    }
  }
  if (on('skins')) {
    for (const h of both([...FRONT, ...BACK])) {
      const d = sign(mb.get(h)!.net - ma.get(h)!.net);
      if (d !== 0) lines.push({ key: 'skins', label: `Skins H${h}`, segment: 'hole', holeNumber: h, amount: d * amt('skins'), final: true });
    }
  }
  return lines;
}

export const crossNet = (lines: CrossLine[]) => lines.reduce((s, l) => s + l.amount, 0);
