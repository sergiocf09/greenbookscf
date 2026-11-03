import { supabase } from '@/integrations/supabase/client';

/** A denied DELETE can succeed with zero rows; never hide that player locally. */
export async function removePersistedRoundPlayer(roundId: string, roundPlayerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('round_players')
    .delete()
    .eq('round_id', roundId)
    .eq('id', roundPlayerId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Player removal was not saved');
}