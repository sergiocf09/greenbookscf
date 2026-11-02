import { supabase } from '@/integrations/supabase/client';

export interface CrossHistoryLine {
  line_id: string;
  cross_bet_id: string | null;
  origin_round_id: string;
  own_round_id: string | null;
  date: string;
  course_name: string;
  rival_profile_id: string;
  rival_name: string;
  net_amount: number;
  label: string;
  is_final: boolean;
}

export async function fetchCrossHistory(): Promise<CrossHistoryLine[]> {
  const { data, error } = await supabase.rpc('get_my_cross_bet_history');
  if (error) throw error;
  return uniqueCrossHistory((data ?? []).map(row => ({ ...row, net_amount: Number(row.net_amount) })));
}

export function uniqueCrossHistory(lines: CrossHistoryLine[]): CrossHistoryLine[] {
  return [...new Map(lines.map(line => [line.line_id, line])).values()];
}

export function crossHistoryTotal(lines: CrossHistoryLine[], roundId?: string): number {
  return uniqueCrossHistory(lines).filter(line => !roundId || line.own_round_id === roundId)
    .reduce((sum, line) => sum + line.net_amount, 0);
}