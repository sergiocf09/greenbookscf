import { trs } from '@/i18n/tr';

export const DEFAULT_MIN_PLAYERS_PER_ROUND = 2;
export const MIN_PLAYERS_RANGE = { min: 1, max: 12 } as const;

export interface LeagueLinkCandidate {
  round_id: string;
  date: string;
  status: string;
  course_name: string;
  organizer_name: string;
  league_players_matched: number;
  matched_names: string[];
  guests_in_round: number;
  players_total: number;
}

export interface CandidatePlayersLabels {
  matchedLabel: string;
  guestsLabel: string | null;
}

export function getEffectiveMinPlayers(savedValue: unknown): number {
  const parsed =
    typeof savedValue === 'number'
      ? savedValue
      : typeof savedValue === 'string' && /^\d+$/.test(savedValue.trim())
        ? parseInt(savedValue.trim(), 10)
        : NaN;
  if (!Number.isInteger(parsed)) return DEFAULT_MIN_PLAYERS_PER_ROUND;
  if (parsed < MIN_PLAYERS_RANGE.min || parsed > MIN_PLAYERS_RANGE.max) {
    return DEFAULT_MIN_PLAYERS_PER_ROUND;
  }
  return parsed;
}

function joinNamesNatural(names: string[], conjunction: string): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} ${conjunction} ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`;
}

export function formatCandidatePlayersLabels(
  matchedCount: number,
  matchedNames: string[] | null | undefined,
  guestsInRound: number,
  translate: (s: string) => string = trs,
): CandidatePlayersLabels {
  const count = Math.max(0, Math.floor(Number.isFinite(matchedCount) ? matchedCount : 0));
  const cleanNames = (matchedNames ?? []).map((n) => n.trim()).filter(Boolean);
  const conjunction = translate('y');
  const namesPart = joinNamesNatural(cleanNames, conjunction);
  const prefix = `${count} ${translate('de la liga')}`;
  const matchedLabel = namesPart ? `${prefix}: ${namesPart}` : prefix;

  const guests = Math.max(0, Math.floor(Number.isFinite(guestsInRound) ? guestsInRound : 0));
  let guestsLabel: string | null = null;
  if (guests === 1) {
    guestsLabel = `+1 ${translate('invitado (no cuenta para el mínimo)')}`;
  } else if (guests > 1) {
    guestsLabel = `+${guests} ${translate('invitados (no cuentan para el mínimo)')}`;
  }

  return { matchedLabel, guestsLabel };
}