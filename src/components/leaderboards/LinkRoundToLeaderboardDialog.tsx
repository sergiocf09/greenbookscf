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

type Step = 'select-leaderboard' | 'select-participants' | 'select-cup-match';

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

  // Participant selection — deduplicate the player list so the same person
  // appearing in multiple groups (e.g. when the round is also linked to
  // another leaderboard whose participants overlap) is only shown once.
  // Key by profileId when available, otherwise by lower-cased trimmed name.
  const allPlayers = React.useMemo(() => {
    const raw = getAllPlayersFromAllGroups(players, playerGroups);
    const seen = new Set<string>();
    const out: typeof raw = [];
    for (const p of raw) {
      const key = p.profileId
        ? `pid:${p.profileId}`
        : `name:${(p.name || '').trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }, [players, playerGroups]);

  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [handicaps, setHandicaps] = useState<Map<string, number>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [openMatches, setOpenMatches] = useState<any[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [linkingRoundId, setLinkingRoundId] = useState<string | null>(null);

  const {
    event: selectedEvent,
    participants: existingParticipants,
    addParticipant,
    linkRound,
  } = useLeaderboardDetail(selectedLeaderboardId);

  // Build a quick-lookup of who is already a participant in the selected
  // leaderboard so we can pre-deselect them (avoids accidentally adding
  // duplicates and gives the user a clear "already here" signal).
  const existingKeys = React.useMemo(() => {
    const s = new Set<string>();
    for (const ep of existingParticipants) {
      if (ep.profile_id) s.add(`pid:${ep.profile_id}`);
      else if (ep.display_name) s.add(`name:${ep.display_name.trim().toLowerCase()}`);
    }
    return s;
  }, [existingParticipants]);

  const playerKey = (p: { profileId?: string | null; name: string }) =>
    p.profileId
      ? `pid:${p.profileId}`
      : `name:${(p.name || '').trim().toLowerCase()}`;

  // Reset on open — pre-select only those NOT already in the leaderboard.
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
      setSelectedPlayerIds(
        new Set(
          allPlayers
            .filter(p => !existingKeys.has(playerKey(p)))
            .map(p => p.id),
        ),
      );
      setHandicaps(new Map(allPlayers.map(p => [p.id, p.handicap])));
    }
  }, [open, allPlayers, existingKeys, preselectedLeaderboardId]);

  const handleSelectLeaderboard = useCallback((leaderboardId: string) => {
    setSelectedLeaderboardId(leaderboardId);
    setStep('select-participants');
  }, []);

  const handleJoinByCode = useCallback(async () => {
    if (!joinCode.trim()) return;
    setSearching(true);
    const result = await joinByCode(joinCode.trim());
    setSearching(false);
    if (result) {
      handleSelectLeaderboard(result.id);
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
      // Link the round first (idempotent)
      await linkRound(roundId);

      // Fetch fresh participants from backend (avoid stale state when re-linking)
      const { data: currentParts, error: partsErr } = await supabase
        .from('leaderboard_participants')
        .select('profile_id, guest_name')
        .eq('leaderboard_id', selectedLeaderboardId)
        .eq('is_active', true);
      if (partsErr) throw partsErr;

      const current = currentParts ?? [];
      const existingProfileIds = new Set(current.map((p: any) => p.profile_id).filter(Boolean));
      const existingGuestNames = new Set(
        current.filter((p: any) => !p.profile_id && p.guest_name).map((p: any) => p.guest_name)
      );

      // Build batch of new participants — split profile-based vs guest-based
      const profileRows: any[] = [];
      const guestRows: any[] = [];

      for (const player of allPlayers) {
        if (!selectedPlayerIds.has(player.id)) continue;

        if (player.profileId) {
          if (existingProfileIds.has(player.profileId)) continue;
          profileRows.push({
            leaderboard_id: selectedLeaderboardId,
            profile_id: player.profileId,
            guest_name: null,
            guest_initials: null,
            guest_color: null,
            handicap_for_leaderboard: handicaps.get(player.id) ?? player.handicap,
            match_handicap: handicaps.get(player.id) ?? player.handicap,
            source_round_id: roundId,
          });
        } else {
          if (existingGuestNames.has(player.name)) continue;
          guestRows.push({
            leaderboard_id: selectedLeaderboardId,
            profile_id: null,
            guest_name: player.name,
            guest_initials: player.initials,
            guest_color: player.color,
            handicap_for_leaderboard: handicaps.get(player.id) ?? player.handicap,
            match_handicap: handicaps.get(player.id) ?? player.handicap,
            source_round_id: roundId,
          });
        }
      }

      // Use upsert with ignoreDuplicates to handle race conditions safely
      if (profileRows.length > 0) {
        const { error: insertErr } = await supabase
          .from('leaderboard_participants')
          .upsert(profileRows, {
            onConflict: 'leaderboard_id,profile_id',
            ignoreDuplicates: true,
          });
        if (insertErr) throw insertErr;
      }

      if (guestRows.length > 0) {
        const { error: insertErr } = await supabase
          .from('leaderboard_participants')
          .insert(guestRows);
        if (insertErr) throw insertErr;
      }

      // Check if Teams Cup → auto-link round to ALL unlinked matches so live results compute
      const { data: eventData } = await supabase
        .from('leaderboard_events')
        .select('competition_type')
        .eq('id', selectedLeaderboardId)
        .single();

      if ((eventData as any)?.competition_type === 'teams_cup') {
        const { error: cupErr } = await supabase
          .from('cup_matches')
          .update({ round_id: roundId, status: 'active' } as any)
          .eq('leaderboard_id', selectedLeaderboardId)
          .is('round_id', null);
        if (cupErr) {
          // Non-fatal: still consider the leaderboard linked
          console.warn('No se pudieron vincular automáticamente todos los matches:', cupErr);
        }
      }

      toast.success('Ronda vinculada al leaderboard');
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLinkMatch = async () => {
    if (selectedMatchId && linkingRoundId) {
      await supabase.from('cup_matches')
        .update({ round_id: linkingRoundId, status: 'active' } as any)
        .eq('id', selectedMatchId);
      toast.success('Ronda vinculada al match');
    } else {
      toast.success('Ronda vinculada al leaderboard');
    }
    onOpenChange(false);
  };

  const getMatchPlayerName = (participantId: string | null) => {
    if (!participantId) return '—';
    const part = existingParticipants.find(p => p.id === participantId);
    return part?.display_name || '—';
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
                    const alreadyIn = existingKeys.has(playerKey(player));

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
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{player.name}</span>
                          {alreadyIn && (
                            <span className="text-[10px] text-muted-foreground italic">
                              Ya está en este leaderboard
                            </span>
                          )}
                        </div>
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

          {step === 'select-cup-match' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                ¿Vincular esta ronda a algún match de la Teams Cup?
              </p>
              {openMatches.map((m: any) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMatchId(m.id === selectedMatchId ? null : m.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                    selectedMatchId === m.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="text-sm">
                    <span className="font-medium">{getMatchPlayerName(m.player_a1_id)}</span>
                    <span className="text-muted-foreground mx-1.5">vs</span>
                    <span className="font-medium">{getMatchPlayerName(m.player_b1_id)}</span>
                  </div>
                  {selectedMatchId === m.id && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleLinkMatch}>
                  {selectedMatchId ? 'Vincular al match' : 'No vincular ahora'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
