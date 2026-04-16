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
import type { CupMatch, CupFormat, CupTeam, CupParticipant } from '@/hooks/useTeamsCup';

interface Props {
  open: boolean;
  leaderboardId: string;
  match: CupMatch | null;
  teams: CupTeam[];
  participants: CupParticipant[];
  defaultFormat: CupFormat;
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
  open, leaderboardId, match, teams, participants, defaultFormat,
  onClose, onSave, calcMatchHandicap, calcFourballHandicap,
}) => {
  const [format, setFormat] = useState<CupFormat>(defaultFormat);
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
      setResultOverride(match.result_override);
      setResultType(match.result_type || '');
      setResultDetail(match.result_detail || '');
      setPointsPerMatch(match.points_per_match ?? 1);
    } else {
      setFormat(defaultFormat);
      setPlayerA1(null);
      setPlayerA2(null);
      setPlayerB1(null);
      setPlayerB2(null);
      setStrokesAdvantage(0);
      setAdvantageSide('none');
      setResultOverride(false);
      setResultType('');
      setResultDetail('');
      setPointsPerMatch(1);
    }
  }, [match, defaultFormat, open]);

  const teamA = teams[0];
  const teamB = teams[1];

  const partsA = useMemo(() =>
    participants.filter(p => p.cup_team_id === teamA?.id), [participants, teamA]);
  const partsB = useMemo(() =>
    participants.filter(p => p.cup_team_id === teamB?.id), [participants, teamB]);

  const partA1 = participants.find(p => p.id === playerA1);
  const partB1 = participants.find(p => p.id === playerB1);

  const suggested = useMemo(() => {
    if (!partA1 || !partB1) return null;
    return calcMatchHandicap(partA1, partB1);
  }, [partA1, partB1, calcMatchHandicap]);

  const handleSave = () => {
    const payload: Partial<CupMatch> = {
      format,
      player_a1_id: playerA1,
      player_a2_id: format === 'fourball' ? playerA2 : null,
      player_b1_id: playerB1,
      player_b2_id: format === 'fourball' ? playerB2 : null,
      strokes_advantage: strokesAdvantage,
      advantage_side: advantageSide,
      result_override: resultOverride,
      result_type: resultOverride && resultType ? resultType as any : null,
      result_detail: resultOverride && resultDetail ? resultDetail : null,
      points_per_match: pointsPerMatch,
    };
    onSave(payload);
    onClose();
  };

  const renderPlayerSelect = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void,
    pool: CupParticipant[],
    teamColor: string,
  ) => (
    <div>
      <Label className="text-xs" style={{ color: teamColor }}>{label}</Label>
      <Select value={value || '__none'} onValueChange={v => onChange(v === '__none' ? null : v)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Seleccionar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">— Sin asignar —</SelectItem>
          {pool.map(p => (
            <SelectItem key={p.id} value={p.id}>
              {p.display_name} (Hcp: {p.match_handicap})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{match ? 'Editar Match' : 'Nuevo Match'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Players */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              {renderPlayerSelect('Jugador A1', playerA1, setPlayerA1, partsA, teamA?.color || '#3B82F6')}
              {format === 'fourball' && renderPlayerSelect('Jugador A2', playerA2, setPlayerA2, partsA, teamA?.color || '#3B82F6')}
            </div>
            <div className="space-y-2">
              {renderPlayerSelect('Jugador B1', playerB1, setPlayerB1, partsB, teamB?.color || '#ef4444')}
              {format === 'fourball' && renderPlayerSelect('Jugador B2', playerB2, setPlayerB2, partsB, teamB?.color || '#ef4444')}
            </div>
          </div>

          {/* Suggested handicap */}
          {suggested && (playerA1 && playerB1) && (
            <div className="bg-muted/50 rounded-lg p-2 text-xs space-y-1">
              <p className="text-muted-foreground">
                Hándicap sugerido:{' '}
                {suggested.strokes_advantage === 0
                  ? 'Scratch'
                  : `${suggested.advantage_side === 'a' ? teamA?.name : teamB?.name} recibe ${suggested.strokes_advantage} golpes`}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => {
                  setStrokesAdvantage(suggested.strokes_advantage);
                  setAdvantageSide(suggested.advantage_side);
                }}
              >
                Aplicar
              </Button>
            </div>
          )}

          {/* Manual handicap */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Golpes de ventaja</Label>
              <Input
                type="number"
                min={0}
                max={36}
                value={strokesAdvantage}
                onChange={e => setStrokesAdvantage(parseInt(e.target.value) || 0)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">¿Quién recibe?</Label>
              <Select value={advantageSide} onValueChange={v => setAdvantageSide(v as any)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Scratch</SelectItem>
                  <SelectItem value="a">{teamA?.name || 'Equipo A'}</SelectItem>
                  <SelectItem value="b">{teamB?.name || 'Equipo B'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Points per match */}
          <div>
            <Label className="text-xs">Puntos del match</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={pointsPerMatch}
              onChange={e => setPointsPerMatch(parseFloat(e.target.value) || 0)}
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Empate (AS) reparte la mitad a cada equipo.
            </p>
          </div>

          {/* Result override */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">Ingresar resultado manualmente</Label>
            <Switch checked={resultOverride} onCheckedChange={setResultOverride} />
          </div>
          {resultOverride && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Resultado</Label>
                <Select value={resultType} onValueChange={v => setResultType(v as any)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_wins">A gana</SelectItem>
                    <SelectItem value="b_wins">B gana</SelectItem>
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
