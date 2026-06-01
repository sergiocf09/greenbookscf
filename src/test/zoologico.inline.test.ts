import { describe, it, expect } from 'vitest';
import { calculateZoologicoAnimalResult } from '@/lib/bets/zoologico';
import type { Player, ZoologicoBetConfig } from '@/types/golf';

const mkPlayer = (id: string, name: string, color = '#000'): Player => ({
  id,
  name,
  initials: name.slice(0, 2).toUpperCase(),
  color,
  handicap: 10,
});

describe('zoologico — inline-counter events flow to engine', () => {
  const players: Player[] = [
    mkPlayer('p1', 'Sergio'),
    mkPlayer('p2', 'Antonio'),
    mkPlayer('p3', 'Carlos'),
  ];

  it('counts events created via inline counters identically to dialog events', () => {
    // Sergio has 2 camellos on hole 1; Antonio has 1; Carlos has 0 → Carlos loses.
    const cfg: ZoologicoBetConfig = {
      enabled: true,
      enabledAnimals: ['camello', 'pez', 'gorila'],
      valuePerOccurrence: 25,
      events: [
        { id: 'e1', playerId: 'p1', holeNumber: 1, animalType: 'camello', count: 2, createdAt: new Date().toISOString() },
        { id: 'e2', playerId: 'p2', holeNumber: 1, animalType: 'camello', count: 1, createdAt: new Date().toISOString() },
      ],
    };

    const result = calculateZoologicoAnimalResult('camello', players, cfg, 1);
    expect(result).not.toBeNull();
    expect(result!.totalOccurrences).toBe(3);
    expect(result!.loser?.playerId).toBe('p3');
    // Per-occurrence value × total occurrences = total loss for the player with zero.
    expect(result!.loser?.totalLoss).toBeGreaterThan(0);
  });

  it('returns null when animal is not enabled', () => {
    const cfg: ZoologicoBetConfig = {
      enabled: true,
      enabledAnimals: ['pez'],
      valuePerOccurrence: 25,
      events: [{ id: 'e1', playerId: 'p1', holeNumber: 1, animalType: 'camello', count: 1, createdAt: new Date().toISOString() }],
    };
    expect(calculateZoologicoAnimalResult('camello', players, cfg, 1)).toBeNull();
  });
});
