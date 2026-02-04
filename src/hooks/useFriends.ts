import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export interface Friend {
  friendshipId: string;
  profileId: string;
  displayName: string;
  initials: string;
  avatarColor: string;
  currentHandicap: number;
  createdAt: string;
}

export interface SearchResult {
  id: string;
  displayName: string;
  initials: string;
  avatarColor: string;
  currentHandicap: number;
  isFriend: boolean;
}

export const useFriends = () => {
  const { profile } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const fetchFriends = useCallback(async () => {
    if (!profile?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_friends');
      
      if (error) throw error;
      
      const mapped: Friend[] = (data || []).map((f: any) => ({
        friendshipId: f.friendship_id,
        profileId: f.friend_profile_id,
        displayName: f.display_name,
        initials: f.initials,
        avatarColor: f.avatar_color,
        currentHandicap: f.current_handicap ?? 0,
        createdAt: f.created_at,
      }));
      
      setFriends(mapped);
    } catch (err: any) {
      console.error('Error fetching friends:', err);
      toast.error('No se pudieron cargar los amigos');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  const searchProfiles = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setSearching(true);
    try {
      const { data, error } = await supabase.rpc('search_profiles', { 
        p_query: query 
      });
      
      if (error) throw error;
      
      // Check which ones are already friends
      const friendIds = new Set(friends.map(f => f.profileId));
      
      const mapped: SearchResult[] = (data || []).map((p: any) => ({
        id: p.id,
        displayName: p.display_name,
        initials: p.initials,
        avatarColor: p.avatar_color,
        currentHandicap: p.current_handicap ?? 0,
        isFriend: friendIds.has(p.id),
      }));
      
      setSearchResults(mapped);
    } catch (err: any) {
      console.error('Error searching profiles:', err);
      toast.error('Error en la búsqueda');
    } finally {
      setSearching(false);
    }
  }, [friends]);

  const addFriend = useCallback(async (friendProfileId: string) => {
    if (!profile?.id) return false;
    
    try {
      const { error } = await supabase
        .from('friendships')
        .insert({
          owner_profile_id: profile.id,
          friend_profile_id: friendProfileId,
        });
      
      if (error) {
        if (error.code === '23505') {
          toast.info('Este jugador ya es tu amigo');
          return false;
        }
        throw error;
      }
      
      toast.success('Amigo agregado');
      await fetchFriends();
      return true;
    } catch (err: any) {
      console.error('Error adding friend:', err);
      toast.error('No se pudo agregar el amigo');
      return false;
    }
  }, [profile?.id, fetchFriends]);

  const removeFriend = useCallback(async (friendshipId: string) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);
      
      if (error) throw error;
      
      toast.success('Amigo eliminado');
      setFriends(prev => prev.filter(f => f.friendshipId !== friendshipId));
      return true;
    } catch (err: any) {
      console.error('Error removing friend:', err);
      toast.error('No se pudo eliminar el amigo');
      return false;
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchResults([]);
  }, []);

  return {
    friends,
    searchResults,
    loading,
    searching,
    fetchFriends,
    searchProfiles,
    addFriend,
    removeFriend,
    clearSearch,
  };
};
