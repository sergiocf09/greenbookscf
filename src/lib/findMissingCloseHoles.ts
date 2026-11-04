/**
 * Lists players that still have active holes without a confirmed, real stroke count.
 * Closing must never silently persist placeholder (par) scores as confirmed.
 */
export interface MissingHolesEntry {
  playerId: string;
  name: string;
  holes: number[];
}

export function findMissingCloseHoles(
  players: { id: string; name: string }[],
  scores: Map<string, { holeNumber: number; strokes: number | null | undefined; confirmed?: boolean }[]>,
  activeHoles: Set<number>,
): MissingHolesEntry[] {
  const out: MissingHolesEntry[] = [];
  for (const p of players) {
    const list = scores.get(p.id) || [];
    const ok = new Set(
      list
        .filter((s) => s.confirmed && typeof s.strokes === 'number' && Number.isFinite(s.strokes))
        .map((s) => s.holeNumber),
    );
    const holes = Array.from(activeHoles).filter((h) => !ok.has(h)).sort((a, b) => a - b);
    if (holes.length) out.push({ playerId: p.id, name: p.name, holes });
  }
  return out;
}
