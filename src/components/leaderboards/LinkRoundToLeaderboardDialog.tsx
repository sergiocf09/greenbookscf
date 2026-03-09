import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Player, PlayerGroup } from '@/types/golf';
import { supabase } from '@/integrations/supabase/client';
import { useLeaderboards, useLeaderboardDetail } from '@/hooks/useLeaderboards';
import { getAllPlayersFromAllGroups } from '@/components/GroupSelector';
import { Loader2, Search, Trophy, ChevronRight, ArrowLeft, Check } from 'lucide-react';
import { toast } from 'sonner';

interface LinkRoundToLeaderboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId: string | null;
  players: Player[];
  playerGroups: PlayerGroup[];
  profileId?: string;
  preselectedLeaderboardId?: string | null;
}

type Step = 'select-leaderboard' | 'select-participants';

export const LinkRoundToLeaderboardDialog: React.FC<LinkRoundToLeaderboardDialogProps> = ({
  open,
  onOpenChange,
  roundId,
  players,
  playerGroups,
  profileId,
  preselectedLeaderboardId,
}) => {
  const { events, loading: loadingEvents, joinByCode } = useLeaderboards();
  const [step, setStep] = useState<Step>('select-leaderboard');
  const [selectedLeaderboardId, setSelectedLeaderboardId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [searching, setSearching] = useState(false);

  // Participant selection
  const allPlayers = getAllPlayersFromAllGroups(players, playerGroups);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [handicaps, setHandicaps] = useState<Map<string, number>>(new Map());
  const [submitting, setSubmitting] = useState(false);

  const {
    event: selectedEvent,
    participants: existingParticipants,
    addParticipant,
    linkRound,
  } = useLeaderboardDetail(selectedLeaderboardId);

  // Reset on open
  useEffect(() => {
    if (open) {
      if (preselectedLeaderboardId) {
        setSelectedLeaderboardId(preselectedLeaderboardId);
        setStep('select-participants');
      } else {
        setStep('select-leaderboard');
        setSelectedLeaderboardId(null);
      }
      setJoinCode('');
      setSelectedPlayerIds(new Set(allPlayers.map(p => p.id)));
      setHandicaps(new Map(allPlayers.map(p => [p.id, p.handicap])));
    }
  }, [open]);

  const handleSelectLeaderboard = useCallback((leaderboardId: string) => {
    setSelectedLeaderboardId(leaderboardId);
    setStep('select-participants');
  }, []);

  const handleJoinByCode = useCallback(async () => {
    if (!joinCode.trim()) return;
    setSearching(true);
    const eventId = await joinByCode(joinCode.trim());
    setSearching(false);
    if (eventId) {
      handleSelectLeaderboard(eventId);
    }
  }, [joinCode, joinByCode, handleSelectLeaderboard]);

  const togglePlayer = (playerId: string) => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const updateHandicap = (playerId: string, value: number) => {
    setHandicaps(prev => new Map(prev).set(playerId, value));
  };

  const handleSubmit = async () => {
    if (!selectedLeaderboardId || !roundId) return;
    setSubmitting(true);

    try {
      // Link the round first
      await linkRound(roundId);

      // Fetch fresh participants from backend (avoid stale state when re-linking)
      const { data: currentParts, error: partsErr } = await supabase
        .from('leaderboard_participants')
        .select('profile_id, guest_name')
        .eq('leaderboard_id', selectedLeaderboardId)
        .eq('is_active', true);
      if (partsErr) throw partsErr;

      const current = currentParts ?? [];

      // Build batch of new participants (filter out already-existing ones)
      const newRows: Array<{
        leaderboard_id: string;
        profile_id: string | null;
        guest_name: string | null;
        guest_initials: string | null;
        guest_color: string | null;
        handicap_for_leaderboard: number;
        source_round_id: string;
      }> = [];

      for (const player of allPlayers) {
        if (!selectedPlayerIds.has(player.id)) continue;

        const alreadyExists = current.some(
          (p: any) => p.profile_id === player.profileId || (p.guest_name && p.guest_name === player.name)
        );
        if (alreadyExists) continue;

        newRows.push({
          leaderboard_id: selectedLeaderboardId,
          profile_id: player.profileId || null,
          guest_name: player.profileId ? null : player.name,
          guest_initials: player.profileId ? null : player.initials,
          guest_color: player.profileId ? null : player.color,
          handicap_for_leaderboard: handicaps.get(player.id) ?? player.handicap,
          source_round_id: roundId,
        });
      }

      // Single batch insert instead of sequential calls
      if (newRows.length > 0) {
        const { error: insertErr } = await supabase
          .from('leaderboard_participants')
          .insert(newRows);
        if (insertErr) throw insertErr;
      }

      toast.success('Ronda vinculada al leaderboard');
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeEvents = events.filter(e => e.status === 'active');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'select-participants' && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setStep('select-leaderboard')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Trophy className="h-5 w-5 text-amber-500" />
            {step === 'select-leaderboard' ? 'Unir Ronda a Leaderboard' : 'Seleccionar Participantes'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {step === 'select-leaderboard' && (
            <>
              {/* Join by code */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Buscar por código</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: a1b2c3"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleJoinByCode} disabled={!joinCode.trim() || searching}>
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Active leaderboards list */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">O selecciona uno existente</Label>
                {loadingEvents ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : activeEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No hay leaderboards activos
                  </p>
                ) : (
                  activeEvents.map(ev => (
                    <button
                      key={ev.id}
                      onClick={() => handleSelectLeaderboard(ev.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
                    >
                      <div>
                        <p className="font-medium text-sm">{ev.name}</p>
                        <p className="text-xs text-muted-foreground">
                          #{ev.code} · {ev.scoring_modes.map(m => 
                            m === 'gross' ? 'Gross' : m === 'net' ? 'Neto' : 'Stb'
                          ).join(' · ')}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {step === 'select-participants' && (
            selectedEvent ? (
              <>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="font-medium text-sm">{selectedEvent.name}</p>
                  <p className="text-xs text-muted-foreground">
                    #{selectedEvent.code} · {selectedEvent.scoring_modes.map(m => 
                      m === 'gross' ? 'Gross' : m === 'net' ? 'Neto' : 'Stb'
                    ).join(' · ')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Selecciona jugadores y asigna handicap para el leaderboard
                  </Label>
                  {allPlayers.map(player => {
                    const isSelected = selectedPlayerIds.has(player.id);
                    const hcp = handicaps.get(player.id) ?? player.handicap;

                    return (
                      <div
                        key={player.id}
                        className="flex items-center gap-2 p-2 rounded-lg border border-border"
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => togglePlayer(player.id)}
                        />
                        <PlayerAvatar
                          initials={player.initials}
                          background={player.color}
                          size="sm"
                          isLoggedInUser={player.profileId === profileId}
                        />
                        <span className="flex-1 text-sm font-medium truncate">{player.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Hcp:</span>
                          <Input
                            type="number"
                            value={hcp}
                            onChange={e => updateHandicap(player.id, parseFloat(e.target.value) || 0)}
                            className="w-16 h-7 text-center text-sm"
                            disabled={!isSelected}
                            step="0.1"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={selectedPlayerIds.size === 0 || submitting}
                  className="w-full"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Vincular {selectedPlayerIds.size} jugador{selectedPlayerIds.size !== 1 ? 'es' : ''}
                </Button>
              </>
            ) : (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
