import { trs } from '@/i18n/tr';
import React, { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, UserPlus, UserMinus, Users, Loader2, Plus, Pencil, Trash2, ChevronRight, ArrowLeft, Check } from 'lucide-react';
import { usePlayerGroups, PlayerGroup, GroupMember } from '@/hooks/usePlayerGroups';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
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
  const [tab, setTab] = useState<'friends' | 'groups' | 'search'>('friends');

  const {
    groups,
    loading: groupsLoading,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    setMembers,
  } = usePlayerGroups();

  // Estado de navegación de grupos
  const [groupView, setGroupView] = useState<'list' | 'detail' | 'edit'>('list');
  const [selectedGroup, setSelectedGroup] = useState<PlayerGroup | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('⛳');
  const [editMemberIds, setEditMemberIds] = useState<Set<string>>(new Set());
  const [savingGroup, setSavingGroup] = useState(false);
  const [showGroupSheet, setShowGroupSheet] = useState(false);

  useEffect(() => {
    if (open) { fetchGroups(); }
  }, [open, fetchGroups]);

  const openNewGroup = () => {
    setEditName('');
    setEditEmoji('⛳');
    setEditMemberIds(new Set());
    setSelectedGroup(null);
    setShowGroupSheet(true);
  };

  const openEditGroup = (group: PlayerGroup) => {
    setSelectedGroup(group);
    setEditName(group.name);
    setEditEmoji(group.emoji);
    setEditMemberIds(new Set(group.members.map(m => m.profileId)));
    setShowGroupSheet(true);
  };

  const handleSaveGroup = async () => {
    if (!editName.trim()) return;
    setSavingGroup(true);
    try {
      if (selectedGroup) {
        await updateGroup(selectedGroup.id, editName, editEmoji);
        await setMembers(selectedGroup.id, Array.from(editMemberIds));
      } else {
        const newId = await createGroup(editName, editEmoji);
        if (newId) await setMembers(newId, Array.from(editMemberIds));
      }
      setShowGroupSheet(false);
    } finally {
      setSavingGroup(false);
    }
  };

  const handleDeleteGroup = async (group: PlayerGroup) => {
    if (!confirm(`¿Eliminar el grupo "${group.name}"?`)) return;
    await deleteGroup(group.id);
  };

  const toggleEditMember = (profileId: string) => {
    setEditMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  };

  const EMOJI_OPTIONS = ['⛳', '🏌️', '🏆', '🎯', '⭐', '🔥', '💪', '🤝', '👑', '🌟'];

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
            {trs("Amigos")}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="friends">{trs("Amigos")} ({friends.length})</TabsTrigger>
            <TabsTrigger value="groups">{trs("Grupos")}</TabsTrigger>
            <TabsTrigger value="search">{trs("Buscar Jugadores")}</TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="flex-1 mt-4 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : friends.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">{trs("No tienes amigos agregados")}</p>
                <p className="text-xs mt-1">{trs("Busca jugadores para agregarlos")}</p>
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

          <TabsContent value="groups" className="flex-1 mt-3 min-h-0">
            <div className="space-y-2">
              {/* Botón nuevo grupo */}
              <button
                type="button"
                onClick={openNewGroup}
                className="w-full flex items-center gap-2 p-3 border border-dashed border-border rounded-xl text-sm text-primary hover:bg-primary/5 transition-colors"
              >
                <Plus className="h-4 w-4" />
                {trs("Nuevo grupo")}
              </button>

              {groupsLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{trs("Sin grupos todavía")}</p>
                  <p className="text-xs mt-1">{trs("Crea grupos para armar rondas más rápido")}</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px] pr-1">
                  <div className="space-y-2">
                    {groups.map(group => (
                      <div key={group.id}
                        className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl"
                      >
                        <span className="text-xl shrink-0">{group.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{group.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {group.members.length} {group.members.length !== 1 ? trs("jugadores") : trs("jugador")}
                          </p>
                        </div>
                        <button type="button" onClick={() => openEditGroup(group)}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => handleDeleteGroup(group)}
                          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>

          <TabsContent value="search" className="flex-1 mt-4 space-y-3 min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={trs("Buscar por nombre o correo...")}
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
                <p className="text-sm">{trs("Escribe al menos 2 caracteres")}</p>
                <p className="text-xs mt-1">{trs("Busca por nombre parcial o correo")}</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">{trs("No se encontraron jugadores")}</p>
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

        {/* Sheet crear/editar grupo */}
        <Sheet open={showGroupSheet} onOpenChange={setShowGroupSheet}>
          <SheetContent side="bottom" className="h-[85dvh] flex flex-col">
            <SheetHeader className="pb-2">
              <SheetTitle>{selectedGroup ? trs("Editar grupo") : trs("Nuevo grupo")}</SheetTitle>
            </SheetHeader>

            <div className="space-y-4 flex-1 overflow-y-auto pb-4">
              {/* Nombre */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">{trs("Nombre del grupo")}</label>
                <input
                  type="text"
                  placeholder={trs("ej. Los de siempre")}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  maxLength={40}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Emoji */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">{trs("Ícono")}</label>
                <div className="flex gap-2 flex-wrap">
                  {EMOJI_OPTIONS.map(em => (
                    <button key={em} type="button"
                      onClick={() => setEditEmoji(em)}
                      className={cn(
                        'text-xl p-2 rounded-lg border transition-colors',
                        editEmoji === em
                          ? 'bg-primary/10 border-primary'
                          : 'bg-muted border-transparent hover:border-border'
                      )}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Miembros */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">
                  {trs("Miembros")} ({editMemberIds.size} {trs("seleccionados")})
                </label>
                {friends.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    {trs("Primero agrega amigos para incluirlos en grupos")}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {friends.map(f => (
                      <button key={f.profileId} type="button"
                        onClick={() => toggleEditMember(f.profileId)}
                        className={cn(
                          'w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left',
                          editMemberIds.has(f.profileId)
                            ? 'bg-primary/10 border-primary'
                            : 'bg-card border-border hover:bg-muted/40'
                        )}
                      >
                        <div className={cn(
                          'h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                          editMemberIds.has(f.profileId)
                            ? 'bg-primary border-primary'
                            : 'border-border'
                        )}>
                          {editMemberIds.has(f.profileId) && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <PlayerAvatar initials={f.initials} background={f.avatarColor} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.displayName}</p>
                          <p className="text-[10px] text-muted-foreground">HCP {f.currentHandicap}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" className="flex-1"
                onClick={() => setShowGroupSheet(false)} disabled={savingGroup}>
                {trs("Cancelar")}
              </Button>
              <Button className="flex-1" onClick={handleSaveGroup}
                disabled={savingGroup || !editName.trim()}>
                {savingGroup ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {selectedGroup ? trs("Guardar") : trs("Crear grupo")}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
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
    <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-card">
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
        title={trs("Quitar amigo")}
      >
        <UserMinus className="h-4 w-4" />
      </Button>
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
      {onAddToRound && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAddToRound}
          className="text-xs h-8 shrink-0"
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          {trs("A Ronda")}
        </Button>
      )}
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
    <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-card">
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
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded shrink-0">
          {trs("Ya es amigo")}
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onAddFriend}
          className="text-xs h-8 shrink-0"
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          {trs("Agregar")}
        </Button>
      )}
    </div>
  );
};
