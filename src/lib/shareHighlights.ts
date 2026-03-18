/**
 * Shared logic for computing share-image highlights and zapato events from a round snapshot.
 */

export interface ShareHighlights {
  topBet: { label: string; value: string };
  units: { label: string; value: string };
  manchas: { label: string; value: string };
}

export interface ZapatoEvent {
  type: 'Oyes' | 'Skins';
  winnerId: string;
  loserId: string;
  winnerName: string;
  loserName: string;
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

  // ── Badge 2: Best Front 9 gross score ──
  let bestFront: { name: string; score: number } | null = null;
  (s.players || []).forEach((p: any) => {
    const playerScores: any[] = s.scores?.[p.id] || [];
    const frontScore = playerScores
      .filter((sc: any) => sc.confirmed && sc.holeNumber >= 1 && sc.holeNumber <= 9 && sc.strokes > 0)
      .reduce((sum: number, sc: any) => sum + sc.strokes, 0);
    if (frontScore > 0 && (!bestFront || frontScore < bestFront.score)) {
      const nameParts = (p.name || '').trim().split(/\s+/);
      bestFront = { name: nameParts[0] || p.name, score: frontScore };
    }
  });

  // ── Badge 3: Best Back 9 gross score ──
  let bestBack: { name: string; score: number } | null = null;
  (s.players || []).forEach((p: any) => {
    const playerScores: any[] = s.scores?.[p.id] || [];
    const backScore = playerScores
      .filter((sc: any) => sc.confirmed && sc.holeNumber >= 10 && sc.holeNumber <= 18 && sc.strokes > 0)
      .reduce((sum: number, sc: any) => sum + sc.strokes, 0);
    if (backScore > 0 && (!bestBack || backScore < bestBack.score)) {
      const nameParts = (p.name || '').trim().split(/\s+/);
      bestBack = { name: nameParts[0] || p.name, score: backScore };
    }
  });

  return {
    topBet: topBetEntry
      ? { label: 'Mayor apuesta', value: `${topBetEntry[0]}  $${topBetEntry[1].toLocaleString()}` }
      : { label: 'Mayor apuesta', value: '—' },
    units: bestFront
      ? { label: 'Mejor Front 9', value: `${bestFront.name}  ${bestFront.score}` }
      : { label: 'Mejor Front 9', value: '—' },
    manchas: bestBack
      ? { label: 'Mejor Back 9', value: `${bestBack.name}  ${bestBack.score}` }
      : { label: 'Mejor Back 9', value: '—' },
  };
}

export function calcRoundHighlight(s: any): string {
  // Find the player with the most units (from ledger + markers)
  let topUnitsPlayer = '';
  let topUnitsCount = 0;

  (s.players || []).forEach((p: any) => {
    const playerScores: any[] = s.scores?.[p.id] || [];
    let units = 0;

    // Count from ledger: entries where this player won units
    (s.ledger || []).forEach((entry: any) => {
      if (entry.betType !== 'Unidades') return;
      if (entry.amount <= 0) return;
      if (entry.toPlayerId === p.id) {
        units += 1;
      }
    });

    // Count from markers
    playerScores.forEach((sc: any) => {
      if (!sc.confirmed) return;
      if (sc.markers?.sandyPar) units += 1;
      if (sc.markers?.aquaPar) units += 1;
      if (sc.markers?.holeOut) units += 1;
    });

    if (units > topUnitsCount) {
      topUnitsCount = units;
      topUnitsPlayer = (p.name || '').trim();
    }
  });

  if (topUnitsPlayer && topUnitsCount > 0) {
    return `⭐ Mayor en unidades: ${topUnitsPlayer}`;
  }
  return 'Ronda completada en GreenBook 🏌️';
}

export function detectZapatos(s: any): ZapatoEvent[] {
  const events: ZapatoEvent[] = [];
  const seen = new Set<string>();
  (s.ledger || []).forEach((entry: any) => {
    if (entry.amount <= 0) return;
    // Oyeses zapato
    if (entry.betType === 'Oyes' && entry.description?.includes('Zapato')) {
      const pk = `oyes::${entry.toPlayerId}::${entry.fromPlayerId}`;
      if (!seen.has(pk)) {
        seen.add(pk);
        events.push({ type: 'Oyes', winnerId: entry.toPlayerId, loserId: entry.fromPlayerId, winnerName: entry.toPlayerName || '', loserName: entry.fromPlayerName || '' });
      }
    }
    // Skins zapato (description includes "x2")
    if ((entry.betType === 'Skins Front' || entry.betType === 'Skins Back') && entry.description?.includes('x2')) {
      const pk = `skins::${entry.betType}::${entry.toPlayerId}::${entry.fromPlayerId}`;
      if (!seen.has(pk)) {
        seen.add(pk);
        events.push({ type: 'Skins', winnerId: entry.toPlayerId, loserId: entry.fromPlayerId, winnerName: entry.toPlayerName || '', loserName: entry.fromPlayerName || '' });
      }
    }
  });
  return events;
}
