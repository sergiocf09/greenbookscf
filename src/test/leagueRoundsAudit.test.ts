import { describe, it, expect } from 'vitest';
import phrasesEn from '@/i18n/locales/phrases.en.json';
import {
  type LeagueAuditEntry,
  formatAuditActionText,
  formatAuditEntryLine,
  formatRoundDateDDMMYYYY,
  getReasonNotCountedText,
} from '@/lib/leagueRoundsAudit';

const identity = (s: string) => s;
const toEn = (s: string) => (phrasesEn as Record<string, string>)[s] ?? s;

describe('getReasonNotCountedText', () => {
  it('maps each known reason_not_counted code to Spanish copy', () => {
    expect(getReasonNotCountedText('round_not_completed', identity)).toBe(
      'La ronda aún no está cerrada',
    );
    expect(getReasonNotCountedText('no_player_with_9_holes', identity)).toBe(
      'Ningún jugador tiene al menos 9 hoyos registrados',
    );
    expect(getReasonNotCountedText('no_participant_matched', identity)).toBe(
      'Ningún participante de la liga jugó esta ronda',
    );
  });

  it('falls back safely on null or unknown reason codes', () => {
    expect(getReasonNotCountedText(null, identity)).toBe('No cumple los requisitos de la liga');
    expect(getReasonNotCountedText('unknown_code', identity)).toBe(
      'No cumple los requisitos de la liga',
    );
  });

  it('translates every reason code to English using phrases.en.json', () => {
    expect(getReasonNotCountedText('round_not_completed', toEn)).toBe('Round is not closed yet');
    expect(getReasonNotCountedText('no_player_with_9_holes', toEn)).toBe(
      'No player has at least 9 holes recorded',
    );
    expect(getReasonNotCountedText('no_participant_matched', toEn)).toBe(
      'No league participant played this round',
    );
  });
});

describe('formatRoundDateDDMMYYYY', () => {
  it('formats YYYY-MM-DD dates without timezone shift', () => {
    expect(formatRoundDateDDMMYYYY('2026-10-12')).toBe('12/10/2026');
    expect(formatRoundDateDDMMYYYY(null)).toBe('—');
  });
});

describe('formatAuditActionText & formatAuditEntryLine', () => {
  const baseEntry: LeagueAuditEntry = {
    id: 'audit-1',
    leaderboard_id: 'lb-1',
    actor_profile_id: 'prof-1',
    actor_name: 'Sergio Cruz',
    action: 'round_linked',
    round_id: 'round-1',
    round_date: '2026-10-12',
    details: {},
    created_at: new Date(2026, 9, 12, 14, 35).toISOString(),
  };

  it('formats round_unlinked with and without reason', () => {
    expect(
      formatAuditEntryLine(
        {
          ...baseEntry,
          action: 'round_unlinked',
          details: { reason: 'Ronda de práctica', scores_removed: 4 },
        },
        identity,
      ),
    ).toBe('12/10/2026 14:35 · Sergio Cruz · desvinculó la ronda del 12/10/2026 (motivo: Ronda de práctica)');

    expect(
      formatAuditActionText(
        {
          action: 'round_unlinked',
          round_date: '2026-10-12',
          details: { reason: '   ', scores_removed: 2 },
        },
        identity,
      ),
    ).toBe('desvinculó la ronda del 12/10/2026');
  });

  it('formats round_linked, standings_recalculated, league_reopened, and league_closed', () => {
    expect(formatAuditActionText(baseEntry, identity)).toBe('ligó la ronda del 12/10/2026');
    expect(
      formatAuditActionText(
        { action: 'standings_recalculated', round_date: null, details: { rounds_count: 3 } },
        identity,
      ),
    ).toBe('recalculó los standings');
    expect(
      formatAuditActionText({ action: 'league_reopened', round_date: null, details: {} }, identity),
    ).toBe('reabrió la liga');
    expect(
      formatAuditActionText({ action: 'league_closed', round_date: null, details: {} }, identity),
    ).toBe('cerró la liga');
  });

  it('uses Sistema when actor_name is empty and translates to English', () => {
    expect(
      formatAuditEntryLine(
        { ...baseEntry, actor_name: '', action: 'league_closed', round_date: null },
        toEn,
      ),
    ).toBe('12/10/2026 14:35 · System · closed the league');
  });
});