import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// No backend in tests: every query resolves empty and nothing is written.
vi.mock('@/integrations/supabase/client', () => {
  const result = { data: [], error: null };
  const chain: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (res: any) => Promise.resolve(result).then(res) : chain),
    apply: () => chain,
  });
  return {
    supabase: {
      from: () => chain,
      rpc: () => chain,
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
      auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    },
  };
});

import { BetDashboard } from '@/components/bets/BetDashboard';
import { defaultBetConfig } from '@/components/setup/bets/defaultBetConfig';
import { generateRoundSnapshot } from '@/lib/roundSnapshot';
import { defaultMarkerState, type BetConfig, type BetSummary, type GolfCourse, type Player, type PlayerScore } from '@/types/golf';

const course: GolfCourse = {
  id: 'c', name: 'Test', location: '',
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, handicapIndex: i + 1 })),
};
const players: Player[] = [
  { id: 'a', name: 'Ana Uno', initials: 'AU', color: '', handicap: 0 },
  { id: 'b', name: 'Beto Dos', initials: 'BD', color: '', handicap: 0 },
  { id: 'c', name: 'Caro Tres', initials: 'CT', color: '', handicap: 0 },
  { id: 'd', name: 'Dani Cuatro', initials: 'DC', color: '', handicap: 0 },
];
// Bola Baja: team A (a+b) makes 4 every hole → F9 36, B9 36.
// Team B (c+d): c makes 4 except holes 8-9 (5) → F9 38, B9 36. Total 72 vs 74.
const gross = (pid: string, hole: number) =>
  pid === 'a' ? 4 : pid === 'c' ? (hole === 8 || hole === 9 ? 5 : 4) : 5;
const scores = new Map<string, PlayerScore[]>(players.map(p => [p.id, course.holes.map(h => ({
  playerId: p.id, holeNumber: h.number, strokes: gross(p.id, h.number), putts: 2,
  netScore: gross(p.id, h.number), strokesReceived: 0, confirmed: true, markers: { ...defaultMarkerState },
}))]));

const config: BetConfig = {
  ...defaultBetConfig,
  carritos: { ...defaultBetConfig.carritos, enabled: true },
  carritosTeams: [{
    id: 'medal-1', teamA: ['a', 'b'], teamB: ['c', 'd'],
    frontAmount: 100, backAmount: 100, totalAmount: 100,
    scoringType: 'lowBall', scoringMethod: 'strokes',
    teamHandicaps: { a: 0, b: 0, c: 0, d: 0 }, enabled: true,
  }],
};

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

afterEach(cleanup);

describe('Medal por Parejas in the bets dashboard', () => {
  it('live card, emitted ledger and closed-round history agree', async () => {
    let emitted: BetSummary[] = [];
    wrap(
      <BetDashboard
        players={players}
        scores={scores}
        betConfig={config}
        course={course}
        basePlayerId="a"
        confirmedHoles={new Set(course.holes.map(h => h.number))}
        onBetSummariesChange={(s) => { emitted = s; }}
      />,
    );

    expect(await screen.findByText('Medal por Parejas 1')).toBeInTheDocument();
    expect(screen.getByText('F9 36 vs 38 (+2)')).toBeInTheDocument();
    expect(screen.getByText('B9 36 vs 36 (0)')).toBeInTheDocument();
    expect(screen.getByText('T 72 vs 74 (+2)')).toBeInTheDocument();

    await waitFor(() => expect(emitted.some(s => s.betId === 'medal-1')).toBe(true));
    const carritos = emitted.filter(s => s.betId === 'medal-1');
    const net = (pid: string) => carritos.filter(s => s.playerId === pid).reduce((sum, s) => sum + s.amount, 0);
    // Front $100 + Total $100 won by a+b; Back tied → not paid. Each loser pays half to each winner.
    expect([net('a'), net('b'), net('c'), net('d')]).toEqual([200, 200, -200, -200]);
    expect(carritos.filter(s => s.playerId === 'a' && s.vsPlayer === 'c').reduce((x, s) => x + s.amount, 0)).toBe(100);
    expect(carritos.some(s => s.segment === 'back')).toBe(false);

    // Close: snapshot balances come from the emitted ledger, counted once.
    const snapshot = generateRoundSnapshot('r1', course, players, scores, config, emitted, 'blue', 1, '2026-11-07');
    const total = (pid: string) => snapshot.balances.find(b => b.playerId === pid)?.totalNet;
    expect([total('a'), total('b'), total('c'), total('d')]).toEqual([200, 200, -200, -200]);

    cleanup();

    // History renders from the snapshot and shows the same card and amounts.
    wrap(
      <BetDashboard
        players={players}
        scores={scores}
        betConfig={snapshot.betConfig}
        course={course}
        basePlayerId="a"
        confirmedHoles={new Set(course.holes.map(h => h.number))}
        snapshotBalances={snapshot.balances}
        snapshotLedger={snapshot.ledger}
        snapshotPairBreakdowns={snapshot.pairBreakdowns}
        snapshotPairSegmentResults={snapshot.pairSegmentResults}
      />,
    );
    expect(await screen.findByText('Medal por Parejas 1')).toBeInTheDocument();
    expect(screen.getByText('F9 36 vs 38 (+2)')).toBeInTheDocument();
    expect(screen.getAllByText('+$200').length).toBeGreaterThan(0);
  });

  it('a disabled Medal por Parejas is not emitted and the card shows it as cancelled', async () => {
    let emitted: BetSummary[] = [];
    wrap(
      <BetDashboard
        players={players}
        scores={scores}
        betConfig={{ ...config, disabledTeamBetIds: ['medal-1'] }}
        course={course}
        basePlayerId="a"
        confirmedHoles={new Set(course.holes.map(h => h.number))}
        onBetSummariesChange={(s) => { emitted = s; }}
      />,
    );
    expect(await screen.findByText('Medal por Parejas 1')).toBeInTheDocument();
    await waitFor(() => expect(emitted).toBeDefined());
    expect(emitted.some(s => s.betId === 'medal-1')).toBe(false);
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });
});
