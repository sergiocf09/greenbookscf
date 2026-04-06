import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface MoneyRanking {
  id: string;
  name: string;
  creator_id: string;
  created_at: string;
  member_count?: number;
  is_member?: boolean;
  is_creator?: boolean;
  creator_name?: string;
}

export interface RankingMember {
  id: string;
  profile_id: string;
  display_name: string;
  initials: string;
  avatar_color: string;
  joined_at: string;
}

export interface RankingBalanceEntry {
  profile_id: string;
  display_name: string;
  initials: string;
  avatar_color: string;
  net_balance: number;
  rounds_played: number;
  rank?: number;
}

export interface BilateralEntry {
  rival_profile_id: string;
  display_name: string;
  initials: string;
  avatar_color: string;
  net_balance: number;
  rounds_together: number;
}

export type RankingPeriod = 'all' | 'year' | 'custom';

export function useMoneyRankings() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: rankings = [], isLoading: loading } = useQuery({
    queryKey: ['money_rankings', profile?.id],
    enabled: !!profile,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('money_rankings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const creatorIds = [...new Set((data || []).map(r => r.creator_id))];
      let creatorMap: Record<string, string> = {};
      if (creatorIds.length > 0) {
        const { data: creators } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', creatorIds);
        creatorMap = Object.fromEntries(
          (creators || []).map(p => [p.id, p.display_name])
        );
      }

      const enriched = await Promise.all((data || []).map(async (r) => {
        const { count } = await supabase
          .from('money_ranking_members')
          .select('*', { count: 'exact', head: true })
          .eq('ranking_id', r.id);

        const { data: myMembership } = await supabase
          .from('money_ranking_members')
          .select('id')
          .eq('ranking_id', r.id)
          .eq('profile_id', profile!.id)
          .maybeSingle();

        return {
          ...r,
          member_count: count ?? 0,
          is_member: !!myMembership,
          is_creator: r.creator_id === profile!.id,
          creator_name: creatorMap[r.creator_id] ?? 'Organizador',
        } as MoneyRanking;
      }));

      return enriched;
    },
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['money_rankings'] });
  }, [queryClient]);

  const createRanking = useCallback(async (name: string) => {
    if (!profile) return null;
    try {
      const { data, error } = await supabase
        .from('money_rankings')
        .insert({ name: name.trim(), creator_id: profile.id })
        .select()
        .single();
      if (error) throw error;
      await supabase
        .from('money_ranking_members')
        .insert({ ranking_id: data.id, profile_id: profile.id, added_by: profile.id });
      toast.success('Ranking creado');
      invalidate();
      return data;
    } catch (err: any) {
      toast.error('Error al crear ranking: ' + err.message);
      return null;
    }
  }, [profile, invalidate]);

  const addMember = useCallback(async (rankingId: string, profileId: string) => {
    if (!profile) return false;
    try {
      const { error } = await supabase
        .from('money_ranking_members')
        .insert({ ranking_id: rankingId, profile_id: profileId, added_by: profile.id });
      if (error) throw error;
      toast.success('Jugador agregado al ranking');
      invalidate();
      return true;
    } catch (err: any) {
      toast.error('Error al agregar jugador: ' + err.message);
      return false;
    }
  }, [profile, invalidate]);

  const leaveRanking = useCallback(async (rankingId: string) => {
    if (!profile) return;
    try {
      const { error } = await supabase
        .from('money_ranking_members')
        .delete()
        .eq('ranking_id', rankingId)
        .eq('profile_id', profile.id);
      if (error) throw error;
      toast.success('Te desvinculaste del ranking');
      invalidate();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  }, [profile, invalidate]);

  const removeMember = useCallback(async (memberRowId: string) => {
    try {
      const { error } = await supabase
        .from('money_ranking_members')
        .delete()
        .eq('id', memberRowId);
      if (error) throw error;
      toast.success('Jugador removido');
      invalidate();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  }, [invalidate]);

  const deleteRanking = useCallback(async (rankingId: string) => {
    try {
      const { error } = await supabase
        .from('money_rankings')
        .delete()
        .eq('id', rankingId);
      if (error) throw error;
      toast.success('Ranking eliminado');
      invalidate();
    } catch (err: any) {
      toast.error('Error al eliminar: ' + err.message);
    }
  }, [invalidate]);

  return {
    rankings,
    loading,
    fetchRankings: invalidate,
    createRanking,
    addMember,
    leaveRanking,
    removeMember,
    deleteRanking,
  };
}

export function useMoneyRankingDetail(rankingId: string | null, period: RankingPeriod = 'all', customDateFrom?: string, customDateTo?: string) {
  const { profile } = useAuth();
  const [ranking, setRanking] = useState<MoneyRanking | null>(null);
  const [members, setMembers] = useState<RankingMember[]>([]);
  const [balances, setBalances] = useState<RankingBalanceEntry[]>([]);
  const [bilateral, setBilateral] = useState<BilateralEntry[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [loadingBilateral, setLoadingBilateral] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!rankingId) return;
    setLoadingDetail(true);
    try {
      const [rankingRes, membersRes] = await Promise.all([
        supabase.from('money_rankings').select('*').eq('id', rankingId).single(),
        supabase.from('money_ranking_members').select('id, profile_id, joined_at').eq('ranking_id', rankingId),
      ]);
      if (rankingRes.error) throw rankingRes.error;
      setRanking({ ...rankingRes.data, is_creator: rankingRes.data.creator_id === profile?.id });

      const memberData = membersRes.data || [];
      const profileIds = memberData.map(m => m.profile_id);
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, initials, avatar_color')
          .in('id', profileIds);
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
        setMembers(memberData.map(m => ({
          id: m.id,
          profile_id: m.profile_id,
          display_name: profileMap[m.profile_id]?.display_name ?? 'Jugador',
          initials: profileMap[m.profile_id]?.initials ?? '??',
          avatar_color: profileMap[m.profile_id]?.avatar_color ?? '#3B82F6',
          joined_at: m.joined_at,
        })));
      } else {
        setMembers([]);
      }
    } catch (err: any) {
      console.error('Error fetching ranking detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, [rankingId, profile]);

  const fetchBalances = useCallback(async () => {
    if (!rankingId) return;
    setLoadingBalances(true);
    try {
      const params: any = { p_ranking_id: rankingId, p_period: period };
      if (period === 'custom' && customDateFrom) {
        params.p_date_from = new Date(customDateFrom).toISOString();
        params.p_date_to = customDateTo ? new Date(customDateTo + 'T23:59:59').toISOString() : new Date().toISOString();
      }
      const { data, error } = await supabase.rpc('get_money_ranking_balances', params);
      if (error) throw error;
      setBalances((data || []).map((e: any, idx: number) => ({
        ...e,
        net_balance: Number(e.net_balance),
        rounds_played: Number(e.rounds_played),
        rank: idx + 1,
      })));
    } catch (err: any) {
      console.error('Error fetching balances:', err);
    } finally {
      setLoadingBalances(false);
    }
  }, [rankingId, period, customDateFrom, customDateTo]);

  const fetchBilateral = useCallback(async (targetProfileId: string) => {
    if (!rankingId) return;
    setLoadingBilateral(true);
    try {
      const params: any = { p_ranking_id: rankingId, p_profile_id: targetProfileId, p_period: period };
      if (period === 'custom' && customDateFrom) {
        params.p_date_from = new Date(customDateFrom).toISOString();
        params.p_date_to = customDateTo ? new Date(customDateTo + 'T23:59:59').toISOString() : new Date().toISOString();
      }
      const { data, error } = await supabase.rpc('get_money_ranking_bilateral', params);
      if (error) throw error;
      setBilateral((data || []).map((e: any) => ({
        ...e,
        net_balance: Number(e.net_balance),
        rounds_together: Number(e.rounds_together),
      })));
    } catch (err: any) {
      console.error('Error fetching bilateral:', err);
    } finally {
      setLoadingBilateral(false);
    }
  }, [rankingId, period, customDateFrom, customDateTo]);

  useEffect(() => {
    fetchDetail();
    fetchBalances();
    setSelectedMemberId(null);
    setBilateral([]);
  }, [fetchDetail, fetchBalances]);

  const selectMember = useCallback((profileId: string) => {
    setSelectedMemberId(profileId);
    fetchBilateral(profileId);
  }, [fetchBilateral]);

  const isCreator = ranking?.creator_id === profile?.id;

  return {
    ranking, members, balances, bilateral,
    selectedMemberId, loadingDetail, loadingBalances, loadingBilateral,
    isCreator, fetchDetail, fetchBalances, selectMember,
  };
}
