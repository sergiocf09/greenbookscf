// Card-crossing (cruce de tarjeta): two players from different rounds settled with the
// SAME bet engine as any round. We build a virtual 2-player round from each player's own
// confirmed scores and markers, apply the agreed strokes between them, and run calculateAllBets.
import { calculateAllBets } from '@/lib/betCalculations';
import { defaultBetConfig } from '@/components/setup/bets/defaultBetConfig';
import { defaultMarkerState, type BetConfig, type GolfCourse, type MarkerState, type Player, type PlayerScore } from '@/types/golf';
import { markerDbToKey } from '@/lib/markerTypeMapping';

export interface CrossHoleScore {
  holeNumber: number;
  strokes: number;
  net: number;
  putts: number | null;
  oyesProximity?: number | null;
  oyesProximitySangron?: number | null;
  markers?: { t: string; n: number }[];
}

export interface CrossLine {
  key: string;
  label: string;
  segment: 'front' | 'back' | 'total' | 'hole';
  holeNumber?: number;
  /** Positive = initiator wins this amount from target; negative = target wins. */
  amount: number;
}

export const CROSS_BET_KEYS = ['medal', 'pressures', 'matchPlay', 'putts', 'skins', 'caros', 'oyeses', 'rayas', 'units', 'manchas', 'culebras', 'bloques'] as const;

/** Strokes agreed in the crossing. giver = profile id that gives strokes; count = strokes. */
export interface CrossStrokes { giverProfileId: string | null; count: number }

export function suggestedStrokes(aId: string, aHcp: number, bId: string, bHcp: number): CrossStrokes {
  const diff = Math.round((bHcp ?? 0) - (aHcp ?? 0));
  if (diff === 0) return { giverProfileId: null, count: 0 };
  return diff > 0 ? { giverProfileId: aId, count: diff } : { giverProfileId: bId, count: -diff };
}

export function resolveStrokes(cfg: Record<string, any>, aId: string, aHcp: number, bId: string, bHcp: number): CrossStrokes {
  const s = cfg?.strokes;
  if (s && typeof s.count === 'number') return { giverProfileId: s.giverProfileId ?? null, count: Math.max(0, s.count) };
  return suggestedStrokes(aId, aHcp, bId, bHcp);
}

const on = (cfg: Record<string, any>, k: string) => !!(cfg[k]?.enabled ?? cfg[k]?.included);
const amt = (cfg: Record<string, any>, k: string) => Math.max(0, Number(cfg[k]?.amount ?? 50));

export function buildCrossBetConfig(cfg: Record<string, any>, bilateral: BetConfig['bilateralHandicaps']): BetConfig {
  const c: any = JSON.parse(JSON.stringify(defaultBetConfig));
  const a = (k: string) => amt(cfg, k);
  if (on(cfg, 'medal')) c.medal = { ...c.medal, enabled: true, frontAmount: a('medal'), backAmount: a('medal'), totalAmount: a('medal') };
  if (on(cfg, 'pressures')) c.pressures = { ...c.pressures, enabled: true, frontAmount: a('pressures'), backAmount: a('pressures'), totalAmount: a('pressures') };
  if (on(cfg, 'matchPlay')) c.matchPlay = { ...c.matchPlay, enabled: true, amount: a('matchPlay') };
  if (on(cfg, 'putts')) c.putts = { ...c.putts, enabled: true, frontAmount: a('putts'), backAmount: a('putts'), totalAmount: a('putts') };
  if (on(cfg, 'skins')) c.skins = { ...c.skins, enabled: true, frontValue: a('skins'), backValue: a('skins') };
  if (on(cfg, 'caros')) c.caros = { ...c.caros, enabled: true, amount: a('caros') };
  if (on(cfg, 'oyeses')) c.oyeses = { ...c.oyeses, enabled: true, amount: a('oyeses') };
  if (on(cfg, 'rayas')) c.rayas = { ...c.rayas, enabled: true, frontValue: a('rayas'), backValue: a('rayas'), medalTotalValue: a('rayas') };
  if (on(cfg, 'units')) c.units = { ...c.units, enabled: true, valuePerPoint: a('units') };
  if (on(cfg, 'manchas')) c.manchas = { ...c.manchas, enabled: true, valuePerPoint: a('manchas') };
  if (on(cfg, 'culebras')) c.culebras = { ...c.culebras, enabled: true, valuePerOccurrence: a('culebras') };
  if (on(cfg, 'bloques')) c.bloques = { ...c.bloques, enabled: true, amountPerBlock: a('bloques') };
  c.bilateralHandicaps = bilateral;
  return c as BetConfig;
}

const toMarkers = (list?: { t: string; n: number }[]): MarkerState => {
  const m: any = { ...defaultMarkerState };
  for (const it of list ?? []) {
    const k = markerDbToKey(it.t);
    if (!k) continue;
    m[k] = typeof m[k] === 'number' ? (it.n ?? 1) : true;
  }
  return m;
};

const keyOf = (betType: string): string => {
  const t = betType.toLowerCase();
  if (t.includes('rayas')) return 'rayas';
  if (t.includes('presion')) return 'pressures';
  if (t.includes('medal')) return 'medal';
  if (t.includes('match')) return 'matchPlay';
  if (t.includes('putt')) return 'putts';
  if (t.includes('skin')) return 'skins';
  if (t.includes('caro')) return 'caros';
  if (t.includes('oyes')) return 'oyeses';
  if (t.includes('unidad')) return 'units';
  if (t.includes('mancha')) return 'manchas';
  if (t.includes('culebra')) return 'culebras';
  if (t.includes('bloque')) return 'bloques';
  return 'other';
};

export interface CrossSide { profileId: string; name: string; handicap: number; scores: CrossHoleScore[] }

export function computeCrossBet(
  cfg: Record<string, any>,
  a: CrossSide,
  b: CrossSide,
  course: GolfCourse,
  startingHole: 1 | 10 = 1,
): CrossLine[] {
  if (!CROSS_BET_KEYS.some(k => on(cfg, k))) return [];
  const pa: Player = { id: a.profileId, profileId: a.profileId, name: a.name, initials: '', color: '', handicap: a.handicap, groupId: 'cross' };
  const pb: Player = { id: b.profileId, profileId: b.profileId, name: b.name, initials: '', color: '', handicap: b.handicap, groupId: 'cross' };
  const st = resolveStrokes(cfg, a.profileId, a.handicap, b.profileId, b.handicap);
  const bilateral = [{
    playerAId: a.profileId, playerBId: b.profileId,
    playerAHandicap: st.giverProfileId === b.profileId ? st.count : 0,
    playerBHandicap: st.giverProfileId === a.profileId ? st.count : 0,
  }];
  const holesA = new Set(a.scores.map(s => s.holeNumber));
  const common = new Set(b.scores.map(s => s.holeNumber).filter(h => holesA.has(h)));
  const toPS = (pid: string, list: CrossHoleScore[]): PlayerScore[] => list
    .filter(s => common.has(s.holeNumber))
    .map(s => ({
      playerId: pid, holeNumber: s.holeNumber, strokes: s.strokes, putts: s.putts ?? 0,
      markers: toMarkers(s.markers), strokesReceived: 0, netScore: s.strokes, confirmed: true,
      oyesProximity: s.oyesProximity ?? null, oyesProximitySangron: s.oyesProximitySangron ?? null,
    }));
  const scores = new Map<string, PlayerScore[]>([[pa.id, toPS(pa.id, a.scores)], [pb.id, toPS(pb.id, b.scores)]]);
  const config = buildCrossBetConfig(cfg, bilateral);
  const summaries = calculateAllBets([pa, pb], scores, config, course, startingHole, common);
  return summaries
    .filter(s => s.playerId === pa.id && s.vsPlayer === pb.id && s.amount !== 0)
    .map(s => ({ key: keyOf(s.betType), label: s.betType, segment: s.segment, holeNumber: s.holeNumber, amount: s.amount }));
}

export const crossNet = (lines: CrossLine[]) => lines.reduce((s, l) => s + l.amount, 0);
