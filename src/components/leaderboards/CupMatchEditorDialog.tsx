import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatPlayerName } from '@/lib/playerInput';
import type { CupMatch, CupFormat, CupTeam, CupParticipant } from '@/hooks/useTeamsCup';
import { cupSlotKey, type CupDay } from '@/types/leaderboard';

interface Props {
  open: boolean;
  leaderboardId: string;
  match: CupMatch | null;
  teams: CupTeam[];
  participants: CupParticipant[];
  allMatches?: CupMatch[];
  defaultFormat: CupFormat;
  /** Configured days/sessions of the cup. */
  days?: CupDay[];
  /** Slot preselected when creating a new match. */
  defaultDay?: number;
  defaultSession?: number;
  /** Participants with the handicap that applies to a given slot. */
  participantsForSlot?: (day: number, session: number) => CupParticipant[];
  onClose: () => void;
  onSave: (params: Partial<CupMatch>) => void;
  calcMatchHandicap: (a: CupParticipant | undefined, b: CupParticipant | undefined) => {
    strokes_advantage: number;
    advantage_side: 'a' | 'b' | 'none';
  };
  calcFourballHandicap: (
    a1: CupParticipant | undefined, a2: CupParticipant | undefined,
    b1: CupParticipant | undefined, b2: CupParticipant | undefined,
  ) => {
    strokes_advantage: number;
    advantage_side: 'a' | 'b' | 'none';
    receiver_player_id: string | null;
    receiver_tied: boolean;
  };
}

export const CupMatchEditorDialog: React.FC<Props> = ({
  open, leaderboardId, match, teams, participants, allMatches = [], defaultFormat,
  days = [], defaultDay = 1, defaultSession = 1, participantsForSlot,
  onClose, onSave, calcMatchHandicap, calcFourballHandicap,
}) => {
  const [format, setFormat] = useState<CupFormat>(defaultFormat);
  const [dayNumber, setDayNumber] = useState<number>(defaultDay);
  const [sessionNumber, setSessionNumber] = useState<number>(defaultSession);
  const [playerA1, setPlayerA1] = useState<string | null>(null);
  const [playerA2, setPlayerA2] = useState<string | null>(null);
  const [playerB1, setPlayerB1] = useState<string | null>(null);
  const [playerB2, setPlayerB2] = useState<string | null>(null);
  const [strokesAdvantage, setStrokesAdvantage] = useState(0);
  const [advantageSide, setAdvantageSide] = useState<'a' | 'b' | 'none'>('none');
  const [strokeReceiverId, setStrokeReceiverId] = useState<string | null>(null);
  const [hcpManuallyEdited, setHcpManuallyEdited] = useState(false);
  const [resultOverride, setResultOverride] = useState(false);
  const [resultType, setResultType] = useState<'a_wins' | 'b_wins' | 'halved' | ''>('');
  const [resultDetail, setResultDetail] = useState('');
  const [pointsPerMatch, setPointsPerMatch] = useState<number>(1);

  useEffect(() => {
    if (match) {
      setFormat(match.format);
      setPlayerA1(match.player_a1_id);
      setPlayerA2(match.player_a2_id);
      setPlayerB1(match.player_b1_id);
      setPlayerB2(match.player_b2_id);
      setStrokesAdvantage(match.strokes_advantage);
      setAdvantageSide(match.advantage_side);
      setStrokeReceiverId(match.stroke_receiver_player_id ?? null);
      setHcpManuallyEdited(true); // existing match: don't auto-overwrite
      setResultOverride(match.result_override);
      setResultType(match.result_type || '');
      setResultDetail(match.result_detail || '');
      setPointsPerMatch(match.points_per_match ?? 1);
      setDayNumber(match.day_number ?? 1);
      setSessionNumber(match.session_number ?? 1);
    } else {
      setFormat(defaultFormat);
      setPlayerA1(null);
      setPlayerA2(null);
      setPlayerB1(null);
      setPlayerB2(null);
      setStrokesAdvantage(0);
      setAdvantageSide('none');
      setStrokeReceiverId(null);
      setHcpManuallyEdited(false);
      setResultOverride(false);
      setResultType('');
      setResultDetail('');
      setPointsPerMatch(1);
      setDayNumber(defaultDay);
      setSessionNumber(defaultSession);
    }
  }, [match, defaultFormat, open, defaultDay, defaultSession]);

  const teamA = teams[0];
  const teamB = teams[1];

  const slotParticipants = useMemo(
    () => participantsForSlot?.(dayNumber, sessionNumber) ?? participants,
    [participantsForSlot, participants, dayNumber, sessionNumber],
  );

  const multiSession = days.some(d => d.sessions.length > 1);
  const showSlotPicker = days.length > 1 || multiSession;
  const currentDay = days.find(d => d.day_number === dayNumber) ?? days[0];

  // Keep the session valid and inherit its configured format when the slot changes.
  useEffect(() => {
    if (!currentDay) return;
    const sess = currentDay.sessions.find(s => s.session_number === sessionNumber)
      ?? currentDay.sessions[0];
    if (!sess) return;
    if (sess.session_number !== sessionNumber) setSessionNumber(sess.session_number);
    if (!match) setFormat(sess.format);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNumber, sessionNumber, currentDay?.day_number, match]);

  const partsA = useMemo(() =>
    slotParticipants.filter(p => p.cup_team_id === teamA?.id), [slotParticipants, teamA]);
  const partsB = useMemo(() =>
    slotParticipants.filter(p => p.cup_team_id === teamB?.id), [slotParticipants, teamB]);

  const partA1 = slotParticipants.find(p => p.id === playerA1);
  const partA2 = slotParticipants.find(p => p.id === playerA2);
  const partB1 = slotParticipants.find(p => p.id === playerB1);
  const partB2 = slotParticipants.find(p => p.id === playerB2);

  // Compute "match number" for the header.
  // - Editing existing match → use its position (1-based) in allMatches.
  // - New match → next available number = existing count + 1.
  const matchNumber = useMemo(() => {
    if (match) {
      const idx = allMatches.findIndex(m => m.id === match.id);
      return idx >= 0 ? idx + 1 : allMatches.length + 1;
    }
    return allMatches.length + 1;
  }, [match, allMatches]);

  // Build a map of participant_id → array of team sides where they're already used
  // (excluding the current match being edited). Used to render colored dot indicators.
  const assignmentMap = useMemo(() => {
    const map = new Map<string, Array<'a' | 'b'>>();
    for (const m of allMatches) {
      if (match && m.id === match.id) continue;
      // Only flag conflicts inside the same day/session slot.
      if (cupSlotKey(m.day_number ?? 1, m.session_number ?? 1) !== cupSlotKey(dayNumber, sessionNumber)) continue;
      const aIds = [m.player_a1_id, m.player_a2_id].filter(Boolean) as string[];
      const bIds = [m.player_b1_id, m.player_b2_id].filter(Boolean) as string[];
      aIds.forEach(id => {
        const arr = map.get(id) || [];
        if (!arr.includes('a')) arr.push('a');
        map.set(id, arr);
      });
      bIds.forEach(id => {
        const arr = map.get(id) || [];
        if (!arr.includes('b')) arr.push('b');
        map.set(id, arr);
      });
    }
    return map;
  }, [allMatches, match, dayNumber, sessionNumber]);

  // Auto-compute handicap whenever players change (unless user manually edited).
  useEffect(() => {
    if (hcpManuallyEdited) return;
    if (format === 'match_individual') {
      if (!partA1 || !partB1) return;
      const r = calcMatchHandicap(partA1, partB1);
      setStrokesAdvantage(r.strokes_advantage);
      setAdvantageSide(r.advantage_side);
      setStrokeReceiverId(null);
    } else {
      if (!partA1 || !partA2 || !partB1 || !partB2) return;
      const r = calcFourballHandicap(partA1, partA2, partB1, partB2);
      setStrokesAdvantage(r.strokes_advantage);
      setAdvantageSide(r.advantage_side);
      setStrokeReceiverId(r.receiver_player_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerA1, playerA2, playerB1, playerB2, format, hcpManuallyEdited]);

  // Fourball: derive receiving pair + tie state for UI.
  const fourballInfo = useMemo(() => {
    if (format !== 'fourball' || advantageSide === 'none') return null;
    const pair = advantageSide === 'a'
      ? [partA1, partA2].filter(Boolean) as CupParticipant[]
      : [partB1, partB2].filter(Boolean) as CupParticipant[];
    if (pair.length !== 2) return null;
    const tied = pair[0].match_handicap === pair[1].match_handicap;
    return { pair, tied };
  }, [format, advantageSide, partA1, partA2, partB1, partB2]);

  const handleSave = () => {
    const payload: Partial<CupMatch> = {
      format,
      day_number: dayNumber,
      session_number: sessionNumber,
      player_a1_id: playerA1,
      player_a2_id: format === 'fourball' ? playerA2 : null,
      player_b1_id: playerB1,
      player_b2_id: format === 'fourball' ? playerB2 : null,
      strokes_advantage: strokesAdvantage,
      advantage_side: advantageSide,
      stroke_receiver_player_id: format === 'fourball' ? strokeReceiverId : null,
      result_override: resultOverride,
      result_type: resultOverride && resultType ? resultType as any : null,
      result_detail: resultOverride && resultDetail ? resultDetail : null,
      points_per_match: pointsPerMatch,
    };
    onSave(payload);
    onClose();
  };

  // Renders a colored dot for each team this player is already assigned to.
  const renderAssignmentDots = (playerId: string) => {
    const sides = assignmentMap.get(playerId);
    if (!sides || sides.length === 0) return null;
    return (
      <span className="inline-flex items-center gap-0.5 ml-1">
        {sides.map(side => (
          <span
            key={side}
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: side === 'a' ? (teamA?.color || '#3B82F6') : (teamB?.color || '#ef4444') }}
            title={`Ya asignado al ${side === 'a' ? teamA?.name : teamB?.name}`}
          />
        ))}
      </span>
    );
  };

  const renderPlayerSelect = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void,
    pool: CupParticipant[],
    teamColor: string,
  ) => (
    <div>
      <Label
        className="text-xs block text-center font-semibold"
        style={{ color: teamColor }}
      >
        {label}
      </Label>
      <Select value={value || '__none'} onValueChange={v => onChange(v === '__none' ? null : v)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Seleccionar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">— Sin asignar —</SelectItem>
          {pool.map(p => (
            <SelectItem key={p.id} value={p.id}>
              <span className="inline-flex items-center">
                {formatPlayerName(p.display_name)} (Hcp: {p.match_handicap})
                {renderAssignmentDots(p.id)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const teamALabel = teamA?.name || 'Equipo A';
  const teamBLabel = teamB?.name || 'Equipo B';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">
            Match {matchNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {showSlotPicker && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Día</Label>
                <Select value={String(dayNumber)} onValueChange={v => setDayNumber(Number(v))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {days.map(d => (
                      <SelectItem key={d.day_number} value={String(d.day_number)}>
                        {d.label?.trim() || `Día ${d.day_number}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sesión</Label>
                <Select value={String(sessionNumber)} onValueChange={v => setSessionNumber(Number(v))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(currentDay?.sessions ?? []).map(s => (
                      <SelectItem key={s.session_number} value={String(s.session_number)}>
                        {s.label?.trim() || `Sesión ${s.session_number}`}
                        {' · '}{s.format === 'fourball' ? 'Fourball' : 'Individual'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Players — labels show team name only (match number is in the dialog title) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              {renderPlayerSelect(
                format === 'fourball' ? `${teamALabel} · 1` : teamALabel,
                playerA1, setPlayerA1, partsA, teamA?.color || '#3B82F6',
              )}
              {format === 'fourball' && renderPlayerSelect(
                `${teamALabel} · 2`,
                playerA2, setPlayerA2, partsA, teamA?.color || '#3B82F6',
              )}
            </div>
            <div className="space-y-2">
              {renderPlayerSelect(
                format === 'fourball' ? `${teamBLabel} · 1` : teamBLabel,
                playerB1, setPlayerB1, partsB, teamB?.color || '#ef4444',
              )}
              {format === 'fourball' && renderPlayerSelect(
                `${teamBLabel} · 2`,
                playerB2, setPlayerB2, partsB, teamB?.color || '#ef4444',
              )}
            </div>
          </div>

          {/* Auto-computed handicap summary */}
          <div className="bg-muted/50 rounded-lg p-2 text-xs space-y-1">
            <p className="text-muted-foreground">
              {format === 'match_individual' ? 'Cálculo automático (diferencia de HCP):' : 'Cálculo automático (Full HCP — suma por pareja):'}
            </p>
            <p className="font-medium">
              {advantageSide === 'none' || strokesAdvantage === 0
                ? 'Scratch (0 golpes)'
                : `${advantageSide === 'a' ? teamALabel : teamBLabel} recibe ${strokesAdvantage} ${strokesAdvantage === 1 ? 'golpe' : 'golpes'}`}
            </p>
            {hcpManuallyEdited && (
              <button
                type="button"
                className="text-[11px] underline text-muted-foreground hover:text-foreground"
                onClick={() => setHcpManuallyEdited(false)}
              >
                ↺ Restaurar cálculo automático
              </button>
            )}
          </div>

          {/* Fourball: tie-breaker for who in the receiving pair carries strokes */}
          {format === 'fourball' && fourballInfo && strokesAdvantage > 0 && (
            <div>
              <Label className="text-xs">
                {fourballInfo.tied
                  ? '¿Quién lleva los strokes? (HCP empatados)'
                  : 'Lleva los strokes (mayor HCP de la pareja)'}
              </Label>
              <Select
                value={strokeReceiverId || (fourballInfo.pair[0]?.id ?? '')}
                onValueChange={v => { setStrokeReceiverId(v); setHcpManuallyEdited(true); }}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {fourballInfo.pair.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {formatPlayerName(p.display_name)} (HCP: {p.match_handicap})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Manual handicap override */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Golpes de ventaja</Label>
              <Input
                type="number"
                min={0}
                max={36}
                value={strokesAdvantage}
                onChange={e => { setStrokesAdvantage(parseInt(e.target.value) || 0); setHcpManuallyEdited(true); }}
                className="h-8 text-sm text-center"
              />
            </div>
            <div>
              <Label className="text-xs">¿Quién recibe?</Label>
              <Select value={advantageSide} onValueChange={v => { setAdvantageSide(v as any); setHcpManuallyEdited(true); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Scratch</SelectItem>
                  <SelectItem value="a">{teamALabel}</SelectItem>
                  <SelectItem value="b">{teamBLabel}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Points per match + Result override (compact row) */}
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Pts P/Match</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={pointsPerMatch}
                onChange={e => setPointsPerMatch(parseFloat(e.target.value) || 0)}
                className="h-8 text-sm text-center px-1 w-14"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Resultado manual</Label>
              <Switch checked={resultOverride} onCheckedChange={setResultOverride} />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-2">
            Empate (AS) reparte la mitad a cada equipo.
          </p>
          {resultOverride && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Resultado</Label>
                <Select value={resultType} onValueChange={v => setResultType(v as any)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_wins">{teamALabel} gana</SelectItem>
                    <SelectItem value="b_wins">{teamBLabel} gana</SelectItem>
                    <SelectItem value="halved">Empate (AS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Detalle</Label>
                <Input
                  placeholder="3&2, 1UP"
                  value={resultDetail}
                  onChange={e => setResultDetail(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSave}>
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
