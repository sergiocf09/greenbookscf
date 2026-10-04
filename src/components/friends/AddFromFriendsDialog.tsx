import { trs } from '@/i18n/tr';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, UserPlus, Users, Loader2, Check, ChevronRight } from 'lucide-react';
import { useFriends, Friend, SearchResult } from '@/hooks/useFriends';
import { usePlayerGroups } from '@/hooks/usePlayerGroups';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Player } from '@/types/golf';
import { cn } from '@/lib/utils';

interface AddFromFriendsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPlayers: (players: Array<{
    profileId: string;
    name: string;
    initials: string;
    color: string;
    handicap: number;
  }>) => void;
  existingPlayerIds?: string[]; // Profile IDs already in the round
  multiSelect?: boolean;
}

export const AddFromFriendsDialog: React.FC<AddFromFriendsDialogProps> = ({
  open,
  onOpenChange,
  onAddPlayers,
  existingPlayerIds = [],
  multiSelect = true,
}) => {
  const {
    friends,
    searchResults,
    loading,
    searching,
    fetchFriends,
    searchProfiles,
    addFriend,
    clearSearch,
  } = useFriends();

  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<'friends' | 'search'>('friends');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { groups, fetchGroups } = usePlayerGroups();
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const existingSet = useMemo(() => new Set(existingPlayerIds), [existingPlayerIds]);

  useEffect(() => {
    if (open) fetchGroups();
  }, [open, fetchGroups]);

  useEffect(() => {
    if (open) {
      fetchFriends();
      setSearchQuery('');
      clearSearch();
      setSelectedIds(new Set());
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

  const toggleSelection = (profileId: string) => {
    if (multiSelect) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(profileId)) {
          next.delete(profileId);
        } else {
          next.add(profileId);
        }
        return next;
      });
    } else {
      setSelectedIds(new Set([profileId]));
    }
  };

  const handleConfirm = () => {
    // Gather selected players from friends, group members and search results
    const allProfiles = [
      ...friends.map(f => ({
        profileId: f.profileId,
        name: f.displayName,
        initials: f.initials,
        color: f.avatarColor,
        handicap: f.currentHandicap,
      })),
      ...groups
        .flatMap(g => g.members)
        .filter(m => !friends.some(f => f.profileId === m.profileId))
        .map(m => ({
          profileId: m.profileId,
          name: m.displayName,
          initials: m.initials,
          color: m.avatarColor,
          handicap: m.handicap,
        })),
      ...searchResults
        .filter(r => !friends.some(f => f.profileId === r.id))
        .map(r => ({
          profileId: r.id,
          name: r.displayName,
          initials: r.initials,
          color: r.avatarColor,
          handicap: r.currentHandicap,
        })),
    ];

    const selected = allProfiles.filter(p => selectedIds.has(p.profileId));
    
    if (selected.length > 0) {
      onAddPlayers(selected);
      onOpenChange(false);
    }
  };

  const handleQuickAdd = (profileId: string, name: string, initials: string, color: string, handicap: number) => {
    onAddPlayers([{ profileId, name, initials, color, handicap }]);
    onOpenChange(false);
  };

  const selectedCount = selectedIds.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {trs("Agregar desde Amigos")}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="friends">{trs("Mis Amigos")}</TabsTrigger>
            <TabsTrigger value="search">{trs("Buscar")}</TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="flex-1 mt-4 min-h-0">
            {/* Sección de grupos — solo si hay grupos */}
            {groups.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  {trs("Grupos")}
                </p>
                {groups.map(group => (
                  <div key={group.id} className="border border-border rounded-xl overflow-hidden">
                    {/* Header del grupo */}
                    <button
                      type="button"
                      onClick={() => setExpandedGroupId(
                        expandedGroupId === group.id ? null : group.id
                      )}
                      className="w-full flex items-center gap-3 p-3 bg-card hover:bg-muted/40 transition-colors text-left"
                    >
                      <span className="text-lg shrink-0">{group.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{group.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {group.members.length} {group.members.length !== 1 ? trs("jugadores") : trs("jugador")}
                        </p>
                      </div>
                      {/* Botón seleccionar todos */}
                      {group.members.length > 0 && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            const available = group.members
                              .filter(m => !existingSet.has(m.profileId))
                              .map(m => m.profileId);
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              const allSelected = available.every(id => next.has(id));
                              if (allSelected) {
                                available.forEach(id => next.delete(id));
                              } else {
                                available.forEach(id => next.add(id));
                              }
                              return next;
                            });
                          }}
                          className="text-[10px] text-primary border border-primary/30 rounded px-2 py-1 hover:bg-primary/5 transition-colors shrink-0"
                        >
                          {group.members.filter(m => !existingSet.has(m.profileId))
                            .every(m => selectedIds.has(m.profileId))
                            ? trs("Deselect") : trs("Todos")}
                        </button>
                      )}
                      <ChevronRight className={cn(
                        'h-4 w-4 text-muted-foreground transition-transform shrink-0',
                        expandedGroupId === group.id && 'rotate-90'
                      )} />
                    </button>

                    {/* Miembros expandidos */}
                    {expandedGroupId === group.id && (
                      <div className="border-t border-border divide-y divide-border">
                        {group.members.map(member => {
                          const isInRound = existingSet.has(member.profileId);
                          const isSelected = selectedIds.has(member.profileId);
                          return (
                            <button
                              key={member.profileId}
                              type="button"
                              disabled={isInRound}
                              onClick={() => {
                                if (isInRound) return;
                                setSelectedIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(member.profileId)) next.delete(member.profileId);
                                  else next.add(member.profileId);
                                  return next;
                                });
                              }}
                              className={cn(
                                'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                                isInRound ? 'opacity-50' : isSelected ? 'bg-primary/10' : 'hover:bg-muted/30'
                              )}
                            >
                              <div className={cn(
                                'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                                isSelected ? 'bg-primary border-primary' : 'border-border'
                              )}>
                                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                              </div>
                              <PlayerAvatar initials={member.initials} background={member.avatarColor} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{member.displayName}</p>
                                <p className="text-[10px] text-muted-foreground">HCP {member.handicap}</p>
                              </div>
                              {isInRound && (
                                <span className="text-[10px] text-muted-foreground shrink-0">{trs("Ya en ronda")}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground px-2">{trs("o busca todos tus amigos")}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </div>
            )}

            {/* Lista de amigos existente — sin cambios */}
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
              <ScrollArea className="h-[300px] pr-2">
                <div className="space-y-2">
                  {friends.map((friend) => {
                    const isInRound = existingSet.has(friend.profileId);
                    const isSelected = selectedIds.has(friend.profileId);
                    
                    return (
                      <SelectablePlayerCard
                        key={friend.profileId}
                        profileId={friend.profileId}
                        name={friend.displayName}
                        initials={friend.initials}
                        color={friend.avatarColor}
                        handicap={friend.currentHandicap}
                        isSelected={isSelected}
                        isDisabled={isInRound}
                        disabledReason={trs("Ya en ronda")}
                        onToggle={() => toggleSelection(friend.profileId)}
                        onQuickAdd={!multiSelect ? () => handleQuickAdd(
                          friend.profileId,
                          friend.displayName,
                          friend.initials,
                          friend.avatarColor,
                          friend.currentHandicap
                        ) : undefined}
                        multiSelect={multiSelect}
                      />
                    );
                  })}
                </div>
              </ScrollArea>
            )}
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
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">{trs("No se encontraron jugadores")}</p>
              </div>
            ) : (
              <ScrollArea className="h-[250px] pr-2">
                <div className="space-y-2">
                  {searchResults.map((result) => {
                    const isInRound = existingSet.has(result.id);
                    const isSelected = selectedIds.has(result.id);
                    
                    return (
                      <SelectablePlayerCard
                        key={result.id}
                        profileId={result.id}
                        name={result.displayName}
                        initials={result.initials}
                        color={result.avatarColor}
                        handicap={result.currentHandicap}
                        isSelected={isSelected}
                        isDisabled={isInRound}
                        disabledReason={trs("Ya en ronda")}
                        onToggle={() => toggleSelection(result.id)}
                        onQuickAdd={!multiSelect ? () => handleQuickAdd(
                          result.id,
                          result.displayName,
                          result.initials,
                          result.avatarColor,
                          result.currentHandicap
                        ) : undefined}
                        multiSelect={multiSelect}
                        showAddFriendHint={!result.isFriend}
                        onAddFriend={() => addFriend(result.id)}
                      />
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>

        {multiSelect && (
          <div className="flex justify-between items-center pt-4 border-t">
            <span className="text-sm text-muted-foreground">
              {selectedCount} {selectedCount !== 1 ? trs('seleccionados') : trs('seleccionado')}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {trs("Cancelar")}
              </Button>
              <Button onClick={handleConfirm} disabled={selectedCount === 0}>
                <UserPlus className="h-4 w-4 mr-1" />
                {trs('Agregar')} ({selectedCount})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Selectable player card
interface SelectablePlayerCardProps {
  profileId: string;
  name: string;
  initials: string;
  color: string;
  handicap: number;
  isSelected: boolean;
  isDisabled: boolean;
  disabledReason?: string;
  onToggle: () => void;
  onQuickAdd?: () => void;
  multiSelect: boolean;
  showAddFriendHint?: boolean;
  onAddFriend?: () => void;
}

const SelectablePlayerCard: React.FC<SelectablePlayerCardProps> = ({
  profileId,
  name,
  initials,
  color,
  handicap,
  isSelected,
  isDisabled,
  disabledReason,
  onToggle,
  onQuickAdd,
  multiSelect,
  showAddFriendHint,
  onAddFriend,
}) => {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        isDisabled
          ? 'bg-muted/50 opacity-60'
          : isSelected
          ? 'bg-primary/10 border-primary'
          : 'bg-card hover:bg-muted/50 cursor-pointer'
      }`}
      onClick={() => !isDisabled && (multiSelect ? onToggle() : onQuickAdd?.())}
    >
      {multiSelect && (
        <Checkbox
          checked={isSelected}
          disabled={isDisabled}
          onCheckedChange={() => !isDisabled && onToggle()}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <PlayerAvatar initials={initials} background={color} size="md" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{name}</p>
        <p className="text-xs text-muted-foreground">HCP: {handicap}</p>
      </div>
      {isDisabled && disabledReason && (
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
          {disabledReason}
        </span>
      )}
      {!isDisabled && !multiSelect && (
        <Button variant="outline" size="sm" className="text-xs h-8">
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          {trs("Agregar")}
        </Button>
      )}
      {showAddFriendHint && onAddFriend && !isDisabled && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onAddFriend();
          }}
          className="text-xs h-7 text-muted-foreground"
        >
          {trs("+ Amigo")}
        </Button>
      )}
    </div>
  );
};
