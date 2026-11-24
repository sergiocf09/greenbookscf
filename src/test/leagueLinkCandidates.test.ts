import { describe, it, expect } from 'vitest';
import {
  formatCandidatePlayersLabels,
  getEffectiveMinPlayers,
} from '@/lib/leagueLinkCandidates';
import { formatAuditActionText } from '@/lib/leagueRoundsAudit';

const identity = (s: string) => s;

describe('formatCandidatePlayersLabels', () => {
  it('formats 3 matched players with no guests', () => {
    const res = formatCandidatePlayersLabels(3, ['Ana', 'Luis', 'Pedro'], 0, identity);
    expect(res.matchedLabel).toBe('3 de la liga: Ana, Luis y Pedro');
    expect(res.guestsLabel).toBeNull();
  });

  it('formats singular (1 matched player) with no guests', () => {
    const res = formatCandidatePlayersLabels(1, ['Ana'], 0, identity);
    expect(res.matchedLabel).toBe('1 de la liga: Ana');
    expect(res.guestsLabel).toBeNull();
  });

  it('formats 2 matched players with 1 guest (singular)', () => {
    const res = formatCandidatePlayersLabels(2, ['Ana', 'Luis'], 1, identity);
    expect(res.matchedLabel).toBe('2 de la liga: Ana y Luis');
    expect(res.guestsLabel).toBe('+1 invitado (no cuenta para el mínimo)');
  });

  it('formats plural matched players with multiple guests (plural)', () => {
    const res = formatCandidatePlayersLabels(3, ['Ana', 'Luis', 'Pedro'], 2, identity);
    expect(res.matchedLabel).toBe('3 de la liga: Ana, Luis y Pedro');
    expect(res.guestsLabel).toBe('+2 invitados (no cuentan para el mínimo)');
  });

  it('handles empty or whitespace names cleanly', () => {
    const res = formatCandidatePlayersLabels(2, [' ', ''], 0, identity);
    expect(res.matchedLabel).toBe('2 de la liga');
    expect(res.guestsLabel).toBeNull();
  });

  it('supports custom translator for English output', () => {
    const en: Record<string, string> = {
      'de la liga': 'from the league',
      y: 'and',
      'invitado (no cuenta para el mínimo)': 'guest (does not count toward minimum)',
    };
    const res = formatCandidatePlayersLabels(3, ['Ana', 'Luis', 'Pedro'], 1, (s) => en[s] ?? s);
    expect(res.matchedLabel).toBe('3 from the league: Ana, Luis and Pedro');
    expect(res.guestsLabel).toBe('+1 guest (does not count toward minimum)');
  });
});

describe('getEffectiveMinPlayers', () => {
  it('defaults to 2 when unset or out of range and honors valid 1..12 values', () => {
    expect(getEffectiveMinPlayers(undefined)).toBe(2);
    expect(getEffectiveMinPlayers(null)).toBe(2);
    expect(getEffectiveMinPlayers(0)).toBe(2);
    expect(getEffectiveMinPlayers(13)).toBe(2);
    expect(getEffectiveMinPlayers(1)).toBe(1);
    expect(getEffectiveMinPlayers(4)).toBe(4);
    expect(getEffectiveMinPlayers('12')).toBe(12);
  });
});

describe('formatAuditActionText for league_rule_changed', () => {
  it('formats min_players_per_round rule change with old and new values', () => {
    expect(
      formatAuditActionText(
        {
          action: 'league_rule_changed',
          round_date: null,
          details: { key: 'min_players_per_round', old: 2, new: 3 },
        },
        identity,
      ),
    ).toBe('cambió el mínimo de jugadores por ronda de 2 a 3');
  });
});