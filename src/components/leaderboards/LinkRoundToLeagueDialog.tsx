import { trs } from '@/i18n/tr';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Trophy, ChevronRight, ArrowLeft, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface LinkRoundToLeagueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaderboardId: string;
  onLinked?: () => void;
}

interface RoundRow {
  id: string;
  date: string;
  status: string;
  courseName: string;
  isOrganizer: boolean;
}

interface RoundPlayerRow {
  key: string;
  profileId: string | null;
  name: string;
  initials: string;
  color: string;
  handicap: number;
}

type Step = 'select-round' | 'select-participants';

export const LinkRoundToLeagueDialog: React.FC<LinkRoundToLeagueDialogProps> = ({
  open,
  onOpenChange,
  leaderboardId,
  onLinked,
}) => {
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>('select-round');
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [loadingRounds, setLoadingRounds] = useState(false);
  const [selectedRound, setSelectedRound] = useState<RoundRow | null>(null);
  const [roundPlayers, setRoundPlayers] = useState<RoundPlayerRow[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [handicaps, setHandicaps] = useState<Map<string, number>>(new Map());
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const playerKey = (p: { profileId: string | null; name: string }) =>
    p.profileId ? `pid:${p.profileId}` : `name:${p.name.trim().toLowerCase()}`;

  // Load rounds where the user is organizer or participant, excluding ones
  // already linked to this leaderboard.
  const fetchRounds = useCallback(async () => {
    if (!profile) return;
    setLoadingRounds(true);
    try {
      const [{ data: myPlayers }, { data: organized }, { data: linked }] = await Promise.all([
        supabase.from('round_players').select('round_id').eq('profile_id', profile.id),
        supabase.from('rounds').select('id').eq('organizer_id', profile.id),
        supabase.from('leaderboard_rounds').select('round_id').eq('leaderboard_id', leaderboardId),
      ]);

      const linkedIds = new Set((linked ?? []).map((r: any) => r.round_id));
      const ids = new Set<string>();
      (myPlayers ?? []).forEach((r: any) => ids.add(r.round_id));
      (organized ?? []).forEach((r: any) => ids.add(r.id));
      linkedIds.forEach(id => ids.delete(id));

      if (ids.size === 0) {
        setRounds([]);
        return;
      }

      const { data: roundsData, error } = await supabase
        .from('rounds')
        .select('id, date, status, organizer_id, golf_courses(name)')
        .in('id', [...ids])
        .order('date', { ascending: false })
        .limit(50);
      if (error) throw error;

      setRounds(
        (roundsData ?? []).map((r: any) => ({
          id: r.id,
          date: r.date,
          status: r.status,
          courseName: r.golf_courses?.name ?? '',
          isOrganizer: r.organizer_id === profile.id,
        })),
      );
    } catch (err: any) {
      toast.error(trs('Error cargando rondas: ') + err.message);
    } finally {
      setLoadingRounds(false);
    }
  }, [profile, leaderboardId]);

  useEffect(() => {
    if (open) {
      setStep('select-round');
      setSelectedRound(null);
      setRoundPlayers([]);
      fetchRounds();
    }
  }, [open, fetchRounds]);

  const handleSelectRound = useCallback(
    async (round: RoundRow) => {
      setSelectedRound(round);
      setStep('select-participants');
      setLoadingPlayers(true);
      try {
        const [{ data: playersData, error }, { data: existingParts }] = await Promise.all([
          supabase
            .from('round_players')
            .select('id, profile_id, guest_name, guest_initials, guest_color, handicap_for_round, profiles(display_name, initials, avatar_color)')
            .eq('round_id', round.id),
          supabase
            .from('leaderboard_participants')
            .select('profile_id, guest_name')
            .eq('leaderboard_id', leaderboardId)
            .eq('is_active', true),
        ]);
        if (error) throw error;

        const existing = new Set<string>();
        for (const ep of existingParts ?? []) {
          if ((ep as any).profile_id) existing.add(`pid:${(ep as any).profile_id}`);
          else if ((ep as any).guest_name)
            existing.add(`name:${(ep as any).guest_name.trim().toLowerCase()}`);
        }
        setExistingKeys(existing);

        // Deduplicate by profile/name
        const seen = new Set<string>();
        const rows: RoundPlayerRow[] = [];
        for (const rp of playersData ?? []) {
          const prof = (rp as any).profiles;
          const name = prof?.display_name ?? (rp as any).guest_name ?? '';
          const row: RoundPlayerRow = {
            key: (rp as any).id,
            profileId: (rp as any).profile_id ?? null,
            name,
            initials: prof?.initials ?? (rp as any).guest_initials ?? '?',
            color: prof?.avatar_color ?? (rp as any).guest_color ?? '#888',
            handicap: (rp as any).handicap_for_round ?? 0,
          };
          const k = playerKey(row);
          if (seen.has(k)) continue;
          seen.add(k);
          rows.push(row);
        }
        setRoundPlayers(rows);
        setSelectedKeys(new Set(rows.filter(r => !existing.has(playerKey(r))).map(r => r.key)));
        setHandicaps(new Map(rows.map(r => [r.key, r.handicap])));
      } catch (err: any) {
        toast.error(trs('Error cargando jugadores: ') + err.message);
      } finally {
        setLoadingPlayers(false);
      }
    },
    [leaderboardId],
  );

  const togglePlayer = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateHandicap = (key: string, value: number) => {
    setHandicaps(prev => new Map(prev).set(key, value));
  };

  const handleSubmit = async () => {
    if (!selectedRound || !profile) return;
    setSubmitting(true);
    try {
      // Link the round (idempotent)
      const { data: existingLink } = await supabase
        .from('leaderboard_rounds')
        .select('id')
        .eq('leaderboard_id', leaderboardId)
        .eq('round_id', selectedRound.id)
        .maybeSingle();

      if (!existingLink) {
        const { error: linkErr } = await supabase.from('leaderboard_rounds').insert({
          leaderboard_id: leaderboardId,
          round_id: selectedRound.id,
          added_by: profile.id,
        });
        if (linkErr) throw linkErr;
      }

      // Fresh participants to avoid duplicates
      const { data: currentParts, error: partsErr } = await supabase
        .from('leaderboard_participants')
        .select('profile_id, guest_name')
        .eq('leaderboard_id', leaderboardId)
        .eq('is_active', true);
      if (partsErr) throw partsErr;

      const current = currentParts ?? [];
      const existingProfileIds = new Set(current.map((p: any) => p.profile_id).filter(Boolean));
      const existingGuestNames = new Set(
        current.filter((p: any) => !p.profile_id && p.guest_name).map((p: any) => p.guest_name),
      );

      const profileRows: any[] = [];
      const guestRows: any[] = [];

      for (const player of roundPlayers) {
        if (!selectedKeys.has(player.key)) continue;
        const hcp = handicaps.get(player.key) ?? player.handicap;

        if (player.profileId) {
          if (existingProfileIds.has(player.profileId)) continue;
          profileRows.push({
            leaderboard_id: leaderboardId,
            profile_id: player.profileId,
            guest_name: null,
            guest_initials: null,
            guest_color: null,
            handicap_for_leaderboard: hcp,
            match_handicap: hcp,
            source_round_id: selectedRound.id,
          });
        } else {
          if (existingGuestNames.has(player.name)) continue;
          guestRows.push({
            leaderboard_id: leaderboardId,
            profile_id: null,
            guest_name: player.name,
            guest_initials: player.initials,
            guest_color: player.color,
            handicap_for_leaderboard: hcp,
            match_handicap: hcp,
            source_round_id: selectedRound.id,
          });
        }
      }

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

      toast.success(trs('Ronda vinculada a la liga'));
      onOpenChange(false);
      onLinked?.();
    } catch (err: any) {
      toast.error(trs('Error: ') + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'select-participants' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setStep('select-round')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Trophy className="h-5 w-5 text-amber-500" />
            {step === 'select-round'
              ? trs('Vincular Ronda a la Liga')
              : trs('Seleccionar Participantes')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {step === 'select-round' && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {trs('Selecciona una de tus rondas')}
              </Label>
              {loadingRounds ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : rounds.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {trs('No tienes rondas disponibles para vincular')}
                </p>
              ) : (
                rounds.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectRound(r)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{r.courseName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(r.date), 'dd/MM/yyyy')}
                        {' · '}
                        {r.status === 'completed'
                          ? trs('Cerrada')
                          : r.status === 'in_progress'
                            ? trs('En curso')
                            : trs('En preparación')}
                        {r.isOrganizer && (
                          <span className="ml-1 text-[10px] text-primary font-semibold">
                            {trs('· Organizador')}
                          </span>
                        )}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}

          {step === 'select-participants' && (
            <>
              {selectedRound && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="font-medium text-sm truncate">{selectedRound.courseName}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(selectedRound.date), 'dd/MM/yyyy')}
                  </p>
                </div>
              )}

              {loadingPlayers ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {trs('Selecciona jugadores y asigna handicap para la liga')}
                  </Label>
                  {roundPlayers.map(player => {
                    const isSelected = selectedKeys.has(player.key);
                    const hcp = handicaps.get(player.key) ?? player.handicap;
                    const alreadyIn = existingKeys.has(playerKey(player));

                    return (
                      <div
                        key={player.key}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-lg border border-border',
                          !isSelected && 'opacity-60',
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => togglePlayer(player.key)}
                        />
                        <PlayerAvatar
                          initials={player.initials}
                          background={player.color}
                          size="sm"
                          isLoggedInUser={player.profileId === profile?.id}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{player.name}</span>
                          {alreadyIn && (
                            <span className="text-[10px] text-muted-foreground italic">
                              {trs('Ya está en esta liga')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Hcp:</span>
                          <Input
                            type="number"
                            value={hcp}
                            onChange={e =>
                              updateHandicap(player.key, parseFloat(e.target.value) || 0)
                            }
                            className="w-16 h-7 text-center text-sm"
                            disabled={!isSelected}
                            step="0.1"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={selectedKeys.size === 0 || submitting || loadingPlayers}
                className="w-full"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trophy className="h-4 w-4 mr-2" />
                )}
                {trs('Vincular')} ({selectedKeys.size})
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
