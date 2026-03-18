/**
 * Shared logic for computing share-image highlights from a round snapshot.
 */

export interface ShareHighlights {
  topBet: { label: string; value: string };
  units: { label: string; value: string };
  manchas: { label: string; value: string };
}

export function calcHighlightsFromSnapshot(s: any): ShareHighlights {
  // ── Badge 1: Top bet — deduplicate by using only one direction per pair+type ──
  const betTotals = new Map<string, number>();
  const processedPairs = new Set<string>();
  (s.ledger || []).forEach((entry: any) => {
    if (entry.amount <= 0) return;
    const pairKey = `${entry.toPlayerId}::${entry.fromPlayerId}::${entry.betType}`;
    if (processedPairs.has(pairKey)) return;
    processedPairs.add(pairKey);
    const key = entry.betType
      .replace(/ Front.*| Back.*| Total.*| Match.*| Hoyo.*/g, '').trim();
    betTotals.set(key, (betTotals.get(key) || 0) + entry.amount);
  });
  const topBetEntry = Array.from(betTotals.entries())
    .sort((a, b) => b[1] - a[1])[0];

  // ── Badge 2: Best Front 9 gross score (ties included) ──
  const frontScores: { name: string; score: number }[] = [];
  (s.players || []).forEach((p: any) => {
    const playerScores: any[] = s.scores?.[p.id] || [];
    const frontScore = playerScores
      .filter((sc: any) => sc.confirmed && sc.holeNumber >= 1 && sc.holeNumber <= 9 && sc.strokes > 0)
      .reduce((sum: number, sc: any) => sum + sc.strokes, 0);
    if (frontScore > 0) {
      const nameParts = (p.name || '').trim().split(/\s+/);
      frontScores.push({ name: nameParts[0] || p.name, score: frontScore });
    }
  });
  frontScores.sort((a, b) => a.score - b.score);
  const bestFrontScore = frontScores.length > 0 ? frontScores[0].score : 0;
  const bestFrontPlayers = frontScores.filter(f => f.score === bestFrontScore);

  // ── Badge 3: Best Back 9 gross score (ties included) ──
  const backScores: { name: string; score: number }[] = [];
  (s.players || []).forEach((p: any) => {
    const playerScores: any[] = s.scores?.[p.id] || [];
    const backScore = playerScores
      .filter((sc: any) => sc.confirmed && sc.holeNumber >= 10 && sc.holeNumber <= 18 && sc.strokes > 0)
      .reduce((sum: number, sc: any) => sum + sc.strokes, 0);
    if (backScore > 0) {
      const nameParts = (p.name || '').trim().split(/\s+/);
      backScores.push({ name: nameParts[0] || p.name, score: backScore });
    }
  });
  backScores.sort((a, b) => a.score - b.score);
  const bestBackScore = backScores.length > 0 ? backScores[0].score : 0;
  const bestBackPlayers = backScores.filter(b => b.score === bestBackScore);

  const formatBestPlayers = (players: { name: string; score: number }[]): string => {
    if (players.length === 0) return '—';
    if (players.length === 1) return `${players[0].name}  ${players[0].score}`;
    return `${players.map(p => p.name).join(', ')}  ${players[0].score}`;
  };

  return {
    topBet: topBetEntry
      ? { label: 'Mayor apuesta', value: `${topBetEntry[0]}  $${topBetEntry[1].toLocaleString()}` }
      : { label: 'Mayor apuesta', value: '—' },
    units: { label: 'Mejor Front 9', value: formatBestPlayers(bestFrontPlayers) },
    manchas: { label: 'Mejor Back 9', value: formatBestPlayers(bestBackPlayers) },
  };
}

/**
 * Calculate the round highlight: player(s) with most positive units.
 * Uses betConfig.course.holes from snapshot for accurate par-per-hole calculation.
 */
export function calcRoundHighlight(s: any): string {
  const holes: any[] = s.betConfig?.course?.holes || [];

  const playerUnits: { name: string; total: number }[] = [];

  (s.players || []).forEach((p: any) => {
    const playerScores: any[] = s.scores?.[p.id] || [];
    let units = 0;

    playerScores.forEach((sc: any) => {
      if (!sc.confirmed || !sc.strokes || sc.strokes <= 0) return;
      const holePar = holes[sc.holeNumber - 1]?.par || 4;
      const toPar = sc.strokes - holePar;

      // Score-based units (same logic as GroupBetsCard / units.ts)
      if (toPar <= -3) units += 3;
      else if (toPar === -2) units += 2;
      else if (toPar === -1) units += 1;

      // Marker-based units
      if (sc.markers?.sandyPar) units += 1;
      if (sc.markers?.aquaPar) units += 1;
      if (sc.markers?.holeOut) units += 1;
    });

    if (units > 0) {
      const nameParts = (p.name || '').trim().split(/\s+/);
      playerUnits.push({ name: nameParts[0] || p.name, total: units });
    }
  });

  if (playerUnits.length === 0) {
    return 'Ronda completada en GreenBook 🏌️';
  }

  playerUnits.sort((a, b) => b.total - a.total);
  const topTotal = playerUnits[0].total;
  const topPlayers = playerUnits.filter(p => p.total === topTotal);

  if (topPlayers.length === 1) {
    return `⭐ Mayor en unidades: ${topPlayers[0].name} (${topTotal})`;
  }
  return `⭐ Mayor en unidades: ${topPlayers.map(p => p.name).join(', ')} (${topTotal})`;
}
