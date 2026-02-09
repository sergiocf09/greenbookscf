import React, { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, UserPlus, UserMinus, Users, Loader2 } from 'lucide-react';
import { useFriends, Friend, SearchResult } from '@/hooks/useFriends';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { formatPlayerName } from '@/lib/playerInput';

interface FriendsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToRound?: (friend: Friend) => void;
  hasActiveRound?: boolean;
}

export const FriendsDialog: React.FC<FriendsDialogProps> = ({
  open,
  onOpenChange,
  onAddToRound,
  hasActiveRound = false,
}) => {
  const {
    friends,
    searchResults,
    loading,
    searching,
    fetchFriends,
    searchProfiles,
    addFriend,
    removeFriend,
    clearSearch,
  } = useFriends();

  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<'friends' | 'search'>('friends');

  useEffect(() => {
    if (open) {
      fetchFriends();
      setSearchQuery('');
      clearSearch();
    }
  }, [open, fetchFriends, clearSearch]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchProfiles(searchQuery);
      } else {
        clearSearch();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchProfiles, clearSearch]);

  const handleAddFriend = async (profileId: string) => {
    const success = await addFriend(profileId);
    if (success) {
      // Update search results to reflect new friend status
      searchProfiles(searchQuery);
    }
  };

  const handleAddToRound = (friend: Friend) => {
    if (onAddToRound) {
      onAddToRound(friend);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Amigos
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="friends">Mis Amigos ({friends.length})</TabsTrigger>
            <TabsTrigger value="search">Buscar Jugadores</TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="flex-1 mt-4 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : friends.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No tienes amigos agregados</p>
                <p className="text-xs mt-1">Busca jugadores para agregarlos</p>
              </div>
            ) : (
              <ScrollArea className="h-[350px] pr-2">
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <FriendCard
                      key={friend.friendshipId}
                      friend={friend}
                      onRemove={() => removeFriend(friend.friendshipId)}
                      onAddToRound={hasActiveRound ? () => handleAddToRound(friend) : undefined}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="search" className="flex-1 mt-4 space-y-3 min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o correo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {searching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : searchQuery.length < 2 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Escribe al menos 2 caracteres</p>
                <p className="text-xs mt-1">Busca por nombre parcial o correo</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No se encontraron jugadores</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px] pr-2">
                <div className="space-y-2">
                  {searchResults.map((result) => (
                    <SearchResultCard
                      key={result.id}
                      result={result}
                      onAddFriend={() => handleAddFriend(result.id)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

// Friend card component
interface FriendCardProps {
  friend: Friend;
  onRemove: () => void;
  onAddToRound?: () => void;
}

const FriendCard: React.FC<FriendCardProps> = ({ friend, onRemove, onAddToRound }) => {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <PlayerAvatar
        initials={friend.initials}
        background={friend.avatarColor}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{formatPlayerName(friend.displayName)}</p>
        <p className="text-xs text-muted-foreground">
          HCP: {friend.currentHandicap}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {onAddToRound && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAddToRound}
            className="text-xs h-8"
          >
            <UserPlus className="h-3.5 w-3.5 mr-1" />
            A Ronda
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

// Search result card
interface SearchResultCardProps {
  result: SearchResult;
  onAddFriend: () => void;
}

const SearchResultCard: React.FC<SearchResultCardProps> = ({ result, onAddFriend }) => {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <PlayerAvatar
        initials={result.initials}
        background={result.avatarColor}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{formatPlayerName(result.displayName)}</p>
        <p className="text-xs text-muted-foreground">
          HCP: {result.currentHandicap}
        </p>
      </div>
      {result.isFriend ? (
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
          Ya es amigo
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onAddFriend}
          className="text-xs h-8"
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          Agregar
        </Button>
      )}
    </div>
  );
};
