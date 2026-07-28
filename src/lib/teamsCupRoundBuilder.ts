import { supabase } from '@/integrations/supabase/client';

/**
 * Build a real golf round (rounds + round_groups + round_players) directly from
 * a Teams Cup's existing participants, link it to the leaderboard, and assign
 * any orphan cup_matches to it.
 *
 * Why: The leaderboard world (cup_teams / leaderboard_participants / cup_matches)
 * and the scoring world (rounds / round_groups / round_players / hole_scores)
 * are otherwise disconnected. Without this bridge, players added directly to a
 * Teams Cup have no round in which to capture their scores.
 */

export interface CupGroupSpec {
  /** 1-based number used as round_groups.group_number */
  groupNumber: number;
  /** Cup participant ids (leaderboard_participants.id) that play in this group */
  participantIds: string[];
}

export interface ParticipantPlayOverride {
  /** Course Handicap (integer) computed from this player's Index + their tee */
  courseHandicap: number;
  /** Tee color this player will play from this round */
  teeColor: 'blue' | 'white' | 'yellow' | 'red';
}

export interface CreateRoundFromCupInput {
  leaderboardId: string;
  organizerProfileId: string;
  courseId: string;
  teeColor: 'blue' | 'white' | 'yellow' | 'red';
  startingHole: 1 | 10;
  roundHoles: 9 | 18;
  date: Date;
  groups: CupGroupSpec[];
  /** Per-participant Course HCP + tee. If absent for a player, falls back to leaderboard HCP + global teeColor. */
  playerOverrides?: Map<string, ParticipantPlayOverride>;
  /**
   * If set, reuse this existing round instead of creating a new one.
   * Existing round_groups + round_players will be wiped and rebuilt
   * from the provided `groups` payload. The leaderboard_rounds link
   * is preserved (not re-inserted).
   */
  existingRoundId?: string | null;
  /**
   * Day/session this round belongs to. When set, the round is assigned to the
   * cup_matches of that slot only, so multi-day cups keep one round per slot.
   */
  targetSlot?: { day: number; session: number } | null;
}

interface CupParticipantRow {
  id: string;
  profile_id: string | null;
  guest_name: string | null;
  guest_initials: string | null;
  guest_color: string | null;
  handicap_for_leaderboard: number | null;
}

export async function createRoundFromCup(input: CreateRoundFromCupInput): Promise<string> {
  const {
    leaderboardId, organizerProfileId, courseId, teeColor,
    startingHole, roundHoles, date, groups, playerOverrides, existingRoundId,
    targetSlot,
  } = input;

  // 1. Load all selected participants in one go.
  const allParticipantIds = Array.from(new Set(groups.flatMap(g => g.participantIds)));
  if (allParticipantIds.length === 0) {
    throw new Error('Selecciona al menos un participante para crear la ronda.');
  }

  const { data: partsData, error: partsErr } = await supabase
    .from('leaderboard_participants')
    .select('id, profile_id, guest_name, guest_initials, guest_color, handicap_for_leaderboard')
    .in('id', allParticipantIds);
  if (partsErr) throw partsErr;
  const parts = (partsData ?? []) as CupParticipantRow[];
  const partById = new Map(parts.map(p => [p.id, p]));

  let roundId: string = '';
  let firstGroupId: string | null = null;
  let organizerRoundPlayerId: string | null = null;
  let reusing = !!existingRoundId;

  if (reusing) {
    // Verify the round still exists and the caller is its organizer.
    const { data: roundRow, error: roundErr } = await supabase
      .from('rounds')
      .select('id, organizer_id')
      .eq('id', existingRoundId)
      .maybeSingle();
    if (roundErr) throw roundErr;
    if (!roundRow) {
      // Stale link — unlink and fall through to fresh creation.
      await supabase
        .from('leaderboard_rounds')
        .delete()
        .eq('leaderboard_id', leaderboardId)
        .eq('round_id', existingRoundId!);
      reusing = false;
    } else if (roundRow.organizer_id !== organizerProfileId) {
      // Linked round belongs to a different organizer — we cannot mutate it
      // under RLS. Unlink and create a fresh round owned by current user.
      await supabase
        .from('leaderboard_rounds')
        .delete()
        .eq('leaderboard_id', leaderboardId)
        .eq('round_id', existingRoundId!);
      reusing = false;
    } else {
      roundId = existingRoundId!;
      // Wipe via SECURITY DEFINER RPC: atomic + validates organizer,
      // so we never end in a half-deleted state that later fails INSERT
      // with a confusing RLS error.
      const { error: resetErr } = await supabase.rpc(
        'reset_round_groups_and_players' as any,
        { p_round_id: roundId },
      );
      if (resetErr) {
        if ((resetErr as any).code === '42501') {
          // Caller is not the round organizer — unlink and create fresh.
          await supabase
            .from('leaderboard_rounds')
            .delete()
            .eq('leaderboard_id', leaderboardId)
            .eq('round_id', roundId);
          reusing = false;
        } else {
          throw resetErr;
        }
      }
    }
  }

  if (!reusing) {
    // Create a fresh round via security-definer RPC.
    const { data: rpcData, error: rpcErr } = await supabase.rpc('create_round', {
      p_course_id: courseId,
      p_tee_color: teeColor,
      p_date: date.toISOString().split('T')[0],
      p_bet_config: { roundHoles } as any,
      p_starting_hole: startingHole,
    });
    if (rpcErr) throw rpcErr;
    const rpcRow: any = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!rpcRow) throw new Error('No se pudo crear la ronda.');
    roundId = rpcRow.round_id;
    firstGroupId = rpcRow.group_id;
    organizerRoundPlayerId = rpcRow.round_player_id;
  }

  try {
    // 3. Build the round_groups. When reusing, all groups are new.
    //    When creating fresh, skip number 1 (already created by RPC).
    const groupNumbersToInsert = reusing
      ? groups.map(g => g.groupNumber)
      : groups.map(g => g.groupNumber).filter(n => n !== 1);
    const groupIdByNumber = new Map<number, string>();
    if (!reusing && firstGroupId) groupIdByNumber.set(1, firstGroupId);
    if (groupNumbersToInsert.length > 0) {
      const { data: newGroups, error: groupErr } = await supabase
        .from('round_groups')
        .insert(groupNumbersToInsert.map(n => ({ round_id: roundId, group_number: n })))
        .select('id, group_number');
      if (groupErr) throw groupErr;
      (newGroups ?? []).forEach((g: any) => groupIdByNumber.set(g.group_number, g.id));
    }

    // 4. For each participant find their target group_id.
    //    Compute who needs which group; treat the organizer specially since
    //    (in the create-fresh path) create_round already added them to group 1.
    const organizerCupPart = parts.find(p => p.profile_id === organizerProfileId);
    const organizerTargetGroupNumber: number | null = (() => {
      if (!organizerCupPart) return null;
      const g = groups.find(g => g.participantIds.includes(organizerCupPart.id));
      return g?.groupNumber ?? null;
    })();
    if (!reusing) {
      if (organizerTargetGroupNumber && organizerTargetGroupNumber !== 1 && organizerRoundPlayerId) {
        const targetGid = groupIdByNumber.get(organizerTargetGroupNumber);
        if (targetGid) {
          await supabase
            .from('round_players')
            .update({ group_id: targetGid })
            .eq('id', organizerRoundPlayerId);
        }
      }
      // Sync organizer handicap + tee from override (preferred) or leaderboard fallback.
      if (organizerCupPart && organizerRoundPlayerId) {
        const ov = playerOverrides?.get(organizerCupPart.id);
        const hcp = ov?.courseHandicap ?? organizerCupPart.handicap_for_leaderboard ?? 0;
        const tee = ov?.teeColor ?? teeColor;
        await supabase
          .from('round_players')
          .update({ handicap_for_round: hcp, tee_color: tee })
          .eq('id', organizerRoundPlayerId);
      }
    }

    // 5. Build the round_players rows for the rest.
    //    When NOT reusing, skip the organizer (create_round already inserted them).
    //    When reusing, the organizer is inserted here with is_organizer=true.
    //    Guests need a ghost profile first.
    const guestParts = parts.filter(p => !p.profile_id && (reusing || p.id !== organizerCupPart?.id));
    const ghostProfileByPartId = new Map<string, string>();
    if (guestParts.length > 0) {
      const ghostRows = guestParts.map(p => ({
        is_ghost: true,
        user_id: null,
        display_name: p.guest_name || 'Invitado',
        initials: (p.guest_initials || '??').slice(0, 3).toUpperCase(),
        avatar_color: p.guest_color || '#3B82F6',
        current_handicap: p.handicap_for_leaderboard ?? 20,
      }));
      const { data: ghosts, error: ghostErr } = await supabase
        .from('profiles')
        .insert(ghostRows as any)
        .select('id, display_name, initials');
      if (ghostErr) throw ghostErr;
      // Map by order — Supabase preserves insertion order on .insert.
      (ghosts ?? []).forEach((g: any, idx: number) => {
        ghostProfileByPartId.set(guestParts[idx].id, g.id);
      });
    }

    const playerRows: any[] = [];
    for (const group of groups) {
      const gid = groupIdByNumber.get(group.groupNumber);
      if (!gid) continue;
      for (const partId of group.participantIds) {
        const part = partById.get(partId);
        if (!part) continue;
        // In create-fresh path, organizer already added by create_round → skip.
        if (!reusing && organizerCupPart && part.id === organizerCupPart.id) continue;
        const profileId = part.profile_id ?? ghostProfileByPartId.get(part.id) ?? null;
        if (!profileId) continue;
        const isGuest = !part.profile_id;
        const isOrganizer = reusing && organizerCupPart != null && part.id === organizerCupPart.id;
        const ov = playerOverrides?.get(part.id);
        const hcp = ov?.courseHandicap ?? part.handicap_for_leaderboard ?? 0;
        const tee = ov?.teeColor ?? teeColor;
        playerRows.push({
          round_id: roundId,
          group_id: gid,
          profile_id: profileId,
          handicap_for_round: hcp,
          is_organizer: isOrganizer,
          tee_color: tee,
          guest_name: isGuest ? part.guest_name : null,
          guest_initials: isGuest ? part.guest_initials : null,
          guest_color: isGuest ? part.guest_color : null,
        });
      }
    }
    if (playerRows.length > 0) {
      const { error: rpErr } = await supabase.from('round_players').insert(playerRows);
      if (rpErr) throw rpErr;
    }

    // 6. Link the round to the leaderboard (skip if reusing — link already exists).
    if (!reusing) {
      await supabase
        .from('leaderboard_rounds')
        .insert({
          leaderboard_id: leaderboardId,
          round_id: roundId,
          added_by: organizerProfileId,
        });
    }

    // 7. Assign cup_matches to the new round so live results compute.
    // Multi-day cups: only the matches of the targeted day/session.
    if (targetSlot) {
      await supabase
        .from('cup_matches')
        .update({ round_id: roundId, status: 'active' } as any)
        .eq('leaderboard_id', leaderboardId)
        .eq('day_number', targetSlot.day)
        .eq('session_number', targetSlot.session);
    } else {
      await supabase
        .from('cup_matches')
        .update({ round_id: roundId, status: 'active' } as any)
        .eq('leaderboard_id', leaderboardId)
        .is('round_id', null);
    }

    return roundId;
  } catch (err) {
    // Best-effort rollback ONLY when we created the round in this call.
    // When reusing, the round predates us — don't nuke it on partial failure.
    if (!reusing) {
      try { await supabase.from('rounds').delete().eq('id', roundId); } catch { /* noop */ }
    }
    throw err;
  }
}
