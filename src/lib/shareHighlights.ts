/**
 * Shared logic for computing share-image highlights from a round snapshot.
 * Three badges: Best Medal Gross Total, Best Front 9, Best Back 9.
 */

export interface ShareHighlights {
  medalTotal: { label: string; value: string };
  front9: { label: string; value: string };
  back9: { label: string; value: string };
}

function formatBestPlayers(players: { name: string; score: number }[]): string {
  if (players.length === 0) return '—';
  if (players.length === 1) return `${players[0].name}  ${players[0].score}`;
  return `${players.map(p => p.name).join(', ')}  ${players[0].score}`;
}

function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || name;
}

export function calcHighlightsFromSnapshot(s: any): ShareHighlights {
  const totalScores: { name: string; score: number }[] = [];
  const frontScores: { name: string; score: number }[] = [];
  const backScores: { name: string; score: number }[] = [];

  (s.players || []).forEach((p: any) => {
    const playerScores: any[] = s.scores?.[p.id] || [];
    const confirmed = playerScores.filter((sc: any) => sc.confirmed && sc.strokes > 0);

    const total = confirmed.reduce((sum: number, sc: any) => sum + sc.strokes, 0);
    const front = confirmed
      .filter((sc: any) => sc.holeNumber >= 1 && sc.holeNumber <= 9)
      .reduce((sum: number, sc: any) => sum + sc.strokes, 0);
    const back = confirmed
      .filter((sc: any) => sc.holeNumber >= 10 && sc.holeNumber <= 18)
      .reduce((sum: number, sc: any) => sum + sc.strokes, 0);

    const name = firstName(p.name);
    if (total > 0) totalScores.push({ name, score: total });
    if (front > 0) frontScores.push({ name, score: front });
    if (back > 0) backScores.push({ name, score: back });
  });

  const best = (arr: { name: string; score: number }[]) => {
    arr.sort((a, b) => a.score - b.score);
    if (arr.length === 0) return [];
    const min = arr[0].score;
    return arr.filter(x => x.score === min);
  };

  return {
    medalTotal: { label: 'Medal Gross', value: formatBestPlayers(best(totalScores)) },
    front9: { label: 'Mejor Front 9', value: formatBestPlayers(best(frontScores)) },
    back9: { label: 'Mejor Back 9', value: formatBestPlayers(best(backScores)) },
  };
}
