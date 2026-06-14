import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { devError } from '@/lib/logger';

export interface PreAppBalance {
  id: string;
  rival_profile_id: string | null;
  rival_name: string;
  year: number | null;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface PreAppBalanceSummary {
  rivalKey: string;
  totalAmount: number;
  entries: PreAppBalance[];
}

export function usePreAppBalances() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<PreAppBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pre_app_balances')
        .select('*')
        .eq('owner_profile_id', profile.id)
        .order('year', { ascending: false, nullsFirst: false });
      if (error) throw error;
      setEntries((data as PreAppBalance[]) ?? []);
    } catch (err) {
      devError('usePreAppBalances fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const addEntry = useCallback(async (params: {
    rival_profile_id: string | null;
    rival_name: string;
    year: number | null;
    amount: number;
    note?: string;
  }) => {
    if (!profile) throw new Error('Sin sesión');
    const { error } = await supabase
      .from('pre_app_balances')
      .insert({
        owner_profile_id: profile.id,
        rival_profile_id: params.rival_profile_id,
        rival_name: params.rival_name,
        year: params.year,
        amount: params.amount,
        note: params.note ?? null,
      });
    if (error) throw error;
    await fetchAll();
  }, [profile, fetchAll]);

  const deleteEntry = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('pre_app_balances')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await fetchAll();
  }, [fetchAll]);

  const updateEntry = useCallback(async (id: string, params: {
    year: number | null;
    amount: number;
    note?: string | null;
  }) => {
    const { error } = await supabase
      .from('pre_app_balances')
      .update({
        year: params.year,
        amount: params.amount,
        note: params.note ?? null,
      })
      .eq('id', id);
    if (error) throw error;
    await fetchAll();
  }, [fetchAll]);

  const summaryByRival = useCallback((): Map<string, PreAppBalanceSummary> => {
    const map = new Map<string, PreAppBalanceSummary>();
    for (const entry of entries) {
      const key = entry.rival_profile_id
        ? `profile:${entry.rival_profile_id}`
        : `guest:${entry.rival_name.trim().toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalAmount += entry.amount;
        existing.entries.push(entry);
      } else {
        map.set(key, { rivalKey: key, totalAmount: entry.amount, entries: [entry] });
      }
    }
    return map;
  }, [entries]);

  return { entries, loading, fetchAll, addEntry, deleteEntry, updateEntry, summaryByRival };
}
