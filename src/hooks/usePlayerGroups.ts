import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { devError } from '@/lib/logger';
import { toast } from 'sonner';
import { trs } from '@/i18n/tr';

export interface GroupMember {
  profileId: string;
  displayName: string;
  initials: string;
  avatarColor: string;
  handicap: number;
}

export interface PlayerGroup {
  id: string;
  name: string;
  emoji: string;
  members: GroupMember[];
  createdAt: string;
}

export function usePlayerGroups() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<PlayerGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchGroups = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_friend_groups');
      if (error) throw error;

      // Agrupar filas por group_id
      const map = new Map<string, PlayerGroup>();
      for (const row of (data as any[]) ?? []) {
        if (!map.has(row.group_id)) {
          map.set(row.group_id, {
            id: row.group_id,
            name: row.group_name,
            emoji: row.group_emoji,
            members: [],
            createdAt: row.created_at,
          });
        }
        if (row.member_profile_id) {
          map.get(row.group_id)!.members.push({
            profileId: row.member_profile_id,
            displayName: row.member_display_name,
            initials: row.member_initials,
            avatarColor: row.member_avatar_color,
            handicap: Number(row.member_handicap ?? 0),
          });
        }
      }
      setGroups(Array.from(map.values()));
    } catch (err) {
      devError('usePlayerGroups fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const createGroup = useCallback(async (name: string, emoji: string): Promise<string | null> => {
    if (!profile) return null;
    try {
      const { data, error } = await supabase
        .from('friend_groups')
        .insert({ owner_profile_id: profile.id, name: name.trim(), emoji, sort_order: groups.length })
        .select('id')
        .single();
      if (error) throw error;
      await fetchGroups();
      return data.id;
    } catch (err) {
      devError('createGroup error:', err);
      toast.error(trs('No se pudo crear el grupo'));
      return null;
    }
  }, [profile, fetchGroups, groups.length]);

  const updateGroup = useCallback(async (groupId: string, name: string, emoji: string) => {
    try {
      const { error } = await supabase
        .from('friend_groups')
        .update({ name: name.trim(), emoji })
        .eq('id', groupId);
      if (error) throw error;
      await fetchGroups();
    } catch (err) {
      devError('updateGroup error:', err);
      toast.error(trs('No se pudo actualizar el grupo'));
    }
  }, [fetchGroups]);

  const deleteGroup = useCallback(async (groupId: string) => {
    try {
      const { error } = await supabase
        .from('friend_groups')
        .delete()
        .eq('id', groupId);
      if (error) throw error;
      setGroups(prev => prev.filter(g => g.id !== groupId));
      toast.success(trs('Grupo eliminado'));
    } catch (err) {
      devError('deleteGroup error:', err);
      toast.error(trs('No se pudo eliminar el grupo'));
    }
  }, []);

  const addMember = useCallback(async (groupId: string, friendProfileId: string) => {
    try {
      const { error } = await supabase
        .from('friend_group_members')
        .insert({ group_id: groupId, friend_profile_id: friendProfileId });
      if (error) {
        if (error.code === '23505') return; // ya existe, ignorar
        throw error;
      }
      await fetchGroups();
    } catch (err) {
      devError('addMember error:', err);
      toast.error(trs('No se pudo agregar el miembro'));
    }
  }, [fetchGroups]);

  const removeMember = useCallback(async (groupId: string, friendProfileId: string) => {
    try {
      const { error } = await supabase
        .from('friend_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('friend_profile_id', friendProfileId);
      if (error) throw error;
      await fetchGroups();
    } catch (err) {
      devError('removeMember error:', err);
      toast.error(trs('No se pudo eliminar el miembro'));
    }
  }, [fetchGroups]);

  const setMembers = useCallback(async (groupId: string, friendProfileIds: string[]) => {
    try {
      // Borrar todos los miembros actuales y reinsertar
      const { error: delErr } = await supabase
        .from('friend_group_members')
        .delete()
        .eq('group_id', groupId);
      if (delErr) throw delErr;

      if (friendProfileIds.length > 0) {
        const { error: insErr } = await supabase
          .from('friend_group_members')
          .insert(friendProfileIds.map(fid => ({ group_id: groupId, friend_profile_id: fid })));
        if (insErr) throw insErr;
      }
      await fetchGroups();
    } catch (err) {
      devError('setMembers error:', err);
      toast.error(trs('No se pudo actualizar los miembros'));
    }
  }, [fetchGroups]);

  const reorderGroups = useCallback(async (orderedGroupIds: string[]) => {
    const previous = groups;
    const byId = new Map(groups.map(group => [group.id, group]));
    const reordered = orderedGroupIds
      .map(id => byId.get(id))
      .filter((group): group is PlayerGroup => Boolean(group));
    if (reordered.length !== groups.length) return false;

    setGroups(reordered);
    try {
      const results = await Promise.all(
        orderedGroupIds.map((id, sortOrder) =>
          supabase.from('friend_groups').update({ sort_order: sortOrder }).eq('id', id)
        )
      );
      const failed = results.find(result => result.error);
      if (failed?.error) throw failed.error;
      return true;
    } catch (err) {
      setGroups(previous);
      devError('reorderGroups error:', err);
      toast.error(trs('No se pudo guardar el orden de los grupos'));
      return false;
    }
  }, [groups]);

  return {
    groups,
    loading,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addMember,
    removeMember,
    setMembers,
    reorderGroups,
  };
}