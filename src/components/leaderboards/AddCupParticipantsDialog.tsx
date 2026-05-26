import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFriends } from '@/hooks/useFriends';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatPlayerName, initialsFromPlayerName } from '@/lib/playerInput';
import { Loader2, Search, UserPlus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { CupTeam } from '@/hooks/useTeamsCup';
import { TeePicker, type TeeColor } from '@/components/leaderboards/TeePicker';

const GUEST_COLORS = [
  '#3B82F6', '#ef4444', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308',
];

interface Props {
  open: boolean;
  onClose: () => void;
  leaderboardId: string;
  teams: CupTeam[];
  existingProfileIds: Set<string>;
  existingGuestNames: Set<string>;
  onAdded: () => void;
}

type TeamChoice = string | null; // cup_team_id or null = sin asignar

interface Selection {
  team: TeamChoice;
  hcp: number;       // HCP Index (decimal allowed)
  tee: TeeColor;
}

const parseIndex = (raw: string): number => {
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : 0;
};

export const AddCupParticipantsDialog: React.FC<Props> = ({
  open, onClose, leaderboardId, teams, existingProfileIds, existingGuestNames, onAdded,
}) => {
  const teamA = teams[0] ?? null;
  const teamB = teams[1] ?? null;
  const { friends, loading: loadingFriends, searchResults, searching, fetchFriends, searchProfiles, clearSearch } = useFriends();

  const [tab, setTab] = useState<'friends' | 'search' | 'guest'>('friends');
  const [submitting, setSubmitting] = useState(false);

  // Friend selections — key = profileId
  const [friendSel, setFriendSel] = useState<Map<string, Selection>>(new Map());

  // Search selections — key = profileId
  const [searchSel, setSearchSel] = useState<Map<string, Selection>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');

  // Guest form
  const [guestName, setGuestName] = useState('');
  const [guestInitials, setGuestInitials] = useState('');
  const [guestColor, setGuestColor] = useState(GUEST_COLORS[0]);
  const [guestHcp, setGuestHcp] = useState<number>(20);
  const [guestTee, setGuestTee] = useState<TeeColor>('white');
  const [guestTeam, setGuestTeam] = useState<TeamChoice>(null);
  const [pendingGuests, setPendingGuests] = useState<Array<{
    name: string; initials: string; color: string; hcp: number; team: TeamChoice; tee: TeeColor;
  }>>([]);

  useEffect(() => {
    if (open) {
      fetchFriends();
      setFriendSel(new Map());
      setSearchSel(new Map());
      setSearchQuery('');
      clearSearch();
      setGuestName('');
      setGuestInitials('');
      setGuestColor(GUEST_COLORS[0]);
      setGuestHcp(20);
      setGuestTee('white');
      setGuestTeam(null);
      setPendingGuests([]);
      setTab('friends');
    }
  }, [open, fetchFriends, clearSearch]);

  // Debounced search
  useEffect(() => {
    if (tab !== 'search') return;
    const t = setTimeout(() => {
      if (searchQuery.trim().length >= 2) searchProfiles(searchQuery.trim());
      else clearSearch();
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, tab, searchProfiles, clearSearch]);

  // Auto-derive initials when typing guest name (only if user hasn't manually overridden)
  const [guestInitialsTouched, setGuestInitialsTouched] = useState(false);
  useEffect(() => {
    if (guestInitialsTouched) return;
    const trimmed = guestName.trim();
    if (!trimmed) { setGuestInitials(''); return; }
    try {
      setGuestInitials(initialsFromPlayerName(trimmed).slice(0, 3));
    } catch {
      setGuestInitials('');
    }
  }, [guestName, guestInitialsTouched]);

  const availableFriends = useMemo(
    () => friends.filter(f => !existingProfileIds.has(f.profileId)),
    [friends, existingProfileIds]
  );

  const toggleFriend = (id: string, defaultHcp: number) => {
    setFriendSel(prev => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, { team: null, hcp: defaultHcp, tee: 'white' });
      return next;
    });
  };
  const updateFriend = (id: string, patch: Partial<Selection>) => {
    setFriendSel(prev => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, ...patch });
      return next;
    });
  };

  const toggleSearch = (id: string, defaultHcp: number) => {
    setSearchSel(prev => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, { team: null, hcp: defaultHcp, tee: 'white' });
      return next;
    });
  };
  const updateSearch = (id: string, patch: Partial<Selection>) => {
    setSearchSel(prev => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, ...patch });
      return next;
    });
  };

  const addPendingGuest = () => {
    const name = guestName.trim();
    if (!name) { toast.error('Escribe el nombre'); return; }
    if (existingGuestNames.has(name) || pendingGuests.some(g => g.name === name)) {
      toast.error('Ese invitado ya está en la lista');
      return;
    }
    setPendingGuests(prev => [...prev, {
      name,
      initials: (guestInitials || initialsFromPlayerName(name)).slice(0, 3).toUpperCase(),
      color: guestColor,
      hcp: guestHcp,
      team: guestTeam,
      tee: guestTee,
    }]);
    setGuestName('');
    setGuestInitials('');
    setGuestInitialsTouched(false);
    setGuestHcp(20);
    setGuestTee('white');
    setGuestTeam(null);
  };

  const removePendingGuest = (idx: number) => {
    setPendingGuests(prev => prev.filter((_, i) => i !== idx));
  };

  const totalToAdd = friendSel.size + searchSel.size + pendingGuests.length;

  const handleSubmit = async () => {
    if (totalToAdd === 0) {
      toast.error('Selecciona al menos un jugador');
      return;
    }
    setSubmitting(true);
    try {
      const rows: any[] = [];

      // Friends → profile-based participants
      for (const f of availableFriends) {
        const sel = friendSel.get(f.profileId);
        if (!sel) continue;
        rows.push({
          leaderboard_id: leaderboardId,
          profile_id: f.profileId,
          guest_name: null,
          guest_initials: null,
          guest_color: null,
          handicap_for_leaderboard: sel.hcp,
          match_handicap: Math.round(sel.hcp),
          cup_team_id: sel.team,
          tee_color: sel.tee,
          is_active: true,
        });
      }

      // Search results → profile-based participants
      for (const r of searchResults) {
        const sel = searchSel.get(r.id);
        if (!sel) continue;
        if (existingProfileIds.has(r.id)) continue;
        // Avoid duplicate against friend row
        if (rows.some(x => x.profile_id === r.id)) continue;
        rows.push({
          leaderboard_id: leaderboardId,
          profile_id: r.id,
          guest_name: null,
          guest_initials: null,
          guest_color: null,
          handicap_for_leaderboard: sel.hcp,
          match_handicap: Math.round(sel.hcp),
          cup_team_id: sel.team,
          tee_color: sel.tee,
          is_active: true,
        });
      }

      const profileRows = rows.filter(r => r.profile_id);
      const guestRows = pendingGuests.map(g => ({
        leaderboard_id: leaderboardId,
        profile_id: null,
        guest_name: g.name,
        guest_initials: g.initials,
        guest_color: g.color,
        handicap_for_leaderboard: g.hcp,
        match_handicap: Math.round(g.hcp),
        cup_team_id: g.team,
        tee_color: g.tee,
        is_active: true,
      }));

      if (profileRows.length > 0) {
        // Upsert WITHOUT ignoreDuplicates so previously-removed (is_active=false)
        // players get reactivated and their team/HCP/tee updated on re-add.
        const { error } = await supabase
          .from('leaderboard_participants')
          .upsert(profileRows, { onConflict: 'leaderboard_id,profile_id' });
        if (error) throw error;
      }
      if (guestRows.length > 0) {
        const { error } = await supabase
          .from('leaderboard_participants')
          .insert(guestRows);
        if (error) throw error;
      }

      toast.success(`${profileRows.length + guestRows.length} jugador(es) agregado(s)`);
      onAdded();
      onClose();
    } catch (err: any) {
      toast.error('Error al agregar: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Team picker chip group used in each row
  const TeamPicker: React.FC<{ value: TeamChoice; onChange: (v: TeamChoice) => void }> = ({ value, onChange }) => (
    <div className="flex gap-1 shrink-0">
      {teamA && (
        <button
          type="button"
          onClick={() => onChange(value === teamA.id ? null : teamA.id)}
          className="w-7 h-7 rounded-md border-2 text-[10px] font-bold transition-all"
          style={{
            borderColor: teamA.color,
            backgroundColor: value === teamA.id ? teamA.color : 'transparent',
            color: value === teamA.id ? '#fff' : teamA.color,
          }}
          aria-label={`Asignar a ${teamA.name}`}
        >A</button>
      )}
      {teamB && (
        <button
          type="button"
          onClick={() => onChange(value === teamB.id ? null : teamB.id)}
          className="w-7 h-7 rounded-md border-2 text-[10px] font-bold transition-all"
          style={{
            borderColor: teamB.color,
            backgroundColor: value === teamB.id ? teamB.color : 'transparent',
            color: value === teamB.id ? '#fff' : teamB.color,
          }}
          aria-label={`Asignar a ${teamB.name}`}
        >B</button>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm max-h-[88vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Agregar Jugadores
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="friends" className="text-xs">Amigos</TabsTrigger>
            <TabsTrigger value="search" className="text-xs">Buscar</TabsTrigger>
            <TabsTrigger value="guest" className="text-xs">Invitado</TabsTrigger>
          </TabsList>

          {/* ── Friends ── */}
          <TabsContent value="friends" className="mt-3 space-y-2">
            {loadingFriends ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : availableFriends.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-4">
                {friends.length === 0
                  ? 'Aún no tienes amigos. Usa Buscar para encontrar jugadores.'
                  : 'Todos tus amigos ya están en esta competencia.'}
              </p>
            ) : (
              availableFriends.map(f => {
                const sel = friendSel.get(f.profileId);
                const checked = !!sel;
                return (
                  <div key={f.profileId} className="flex items-center gap-2 p-1.5 border rounded-lg min-w-0">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleFriend(f.profileId, f.currentHandicap)}
                    />
                    <PlayerAvatar initials={f.initials} background={f.avatarColor} size="sm" />
                    <span className="text-xs font-medium truncate flex-1 min-w-0">{formatPlayerName(f.displayName)}</span>
                    {checked && (
                      <>
                        <TeamPicker value={sel!.team} onChange={(v) => updateFriend(f.profileId, { team: v })} />
                        <TeePicker value={sel!.tee} onChange={(v) => updateFriend(f.profileId, { tee: v })} />
                        <Input
                          type="number"
                          step="0.1"
                          min="-10"
                          max="54"
                          value={sel!.hcp}
                          onChange={(e) => updateFriend(f.profileId, { hcp: parseIndex(e.target.value) })}
                          className="w-14 h-7 px-1 text-center text-xs shrink-0"
                          aria-label="Index"
                          title="HCP Index"
                        />
                      </>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* ── Search ── */}
          <TabsContent value="search" className="mt-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 h-8 text-xs"
              />
            </div>
            {searching ? (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : searchQuery.trim().length < 2 ? (
              <p className="text-[10px] text-muted-foreground italic text-center py-3">
                Escribe al menos 2 letras.
              </p>
            ) : searchResults.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-3">Sin resultados.</p>
            ) : (
              searchResults
                .filter(r => !existingProfileIds.has(r.id))
                .map(r => {
                  const sel = searchSel.get(r.id);
                  const checked = !!sel;
                  return (
                    <div key={r.id} className="flex items-center gap-2 p-1.5 border rounded-lg min-w-0">
                      <Checkbox checked={checked} onCheckedChange={() => toggleSearch(r.id, r.currentHandicap)} />
                      <PlayerAvatar initials={r.initials} background={r.avatarColor} size="sm" />
                      <span className="text-xs font-medium truncate flex-1 min-w-0">{formatPlayerName(r.displayName)}</span>
                      {checked && (
                        <>
                          <TeamPicker value={sel!.team} onChange={(v) => updateSearch(r.id, { team: v })} />
                          <TeePicker value={sel!.tee} onChange={(v) => updateSearch(r.id, { tee: v })} />
                          <Input
                            type="number"
                            step="0.1"
                            min="-10"
                            max="54"
                            value={sel!.hcp}
                            onChange={(e) => updateSearch(r.id, { hcp: parseIndex(e.target.value) })}
                            className="w-14 h-7 px-1 text-center text-xs shrink-0"
                            aria-label="Index"
                            title="HCP Index"
                          />
                        </>
                      )}
                    </div>
                  );
                })
            )}
          </TabsContent>

          {/* ── Guest ── */}
          <TabsContent value="guest" className="mt-3 space-y-3">
            <div className="space-y-2">
              <div>
                <Label className="text-[10px]">Nombre</Label>
                <Input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Iniciales</Label>
                  <Input
                    value={guestInitials}
                    onChange={(e) => { setGuestInitialsTouched(true); setGuestInitials(e.target.value.toUpperCase().slice(0, 3)); }}
                    maxLength={3}
                    className="h-8 text-xs text-center font-bold"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Index</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="-10"
                    max="54"
                    value={guestHcp}
                    onChange={(e) => setGuestHcp(parseIndex(e.target.value))}
                    className="h-8 text-xs text-center"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px] block mb-1">Tee de salida</Label>
                <TeePicker value={guestTee} onChange={setGuestTee} size="sm" />
              </div>
              <div>
                <Label className="text-[10px]">Color</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {GUEST_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setGuestColor(c)}
                      className="w-6 h-6 rounded-full border-2"
                      style={{
                        backgroundColor: c,
                        borderColor: guestColor === c ? 'hsl(var(--foreground))' : 'transparent',
                      }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-[10px] block mb-1">Equipo (opcional)</Label>
                <TeamPicker value={guestTeam} onChange={setGuestTeam} />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1"
                onClick={addPendingGuest}
                disabled={!guestName.trim()}
              >
                <Plus className="h-3.5 w-3.5" /> Añadir a la lista
              </Button>
            </div>

            {pendingGuests.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t">
                <p className="text-[10px] font-semibold text-muted-foreground">Invitados por agregar ({pendingGuests.length})</p>
                {pendingGuests.map((g, idx) => {
                  const teamName = g.team === teamA?.id ? teamA?.name : g.team === teamB?.id ? teamB?.name : 'Sin equipo';
                  return (
                    <div key={idx} className="flex items-center gap-2 p-1.5 border rounded-lg min-w-0">
                      <PlayerAvatar initials={g.initials} background={g.color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{formatPlayerName(g.name)}</p>
                        <p className="text-[10px] text-muted-foreground">HCP {g.hcp} · {teamName}</p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => removePendingGuest(idx)}>
                        ✕
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex gap-2 pt-3 border-t mt-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={submitting || totalToAdd === 0}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Agregar ({totalToAdd})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
