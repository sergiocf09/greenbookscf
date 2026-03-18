/**
 * Shared logic for computing share-image highlights from a round snapshot.
 * Three badges: Best Medal Gross Total, Best Front 9, Best Back 9.
 */

import { formatPlayerName, formatPlayerNameTwoWords } from '@/lib/playerInput';

export interface BadgeData {
  label: string;
  names: string[];
  score: number | null;
}

export interface ShareHighlights {
  medalTotal: BadgeData;
  front9: BadgeData;
  back9: BadgeData;
}

type ScoreEntry = {
  id: string;
  name: string;
  fullName: string;
  score: number;
};

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return formatPlayerName(trimmed);
}

function twoWords(raw: unknown): string {
  const cleaned = cleanName(raw);
  if (!cleaned) return '';
  return formatPlayerNameTwoWords(cleaned);
}

function firstDefinedArray(...candidates: unknown[]): any[] {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function makeUniqueName(baseName: string, fullName: string, taken: Set<string>): string {
  const parts = fullName.split(/\s+/).filter(Boolean);

  if (!taken.has(baseName)) {
    taken.add(baseName);
    return baseName;
  }

  for (let i = 2; i < parts.length; i++) {
    const candidate = `${baseName} ${parts[i].charAt(0).toUpperCase()}.`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }

  let n = 2;
  while (taken.has(`${baseName} ${n}`)) n += 1;
  const fallback = `${baseName} ${n}`;
  taken.add(fallback);
  return fallback;
}

function resolveBest(arr: ScoreEntry[]): { names: string[]; score: number | null } {
  if (arr.length === 0) return { names: [], score: null };

  const sorted = [...arr].sort((a, b) => a.score - b.score);
  const minScore = sorted[0].score;
  const tied = sorted.filter((x) => x.score === minScore);

  const taken = new Set<string>();
  const names = tied.map((entry) => makeUniqueName(entry.name, entry.fullName, taken));
  return { names, score: minScore };
}

export function calcHighlightsFromSnapshot(s: any): ShareHighlights {
  const nameById = new Map<string, { short: string; full: string }>();

  (s?.balances || []).forEach((b: any) => {
    const id = String(b?.playerId || b?.profileId || '').trim();
    const full = cleanName(b?.playerName || b?.name);
    const short = twoWords(full);
    if (id && short) {
      nameById.set(id, { short, full: full || short });
    }
  });

  (s?.players || []).forEach((p: any) => {
    const idCandidates = [p?.id, p?.profileId, p?.playerId, p?.roundPlayerId]
      .filter(Boolean)
      .map((x) => String(x));
    const full = cleanName(p?.name || p?.playerName || p?.guestName || p?.guest_name || p?.displayName);
    const short = twoWords(full);
    if (!short) return;

    idCandidates.forEach((id) => {
      if (!nameById.has(id)) {
        nameById.set(id, { short, full: full || short });
      }
    });
  });

  const totalScores: ScoreEntry[] = [];
  const frontScores: ScoreEntry[] = [];
  const backScores: ScoreEntry[] = [];

  (s?.players || []).forEach((p: any) => {
    const idCandidates = [p?.id, p?.profileId, p?.playerId, p?.roundPlayerId]
      .filter(Boolean)
      .map((x) => String(x));

    const scoresObj = s?.scores || {};
    const playerScores = firstDefinedArray(
      ...idCandidates.map((id) => scoresObj?.[id]),
    );

    const valid = playerScores.filter((sc: any) => Number(sc?.strokes) > 0);
    if (valid.length === 0) return;

    const total = valid.reduce((sum: number, sc: any) => sum + Number(sc?.strokes || 0), 0);
    const front = valid
      .filter((sc: any) => Number(sc?.holeNumber) >= 1 && Number(sc?.holeNumber) <= 9)
      .reduce((sum: number, sc: any) => sum + Number(sc?.strokes || 0), 0);
    const back = valid
      .filter((sc: any) => Number(sc?.holeNumber) >= 10 && Number(sc?.holeNumber) <= 18)
      .reduce((sum: number, sc: any) => sum + Number(sc?.strokes || 0), 0);

    const primaryId = idCandidates[0] || `unknown-${Math.random()}`;
    const nameMeta = idCandidates.map((id) => nameById.get(id)).find(Boolean);
    const fallbackFull = cleanName(p?.name || p?.playerName || p?.guestName || p?.guest_name || p?.displayName);
    const fallbackShort = twoWords(fallbackFull);

    const shortName = nameMeta?.short || fallbackShort || 'Jugador';
    const fullName = nameMeta?.full || fallbackFull || shortName;

    if (total > 0) totalScores.push({ id: primaryId, name: shortName, fullName, score: total });
    if (front > 0) frontScores.push({ id: primaryId, name: shortName, fullName, score: front });
    if (back > 0) backScores.push({ id: primaryId, name: shortName, fullName, score: back });
  });

  const t = resolveBest(totalScores);
  const f = resolveBest(frontScores);
  const b = resolveBest(backScores);

  return {
    medalTotal: { label: 'Medal Gross Total', names: t.names, score: t.score },
    front9: { label: 'Mejor Front 9', names: f.names, score: f.score },
    back9: { label: 'Mejor Back 9', names: b.names, score: b.score },
  };
}

