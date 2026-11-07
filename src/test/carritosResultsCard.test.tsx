import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CarritosResultsCard } from '@/components/bets/CarritosResultsCard';
import type { CarritosResultsCardProps } from '@/components/bets/CarritosResultsCard';
import type { Player } from '@/types/golf';

const players: Player[] = [
  { id: 'a', name: 'Ana Uno', initials: 'AU', color: '', handicap: 0 },
  { id: 'b', name: 'Beto Dos', initials: 'BD', color: '', handicap: 0 },
  { id: 'c', name: 'Caro Tres', initials: 'CT', color: '', handicap: 0 },
  { id: 'd', name: 'Dani Cuatro', initials: 'DC', color: '', handicap: 0 },
];

type Detail = NonNullable<CarritosResultsCardProps['results']['holeDetailsFront'][number]>;
const detail = (holeNumber: number, over: Partial<Detail> = {}): Detail => ({
  holeNumber,
  grossA1: 4, hcpA1: 0, netA1: 4,
  grossA2: 5, hcpA2: 0, netA2: 5,
  grossB1: 5, hcpB1: 0, netB1: 5,
  grossB2: 5, hcpB2: 0, netB2: 5,
  pointsA: 0, pointsB: 0,
  ...over,
});

const nulls = () => Array.from({ length: 9 }, () => null);

/** Medal por Parejas, Bola Baja: A 36 vs B 38 on the Front; hole 1 won by A with the half stroke. */
const strokesResults = (): CarritosResultsCardProps['results'] => ({
  teamA: ['a', 'b'],
  teamB: ['c', 'd'],
  scoringType: 'lowBall',
  method: 'strokes',
  netByHoleFront: [1, ...Array.from({ length: 8 }, () => null)],
  netByHoleBack: nulls(),
  holeDetailsFront: [detail(1, { hcpA1: 0.5, teamScoreA: 4, teamScoreB: 5, halfAppliedTeam: 'A' }), ...Array.from({ length: 8 }, () => null)],
  holeDetailsBack: nulls(),
  pointsAFront: 0, pointsBFront: 0, pointsABack: 0, pointsBBack: 0, pointsATotal: 0, pointsBTotal: 0,
  pointsAAccumulated: 0, pointsBAccumulated: 0,
  scoreAFront: 36, scoreBFront: 38, scoreABack: 40, scoreBBack: 40, scoreATotal: 76, scoreBTotal: 78,
  winnerFront: 'A', winnerBack: 'tie', winnerTotal: 'A',
  moneyAFront: 100, moneyABack: 0, moneyATotal: 100,
  moneyA: 200, moneyB: -200,
  amount: 300, frontAmount: 100, backAmount: 100, totalAmount: 100,
  id: 'm1',
});

const pointsResults = (): CarritosResultsCardProps['results'] => ({
  teamA: ['a', 'b'],
  teamB: ['c', 'd'],
  scoringType: 'all',
  netByHoleFront: [2, ...Array.from({ length: 8 }, () => null)],
  netByHoleBack: nulls(),
  holeDetailsFront: [detail(1, { pointsA: 2, pointsB: 0, lowBallWinner: 'A', highBallWinner: 'tie', combinedWinner: 'A' }), ...Array.from({ length: 8 }, () => null)],
  holeDetailsBack: nulls(),
  pointsAFront: 2, pointsBFront: 0, pointsABack: 0, pointsBBack: 0, pointsATotal: 2, pointsBTotal: 0,
  pointsAAccumulated: 2, pointsBAccumulated: 0,
  moneyA: 200, moneyB: -200,
  amount: 300, frontAmount: 100, backAmount: 100, totalAmount: 100,
  id: 'c1',
});

afterEach(cleanup);

describe('CarritosResultsCard — Medal por Parejas', () => {
  it('titles the card "Medal por Parejas" with the modality and accumulated strokes', () => {
    render(<CarritosResultsCard results={strokesResults()} players={players} basePlayerId="a" />);
    expect(screen.getByText('Medal por Parejas')).toBeInTheDocument();
    expect(screen.getByText('Bola Baja · golpes acumulados')).toBeInTheDocument();
    expect(screen.getByText('F9 36 vs 38 (+2)')).toBeInTheDocument();
    expect(screen.getByText('B9 40 vs 40 (0)')).toBeInTheDocument();
    expect(screen.getByText('T 76 vs 78 (+2)')).toBeInTheDocument();
    expect(screen.getByText('+$200')).toBeInTheDocument();
  });

  it('colors the leading segment green, the tied one gray', () => {
    render(<CarritosResultsCard results={strokesResults()} players={players} basePlayerId="a" />);
    expect(screen.getByText('F9 36 vs 38 (+2)').className).toContain('text-green-600');
    expect(screen.getByText('B9 40 vs 40 (0)').className).toContain('text-muted-foreground');
  });

  it('inverts the perspective when the base player is on team B', () => {
    render(<CarritosResultsCard results={strokesResults()} players={players} basePlayerId="c" />);
    const front = screen.getByText('F9 38 vs 36 (-2)');
    expect(front.className).toContain('text-destructive');
    expect(screen.getByText('T 78 vs 76 (-2)')).toBeInTheDocument();
    expect(screen.getByText('-$200')).toBeInTheDocument();
  });

  it('shows only F9 on nine-hole rounds', () => {
    render(<CarritosResultsCard results={strokesResults()} players={players} basePlayerId="a" roundHoles={9} />);
    expect(screen.getByText('F9 36 vs 38 (+2)')).toBeInTheDocument();
    expect(screen.queryByText(/^B9 /)).toBeNull();
    expect(screen.queryByText(/^T 76/)).toBeNull();
  });

  it('marks the half stroke in the hole popover', () => {
    render(<CarritosResultsCard results={strokesResults()} players={players} basePlayerId="a" />);
    fireEvent.click(screen.getByRole('button', { name: /Ver detalle/i }));
    fireEvent.click(screen.getAllByText('+1')[0]);
    expect(screen.getByText('Medio golpe aplicado: −1')).toBeInTheDocument();
  });

  it('a hole that does not count shows "–"', () => {
    render(<CarritosResultsCard results={strokesResults()} players={players} basePlayerId="a" />);
    fireEvent.click(screen.getByRole('button', { name: /Ver detalle/i }));
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(8);
  });
});

describe('CarritosResultsCard — points (Carritos) unchanged', () => {
  it('keeps the Carritos title, point rows and no stroke totals', () => {
    render(<CarritosResultsCard results={pointsResults()} players={players} basePlayerId="a" />);
    expect(screen.getByText('Carritos (Equipos)')).toBeInTheDocument();
    expect(screen.getByText('F9 +2')).toBeInTheDocument();
    expect(screen.getByText('LowBall + HighBall + Suma')).toBeInTheDocument();
    expect(screen.queryByText(/golpes acumulados/)).toBeNull();
  });

  it('renders identically whether or not stroke-only fields are present when method is points', () => {
    const { container: plain } = render(<CarritosResultsCard results={pointsResults()} players={players} basePlayerId="a" />);
    const normalize = (html: string) => html.replace(/radix-:[a-z0-9]+:/g, 'radix-id');
    const plainHtml = normalize(plain.innerHTML);
    cleanup();
    const withExtras = { ...pointsResults(), method: 'points' as const, scoreAFront: 36, scoreBFront: 38, scoreATotal: 70, scoreBTotal: 72 };
    const { container: extra } = render(<CarritosResultsCard results={withExtras} players={players} basePlayerId="a" />);
    expect(normalize(extra.innerHTML)).toBe(plainHtml);
  });
});
