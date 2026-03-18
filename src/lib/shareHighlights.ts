/**
 * Shared logic for computing share-image highlights from a round snapshot.
 * Three badges: Best Medal Gross Total, Best Front 9, Best Back 9.
 */

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

function firstName(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  return parts[0] || name;
}

export function calcHighlightsFromSnapshot(s: any): ShareHighlights {
  const totalScores: { name: string; score: number }[] = [];
  const frontScores: { name: string; score: number }[] = [];
  const backScores: { name: string; score: number }[] = [];

  (s.players || []).forEach((p: any) => {
    const playerScores: any[] = s.scores?.[p.id] || [];
    const valid = playerScores.filter((sc: any) => sc.strokes > 0);

    const total = valid.reduce((sum: number, sc: any) => sum + sc.strokes, 0);
    const front = valid
      .filter((sc: any) => sc.holeNumber >= 1 && sc.holeNumber <= 9)
      .reduce((sum: number, sc: any) => sum + sc.strokes, 0);
    const back = valid
      .filter((sc: any) => sc.holeNumber >= 10 && sc.holeNumber <= 18)
      .reduce((sum: number, sc: any) => sum + sc.strokes, 0);

    const name = firstName(p.name);
    if (total > 0) totalScores.push({ name, score: total });
    if (front > 0) frontScores.push({ name, score: front });
    if (back > 0) backScores.push({ name, score: back });
  });

  const best = (arr: { name: string; score: number }[]): { names: string[]; score: number | null } => {
    arr.sort((a, b) => a.score - b.score);
    if (arr.length === 0) return { names: [], score: null };
    const min = arr[0].score;
    return { names: arr.filter(x => x.score === min).map(x => x.name), score: min };
  };

  const t = best(totalScores);
  const f = best(frontScores);
  const b = best(backScores);

  return {
    medalTotal: { label: 'Medal Gross', names: t.names, score: t.score },
    front9: { label: 'Mejor Front 9', names: f.names, score: f.score },
    back9: { label: 'Mejor Back 9', names: b.names, score: b.score },
  };
}
