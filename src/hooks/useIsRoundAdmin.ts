import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AdminInfo {
  isOrganizer: boolean;
  isRoundAdmin: boolean; // organizer OR is_admin in this round
  /** True if the current user can edit data inside the given group. */
  canEditGroup: (groupId: string | null | undefined) => boolean;
  loading: boolean;
}

/**
 * Determines whether the currently-authenticated profile can edit data in a
 * given round. The organizer can edit anything in any group; co-administrators
 * (round_players.is_admin = true) can only edit data in their own group.
 *
 * Bilateral bet edits (BilateralDetail) are intentionally NOT gated by this
 * hook — any participant can edit/X their own pair bets.
 */
export function useIsRoundAdmin(roundId: string | null | undefined): AdminInfo {
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [isRoundAdmin, setIsRoundAdmin] = useState(false);
  const [adminGroupIds, setAdminGroupIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(!!roundId);

  useEffect(() => {
    let cancelled = false;
    if (!roundId) {
      setIsOrganizer(false);
      setIsRoundAdmin(false);
      setAdminGroupIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);

    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        if (!cancelled) {
          setIsOrganizer(false);
          setIsRoundAdmin(false);
          setAdminGroupIds(new Set());
          setLoading(false);
        }
        return;
      }

      // Resolve current profile id
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      const profileId = profile?.id;
      if (!profileId) {
        if (!cancelled) {
          setIsOrganizer(false);
          setIsRoundAdmin(false);
          setAdminGroupIds(new Set());
          setLoading(false);
        }
        return;
      }

      const [{ data: round }, { data: rps }] = await Promise.all([
        supabase.from('rounds').select('organizer_id').eq('id', roundId).maybeSingle(),
        supabase
          .from('round_players')
          .select('group_id, is_admin, profile_id')
          .eq('round_id', roundId),
      ]);

      const organizer = round?.organizer_id === profileId;
      const myAdminGroups = new Set<string>();
      let anyAdmin = false;
      (rps ?? []).forEach((rp: any) => {
        if (rp.profile_id === profileId && rp.is_admin) {
          anyAdmin = true;
          if (rp.group_id) myAdminGroups.add(rp.group_id);
        }
      });

      if (!cancelled) {
        setIsOrganizer(organizer);
        setIsRoundAdmin(organizer || anyAdmin);
        setAdminGroupIds(myAdminGroups);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roundId]);

  return {
    isOrganizer,
    isRoundAdmin,
    loading,
    canEditGroup: (groupId) => {
      if (isOrganizer) return true;
      if (!groupId) return false;
      return adminGroupIds.has(groupId);
    },
  };
}
