import React, { useState, useMemo } from 'react';
import { Plus, X, User, Users2, Calculator, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Player, PlayerGroup } from '@/types/golf';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { initialsFromPlayerName, validatePlayerName, formatPlayerName, disambiguateInitials } from '@/lib/playerInput';
import { toast } from 'sonner';
import { USGAHandicapDialog } from './USGAHandicapDialog';
import { useAuth } from '@/contexts/AuthContext';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { supabase } from '@/integrations/supabase/client';

const playerColors = [
  'bg-golf-green text-white',
  'bg-golf-gold text-golf-dark',
  'bg-golf-green-light text-golf-dark',
  'bg-golf-dark text-white',
  'bg-blue-600 text-white',
  'bg-purple-600 text-white',
  'bg-orange-600 text-white',
  'bg-pink-600 text-white',
  'bg-cyan-600 text-white',
  'bg-red-600 text-white',
  'bg-indigo-600 text-white',
  'bg-teal-600 text-white',
];

const TEE_OPTIONS = [
  { value: 'blue', label: 'Azul', bgClass: 'bg-blue-600' },
  { value: 'white', label: 'Blanco', bgClass: 'bg-white border border-gray-300' },
  { value: 'yellow', label: 'Amarillo', bgClass: 'bg-yellow-400' },
  { value: 'red', label: 'Rojo', bgClass: 'bg-red-600' },
];

interface PlayerSetupProps {
  players: Player[];
  onChange: (players: Player[]) => void;
  maxPlayers?: number;
  groups?: PlayerGroup[];
  onGroupsChange?: (groups: PlayerGroup[]) => void;
  multiGroupEnabled?: boolean;
  onAddGroupClick?: () => void;
  showAddGroupButton?: boolean;
  defaultTeeColor?: string; // Round's default tee color
  courseId?: string | null; // Current course for Course Handicap calculation
  onAddFromFriendsClick?: () => void; // Callback to open friends dialog
  organizerProfileId?: string | null; // Profile ID of the round organizer - cannot be deleted
}

export const PlayerSetup: React.FC<PlayerSetupProps> = ({
  players,
  onChange,
  maxPlayers = 6,
  groups = [],
  onGroupsChange,
  multiGroupEnabled = false,
  onAddGroupClick,
  showAddGroupButton = false,
  defaultTeeColor = 'white',
  courseId = null,
  onAddFromFriendsClick,
  organizerProfileId = null,
}) => {
  const { profile } = useAuth();
  const [newPlayerName, setNewPlayerName] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(groups[0]?.id || null);
  const [bulkCalculating, setBulkCalculating] = useState(false);
  
  // USGA Handicap dialog state
  const [usgaDialogOpen, setUsgaDialogOpen] = useState(false);
  const [selectedPlayerForUSGA, setSelectedPlayerForUSGA] = useState<{
    id: string;
    name: string;
    profileId: string | null;
    teeColor: string;
  } | null>(null);

  // Disambiguate initials when there are collisions
  const disambiguatedInitials = useMemo(() => disambiguateInitials(players), [players]);

  // Resolve profile_id for a player (could be the current user or need lookup)
  const getProfileIdForPlayer = async (player: Player): Promise<string | null> => {
    // Check if this player matches the logged-in user's profile
    if (profile && (
      player.name.toLowerCase() === profile.display_name.toLowerCase() ||
      player.id.startsWith('organizer') ||
      player.profileId === profile.id
    )) {
      return profile.id;
    }
    
    // If player has a stored profileId, use it
    if (player.profileId) {
      return player.profileId;
    }

    // Try to find a matching profile by display name
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .ilike('display_name', player.name)
      .maybeSingle();

    return data?.id || null;
  };

  const handleOpenUSGADialog = async (player: Player) => {
    const profileId = await getProfileIdForPlayer(player);
    
    if (!profileId) {
      toast.error('Este jugador no tiene un perfil registrado con historial de rondas');
      return;
    }

    setSelectedPlayerForUSGA({
      id: player.id,
      name: player.name,
      profileId,
      teeColor: player.teeColor || defaultTeeColor,
    });
    setUsgaDialogOpen(true);
  };

  const handleApplyUSGAHandicap = (handicap: number) => {
    if (!selectedPlayerForUSGA) return;
    
    updatePlayer(selectedPlayerForUSGA.id, { handicap });
    toast.success(`Handicap USGA ${handicap} aplicado a ${selectedPlayerForUSGA.name}`);
  };

  // Bulk calculate Course Handicaps for all players by recalculating from round history
  const handleBulkUSGACalculation = async () => {
    if (players.length === 0) return;
    setBulkCalculating(true);
    let updated = 0;
    let skipped = 0;

    try {
      // Step 1: Resolve all profile IDs in parallel
      const profileIdResults = await Promise.all(
        players.map(async (player) => ({
          player,
          profileId: await getProfileIdForPlayer(player),
        }))
      );

      const validPlayers = profileIdResults.filter(r => r.profileId !== null) as {
        player: Player;
        profileId: string;
      }[];

      if (validPlayers.length === 0) {
        toast.info('No se encontraron perfiles registrados para calcular handicaps');
        setBulkCalculating(false);
        return;
      }

      // Step 2: If course selected, batch-fetch tee data + par
      let courseTeesMap = new Map<string, { courseRating: number; slopeRating: number }>();
      let coursePar = 72;

      if (courseId) {
        const [teesResult, holesResult] = await Promise.all([
          supabase.from('course_tees').select('tee_color, course_rating, slope_rating').eq('course_id', courseId),
          supabase.from('course_holes').select('par').eq('course_id', courseId),
        ]);

        (teesResult.data || []).forEach(t => {
          courseTeesMap.set(t.tee_color, { courseRating: t.course_rating, slopeRating: t.slope_rating });
        });
        coursePar = (holesResult.data || []).reduce((sum, h) => sum + h.par, 0) || 72;
      }

      // Step 3: Calculate full USGA Handicap Index for each player from round history
      const { calculateHandicapIndexForProfile, calculateCourseHandicap } = await import('@/lib/usgaHandicap');

      const handicapUpdates = new Map<string, number>();

      // Process all players in parallel
      const results = await Promise.all(
        validPlayers.map(async ({ player, profileId }) => {
          try {
            const handicapIndex = await calculateHandicapIndexForProfile(profileId);
            return { player, profileId, handicapIndex };
          } catch (err) {
            console.warn(`[BulkUSGA] Error calculating for ${player.name}:`, err);
            return { player, profileId, handicapIndex: null };
          }
        })
      );

      for (const { player, handicapIndex } of results) {
        if (handicapIndex === null) {
          skipped++;
          continue;
        }

        let finalHandicap = Math.round(handicapIndex);

        if (courseId) {
          const playerTee = player.teeColor || defaultTeeColor;
          const teeData = courseTeesMap.get(playerTee);
          if (teeData) {
            finalHandicap = calculateCourseHandicap(
              handicapIndex, teeData.slopeRating, teeData.courseRating, coursePar
            );
          }
        }

        handicapUpdates.set(player.id, finalHandicap);
        updated++;
      }

      // Apply all updates in a single onChange call
      if (handicapUpdates.size > 0) {
        onChange(players.map(p => {
          const newHcp = handicapUpdates.get(p.id);
          return newHcp !== undefined ? { ...p, handicap: newHcp } : p;
        }));
      }

      // Count players with no profile
      skipped += profileIdResults.filter(r => !r.profileId).length;

      if (updated > 0) {
        toast.success(`Handicap calculado para ${updated} jugador${updated !== 1 ? 'es' : ''}`);
      }
      if (skipped > 0 && updated === 0) {
        toast.info('No se encontraron handicaps USGA persistidos para los jugadores');
      } else if (skipped > 0) {
        toast.info(`${skipped} jugador${skipped !== 1 ? 'es' : ''} sin Handicap Index`);
      }
    } catch (err) {
      console.error('[BulkUSGA] Critical error:', err);
      toast.error('Error al calcular handicaps');
    } finally {
      setBulkCalculating(false);
    }
  };

  const addPlayer = () => {
    if (!newPlayerName.trim() || players.length >= maxPlayers) return;

    let safeName = '';
    let initials = '';
    try {
      safeName = validatePlayerName(newPlayerName);
      initials = initialsFromPlayerName(safeName);
    } catch (e: any) {
      toast.error(e?.message || 'Nombre inválido');
      return;
    }

    const newPlayer: Player = {
      id: `player-${Date.now()}`,
      name: safeName,
      initials,
      color: playerColors[players.length % playerColors.length],
      handicap: 0, // Default to 0, user can optionally load USGA handicap
      teeColor: defaultTeeColor, // Inherit round's default tee color
    };

    onChange([...players, newPlayer]);
    setNewPlayerName('');
  };

  const removePlayer = (id: string) => {
    // Check if this player is the organizer - organizers cannot be removed
    const playerToRemove = players.find(p => p.id === id);
    if (playerToRemove && organizerProfileId && playerToRemove.profileId === organizerProfileId) {
      toast.error('El organizador de la ronda no puede ser eliminado');
      return;
    }
    onChange(players.filter(p => p.id !== id));
  };

  // Check if a player is the organizer (cannot be deleted)
  const isPlayerOrganizer = (player: Player): boolean => {
    if (!organizerProfileId) return false;
    return player.profileId === organizerProfileId;
  };

  const updatePlayer = (id: string, updates: Partial<Player>) => {
    onChange(players.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const addGroup = () => {
    if (!onGroupsChange) return;
    const newGroup: PlayerGroup = {
      id: `group-${Date.now()}`,
      name: `Grupo ${groups.length + 1}`,
      players: [],
    };
    onGroupsChange([...groups, newGroup]);
    setActiveGroupId(newGroup.id);
  };

  const removeGroup = (groupId: string) => {
    if (!onGroupsChange || groups.length <= 1) return;
    const groupToRemove = groups.find(g => g.id === groupId);
    if (groupToRemove) {
      // Move players back to first group
      const updatedGroups = groups.filter(g => g.id !== groupId);
      if (updatedGroups.length > 0) {
        updatedGroups[0].players = [...updatedGroups[0].players, ...groupToRemove.players];
      }
      onGroupsChange(updatedGroups);
      setActiveGroupId(updatedGroups[0]?.id || null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Jugadores ({players.length}/{maxPlayers})</Label>
        <div className="flex items-center gap-1">
          {/* Bulk USGA Calculator */}
          {players.length >= 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={handleBulkUSGACalculation}
              disabled={bulkCalculating}
              title="Calcular handicap USGA para todos"
            >
              {bulkCalculating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
            </Button>
          )}
          {multiGroupEnabled && onGroupsChange && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={addGroup}
              className="h-8 text-xs gap-1"
            >
              <Users2 className="h-3.5 w-3.5" />
              Agregar Grupo
            </Button>
          )}
        </div>
      </div>

      {/* Multi-group tabs */}
      {multiGroupEnabled && groups.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {groups.map((group, idx) => (
            <button
              key={group.id}
              onClick={() => setActiveGroupId(group.id)}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
                activeGroupId === group.id 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {group.name} ({group.players.length})
              {groups.length > 1 && (
                <X 
                  className="h-3 w-3 ml-1 hover:text-destructive" 
                  onClick={(e) => {
                    e.stopPropagation();
                    removeGroup(group.id);
                  }}
                />
              )}
            </button>
          ))}
        </div>
      )}
      
      {/* Player List - sorted with logged-in player first */}
      <div className="space-y-2">
        {[...players].sort((a, b) => {
          // Put logged-in player first
          const aIsLoggedIn = profile && (a.profileId === profile.id || a.id.startsWith('organizer'));
          const bIsLoggedIn = profile && (b.profileId === profile.id || b.id.startsWith('organizer'));
          if (aIsLoggedIn && !bIsLoggedIn) return -1;
          if (!aIsLoggedIn && bIsLoggedIn) return 1;
          return 0;
        }).map((player, index) => (
          <div 
            key={player.id}
            className="bg-card border border-border rounded-lg p-2 space-y-1"
          >
            {/* Row 1: Avatar + Name + Delete */}
            <div className="flex items-center gap-2">
              <PlayerAvatar
                initials={disambiguatedInitials.get(player.id) || player.initials}
                background={player.color || ''}
                size="md"
                isLoggedInUser={!!(profile && (player.profileId === profile.id || player.id.startsWith('organizer')))}
              />
              
              <div className="flex-1 min-w-0">
                <Input
                  value={player.name || ''}
                  maxLength={100}
                  onChange={(e) => {
                    const raw = e.target.value.slice(0, 100);
                    let initials = player.initials;
                    try {
                      initials = initialsFromPlayerName(raw);
                    } catch {
                      // While typing, it's ok if initials can't be derived yet.
                    }
                    updatePlayer(player.id, {
                      name: raw,
                      initials,
                    });
                  }}
                  className="h-7 text-sm"
                  placeholder="Nombre del jugador"
                />
              </div>

              {/* Hide delete button for organizer - organizer cannot be removed */}
              {!isPlayerOrganizer(player) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removePlayer(player.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Row 2: Tee + HCP + USGA calc */}
            <div className="flex items-center gap-2 pl-10">
              {/* Tee Selector */}
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-muted-foreground">Tee</Label>
                <select
                  value={player.teeColor || defaultTeeColor}
                  onChange={(e) => updatePlayer(player.id, { teeColor: e.target.value })}
                  className="h-7 w-20 text-xs rounded border border-border bg-background px-1"
                >
                  {TEE_OPTIONS.map((tee) => (
                    <option key={tee.value} value={tee.value}>
                      {tee.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-muted-foreground">HCP</Label>
                <Input
                  type="number"
                  value={player.handicap}
                  onChange={(e) => updatePlayer(player.id, { handicap: parseInt(e.target.value) || 0 })}
                  className="h-7 w-14 text-sm text-center"
                  min={0}
                  max={54}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                  onClick={() => handleOpenUSGADialog(player)}
                  title="Calcular handicap USGA"
                >
                  <Calculator className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Player */}
      {players.length < maxPlayers && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={newPlayerName}
              maxLength={100}
              onChange={(e) => setNewPlayerName(e.target.value.slice(0, 100))}
              placeholder="Nombre del nuevo jugador"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
            />
            <Button onClick={addPlayer} disabled={!newPlayerName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar
            </Button>
          </div>
          
          {/* Add from Friends Button */}
          {onAddFromFriendsClick && (
            <Button 
              variant="outline" 
              onClick={onAddFromFriendsClick}
              className="w-full"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Agregar desde Amigos
            </Button>
          )}
        </div>
      )}

      {players.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Agrega jugadores para comenzar</p>
        </div>
      )}

      {/* Add Group Button - always visible when enabled, regardless of player count */}
      {showAddGroupButton && onAddGroupClick && players.length >= 1 && (
        <Button 
          variant="outline" 
          onClick={onAddGroupClick}
          className="w-full mt-2"
        >
          <Users2 className="h-4 w-4 mr-2" />
          Agregar Otro Grupo de Juego
        </Button>
      )}

      {/* USGA Handicap Dialog */}
      <USGAHandicapDialog
        open={usgaDialogOpen}
        onOpenChange={setUsgaDialogOpen}
        profileId={selectedPlayerForUSGA?.profileId || null}
        playerName={selectedPlayerForUSGA?.name || ''}
        onApplyHandicap={handleApplyUSGAHandicap}
        courseId={courseId}
        teeColor={selectedPlayerForUSGA?.teeColor || defaultTeeColor}
      />
    </div>
  );
};