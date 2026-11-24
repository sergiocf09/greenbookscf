import { format } from 'date-fns';
import { trs } from '@/i18n/tr';

export type ReasonNotCounted =
  | 'round_not_completed'
  | 'no_player_with_9_holes'
  | 'no_participant_matched'
  | null;

export type LeagueAuditAction =
  | 'round_linked'
  | 'round_unlinked'
  | 'standings_recalculated'
  | 'league_reopened'
  | 'league_closed';

export interface LeagueLinkedRound {
  round_id: string;
  date: string;
  status: string;
  course_name: string;
  organizer_name: string;
  linked_by_name: string;
  linked_at: string;
  players_total: number;
  players_counted: number;
  counts_in_standings: boolean;
  reason_not_counted: ReasonNotCounted;
}

export interface LeagueAuditEntry {
  id: string;
  leaderboard_id: string;
  actor_profile_id: string | null;
  actor_name: string;
  action: LeagueAuditAction | string;
  round_id: string | null;
  round_date: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function getReasonNotCountedText(
  reason: string | null | undefined,
  translate: (s: string) => string = trs,
): string {
  switch (reason) {
    case 'round_not_completed':
      return translate('La ronda aún no está cerrada');
    case 'no_player_with_9_holes':
      return translate('Ningún jugador tiene al menos 9 hoyos registrados');
    case 'no_participant_matched':
      return translate('Ningún participante de la liga jugó esta ronda');
    default:
      return translate('No cumple los requisitos de la liga');
  }
}

export function formatRoundDateDDMMYYYY(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!match) return dateStr;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatAuditDate(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'dd/MM/yyyy');
}

export function formatAuditTimestamp(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'dd/MM/yyyy HH:mm');
}

export function formatAuditActionText(
  entry: Pick<LeagueAuditEntry, 'action' | 'round_date' | 'details'>,
  translate: (s: string) => string = trs,
): string {
  const dateLabel = entry.round_date ? formatRoundDateDDMMYYYY(entry.round_date) : null;

  switch (entry.action) {
    case 'round_linked':
      return dateLabel
        ? `${translate('ligó la ronda del')} ${dateLabel}`
        : translate('ligó una ronda');
    case 'round_unlinked': {
      const base = dateLabel
        ? `${translate('desvinculó la ronda del')} ${dateLabel}`
        : translate('desvinculó una ronda');
      const rawReason = entry.details?.['reason'];
      const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
      return reason ? `${base} (${translate('motivo')}: ${reason})` : base;
    }
    case 'standings_recalculated':
      return translate('recalculó los standings');
    case 'league_reopened':
      return translate('reabrió la liga');
    case 'league_closed':
      return translate('cerró la liga');
    default:
      return entry.action;
  }
}

export function formatAuditEntryLine(
  entry: LeagueAuditEntry,
  translate: (s: string) => string = trs,
): string {
  const when = formatAuditTimestamp(entry.created_at);
  const actor = entry.actor_name?.trim() || translate('Sistema');
  const actionText = formatAuditActionText(entry, translate);
  return `${when} · ${actor} · ${actionText}`;
}