import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { WolfConfig, WolfHoleState, Player } from '@/types/golf';
import { getWolfPlayerId, computeEffectiveAmount, resolveWolfHole } from '@/lib/bets/wolf';

export const useWolf = (roundId: string | null, players: Player[]) => {
  const [wolfConfig, setWolfConfig] = useState<WolfConfig | null>(null);
  const [holeStates, setHoleStates] = useState<WolfHoleState[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!roundId) return;
    setLoading(true);
    try {
      const [{ data: cfg }, { data: states }] = await Promise.all([
        supabase.from('wolf_config').select('*').eq('round_id', roundId).maybeSingle(),
        supabase.from('wolf_hole_state').select('*').eq('round_id', roundId).order('hole_number'),
      ]);
      if (cfg) {
        setWolfConfig({
          roundId:        cfg.round_id,
          amountPerHole:  cfg.amount_per_hole,
          scoringMode:    cfg.scoring_mode as WolfConfig['scoringMode'],
          useHandicap:    cfg.use_handicap,
          timing:         cfg.timing as WolfConfig['timing'],
          carryover:      cfg.carryover,
          playerOrder:    (cfg as any).player_order ?? [],
          participantIds: (cfg as any).participant_ids ?? [],
          playerHandicaps: (cfg as any).player_handicaps ?? [],
        });
      } else {
        setWolfConfig(null);
      }
      setHoleStates((states ?? []).map(s => ({
        roundId: s.round_id,
        holeNumber: s.hole_number,
        wolfPlayerId: s.wolf_player_id,
        partnerIds: s.partner_ids ?? [],
        wentSolo: s.went_solo,
        result: (s.result as WolfHoleState['result']) ?? null,
        effectiveAmount: s.effective_amount ?? null,
        carryoverHoles: s.carryover_holes ?? 0,
      })));
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveConfig = useCallback(async (cfg: Omit<WolfConfig, 'roundId'>) => {
    if (!roundId) return;
    await supabase.from('wolf_config').upsert({
      round_id:        roundId,
      amount_per_hole: cfg.amountPerHole,
      scoring_mode:    cfg.scoringMode,
      use_handicap:    cfg.useHandicap,
      timing:          cfg.timing,
      carryover:       cfg.carryover,
      player_order:    cfg.playerOrder ?? [],
      participant_ids: cfg.participantIds ?? [],
      player_handicaps: cfg.playerHandicaps ?? [],
    } as any, { onConflict: 'round_id' });
    await fetchData();
  }, [roundId, fetchData]);

  const saveDecision = useCallback(async (holeNumber: number, wolfPlayerId: string, partnerIds: string[], wentSolo: boolean) => {
    if (!roundId || !wolfConfig) return;
    // Validate: wolfPlayerId and partnerIds must belong to participantIds
    const validIds = new Set(wolfConfig.participantIds ?? []);
    if (validIds.size > 0) {
      if (!validIds.has(wolfPlayerId)) {
        console.warn(`[useWolf] wolfPlayerId ${wolfPlayerId} not in participantIds, skipping save`);
        return;
      }
      for (const pid of partnerIds) {
        if (!validIds.has(pid)) {
          console.warn(`[useWolf] partnerId ${pid} not in participantIds, skipping save`);
          return;
        }
      }
      if (partnerIds.includes(wolfPlayerId)) {
        console.warn(`[useWolf] wolfPlayerId cannot be its own partner, skipping save`);
        return;
      }
    }
    const carryoverHoles = holeStates.filter(s =>
      s.holeNumber < holeNumber && s.result === 'tied' && wolfConfig.carryover
    ).length;
    const effectiveAmount = computeEffectiveAmount(wolfConfig, carryoverHoles, wentSolo);
    await supabase.from('wolf_hole_state').upsert({
      round_id: roundId,
      hole_number: holeNumber,
      wolf_player_id: wolfPlayerId,
      partner_ids: partnerIds,
      went_solo: wentSolo,
      result: null,
      effective_amount: effectiveAmount,
      carryover_holes: carryoverHoles,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'round_id,hole_number' });

    // Auto-resolve: if all players have confirmed scores for this hole, compute result
    if (players.length >= 4) {
      const { data: roundPlayers } = await supabase
        .from('round_players')
        .select('id, profile_id')
        .eq('round_id', roundId);
      if (roundPlayers) {
        const rpIds = roundPlayers.map(rp => rp.id);
        const { data: holeScores } = await supabase
          .from('hole_scores')
          .select('round_player_id, confirmed, strokes')
          .eq('hole_number', holeNumber)
          .in('round_player_id', rpIds);
        const allConfirmed = holeScores && rpIds.every(rpId => {
          const hs = holeScores.find(s => s.round_player_id === rpId);
          return hs?.confirmed && hs?.strokes;
        });
        if (allConfirmed) {
          // Build scores map and call resolveWolfHole
          const wolfTeam = [wolfPlayerId, ...partnerIds];
          const rivalTeam = (wolfConfig.participantIds ?? []).filter(id => !wolfTeam.includes(id));
          // We need course data - fetch it
          const { data: round } = await supabase
            .from('rounds')
            .select('course_id')
            .eq('id', roundId)
            .single();
          if (round) {
            const { data: courseHoles } = await supabase
              .from('course_holes')
              .select('*')
              .eq('course_id', round.course_id)
              .order('hole_number');
            if (courseHoles && courseHoles.length > 0) {
              const course = {
                id: round.course_id,
                name: '',
                location: '',
                holes: courseHoles.map(h => ({
                  number: h.hole_number,
                  par: h.par,
                  handicapIndex: h.stroke_index,
                  yards: h.yards_white ?? 0,
                })),
              };
              // Build player scores map from DB
              const scoresMap = new Map<string, { holeNumber: number; strokes: number; confirmed: boolean }[]>();
              for (const rp of roundPlayers) {
                const profileId = rp.profile_id;
                if (!profileId) continue;
                const playerPlayer = players.find(p => p.profileId === profileId || p.id === rp.id);
                const pid = playerPlayer?.id ?? rp.id;
                const rpScores = holeScores!.filter(s => s.round_player_id === rp.id);
                scoresMap.set(pid, rpScores.map(s => ({
                  holeNumber,
                  strokes: s.strokes ?? 0,
                  confirmed: s.confirmed,
                })));
              }
              // Convert to the format resolveWolfHole expects
              const playerScoresMap = new Map<string, any[]>();
              scoresMap.forEach((scores, pid) => {
                playerScoresMap.set(pid, scores.map(s => ({
                  holeNumber: s.holeNumber,
                  strokes: s.strokes,
                  confirmed: s.confirmed,
                  putts: 0,
                  markers: {},
                  strokesReceived: 0,
                })));
              });
              const resolved = resolveWolfHole(wolfTeam, rivalTeam, holeNumber, players, playerScoresMap, course as any, wolfConfig);
              const result = resolved.winner === 'wolf' ? 'won' : resolved.winner === 'rival' ? 'lost' : 'tied';
              await supabase.from('wolf_hole_state').update({
                result,
                updated_at: new Date().toISOString(),
              }).eq('round_id', roundId).eq('hole_number', holeNumber);
            }
          }
        }
      }
    }

    await fetchData();
  }, [roundId, wolfConfig, holeStates, fetchData, players]);

  const resolveHole = useCallback(async (holeNumber: number, result: 'won' | 'lost' | 'tied') => {
    if (!roundId) return;
    await supabase.from('wolf_hole_state').update({
      result,
      updated_at: new Date().toISOString(),
    }).eq('round_id', roundId).eq('hole_number', holeNumber);
    await fetchData();
  }, [roundId, fetchData]);

  const getCurrentWolfId = useCallback((holeNumber: number) => {
    if (!wolfConfig || players.length < 4) return null;
    const order = wolfConfig.playerOrder.length > 0 ? wolfConfig.playerOrder : undefined;
    return getWolfPlayerId(holeNumber, players, order);
  }, [wolfConfig, players]);

  const getHoleState = useCallback((holeNumber: number) =>
    holeStates.find(s => s.holeNumber === holeNumber) ?? null, [holeStates]);

  return { wolfConfig, holeStates, loading, isActive: !!wolfConfig, saveConfig, saveDecision, resolveHole, getCurrentWolfId, getHoleState };
};
