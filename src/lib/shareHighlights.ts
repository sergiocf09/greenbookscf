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
  // ── Top bet: deduplicate by using only one direction per pair+type ──
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

  // ── Units: derive from ledger if available, else from markers ──
  let unitsTotal = 0;
  (s.ledger || []).forEach((entry: any) => {
    if (entry.betType === 'Unidades' && entry.amount > 0) {
      unitsTotal += entry.amount / (s.betConfig?.units?.valuePerPoint || 1);
    }
  });
  if (unitsTotal === 0) {
    Object.values(s.scores || {}).forEach((playerScores: any) => {
      (playerScores as any[]).forEach((sc: any) => {
        if (!sc.confirmed) return;
        const avgPar = (s.coursePar || 72) / 18;
        const toPar = (sc.strokes || 0) - avgPar;
        if (toPar <= -1) unitsTotal += Math.abs(Math.round(toPar));
        if (sc.markers?.sandyPar) unitsTotal += 1;
        if (sc.markers?.aquaPar) unitsTotal += 1;
        if (sc.markers?.holeOut) unitsTotal += 1;
      });
    });
  }

  // ── Manchas: count from confirmed markers ──
  let manchasTotal = 0;
  const manchaKeys = ['ladies','swingBlanco','retruje','trampa','dobleAgua',
    'dobleOB','par3GirMas3','moreliana'];
  Object.values(s.scores || {}).forEach((playerScores: any) => {
    (playerScores as any[]).forEach((sc: any) => {
      if (!sc.confirmed) return;
      manchaKeys.forEach((k: string) => { if (sc.markers?.[k]) manchasTotal++; });
      if ((sc.strokes || 0) >= 10) manchasTotal++;
      if ((sc.putts || 0) >= 4 || sc.markers?.cuatriput) manchasTotal++;
    });
  });

  return {
    topBet: topBetEntry
      ? { label: 'Apuesta más alta', value: `${topBetEntry[0]}  $${topBetEntry[1].toLocaleString()}` }
      : { label: 'Apuesta más alta', value: '—' },
    units: { label: 'Unidades totales', value: `${unitsTotal}` },
    manchas: { label: 'Manchas totales', value: `${manchasTotal}` },
  };
}

export function calcRoundHighlight(s: any): string {
  // Use manchas from markers for highlight text
  let birdiesTotal = 0, culebrasTotal = 0, manchasTotal = 0;
  const manchaKeys = ['ladies','swingBlanco','retruje','trampa','dobleAgua','dobleOB','par3GirMas3','moreliana'];
  (s.players || []).forEach((p: any) => {
    const playerScores = s.scores?.[p.id] || [];
    playerScores.forEach((sc: any) => {
      // Use avgPar since course holes may not be in snapshot
      const avgPar = Math.round((s.coursePar || 72) / 18);
      if (sc.strokes > 0 && sc.strokes - avgPar <= -1) birdiesTotal++;
      manchaKeys.forEach(k => { if (sc.markers?.[k]) manchasTotal++; });
      if (sc.putts >= 3) culebrasTotal++;
    });
  });
  if (birdiesTotal >= 6) return `¡${birdiesTotal} birdies en la ronda! 🐦`;
  if (culebrasTotal >= 8) return `¡${culebrasTotal} culebras! Día difícil en los greens 🐍`;
  if (manchasTotal >= 10) return `${manchasTotal} manchas en total — ronda de alto impacto ⚠️`;
  if (birdiesTotal >= 3) return `${birdiesTotal} birdies hoy — buena ronda 🐦`;
  if (culebrasTotal >= 4) return `${culebrasTotal} culebras en juego 🐍`;
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
