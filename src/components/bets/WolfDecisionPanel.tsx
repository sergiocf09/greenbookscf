import { trs } from '@/i18n/tr';
import React, { useState, useMemo } from 'react';
import { Player, WolfConfig, WolfHoleState } from '@/types/golf';
import { computeWolfStateHoleValue } from '@/lib/bets/wolf';
import { disambiguateInitials } from '@/lib/playerInput';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fmtMoney } from '@/lib/formatMoney';

interface WolfDecisionPanelProps {
  holeNumber: number;
  players: Player[];
  wolfPlayerId: string;
  holeState: WolfHoleState | null;
  wolfConfig: WolfConfig;
  isOrganizer: boolean;
  currentUserId: string | null;
  onDecision: (partnerIds: string[], wentSolo: boolean, redemptionMode?: 'normal' | 'all_in') => Promise<void>;
  onRevert?: (holeNumber: number) => Promise<void>;
  isRedemption?: boolean;
  redemptionCandidateId?: string;
  redemptionCandidateLoss?: number;
  regularWolfPlayerId?: string;
}

const timingLabels: Record<string, string> = { A: 'Antes del driver', B: 'Al pegar el driver', C: 'Antes del 2° golpe' };

export const WolfDecisionPanel: React.FC<WolfDecisionPanelProps> = ({
  holeNumber, players, wolfPlayerId, holeState, wolfConfig, isOrganizer,
  currentUserId, onDecision, onRevert, redemptionCandidateId, redemptionCandidateLoss = 0, regularWolfPlayerId,
}) => {
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [redemptionMode, setRedemptionMode] = useState<'pending' | 'accepted' | 'declined'>('pending');
  const [redemptionStep, setRedemptionStep] = useState<'accept' | 'choose_mode' | 'choose_partner'>('accept');
  const [redemptionBetMode, setRedemptionBetMode] = useState<'normal' | 'all_in' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const disambiguated = useMemo(() => disambiguateInitials(players), [players]);
  const participants = players.filter(p => !wolfConfig.participantIds?.length || wolfConfig.participantIds.includes(p.id));
  const offeringRecovery = !!redemptionCandidateId && redemptionMode !== 'declined' && (!holeState || editing);
  const decidingId = offeringRecovery ? redemptionCandidateId : ((!editing ? holeState?.wolfPlayerId : undefined) ?? regularWolfPlayerId ?? wolfPlayerId);
  const wolfPlayer = players.find(p => p.id === decidingId);
  if (!wolfPlayer) return null;
  const canDecide = isOrganizer || (!!currentUserId && wolfPlayer.profileId === currentUserId);
  const maxPartners = participants.length >= 6 ? 2 : 1;
  const otherPlayers = participants.filter(p => p.id !== decidingId);
  const loss = Math.abs(redemptionCandidateLoss);
  const effectiveHV = holeState ? computeWolfStateHoleValue(wolfConfig, holeState) : wolfConfig.holeValue;
  const teamSize = holeState ? 1 + holeState.partnerIds.length : 1;
  const pairs = teamSize * (participants.length - teamSize);
  const perPair = pairs > 0 ? effectiveHV / pairs : effectiveHV;
  const mode = holeState?.redemptionMode ?? redemptionBetMode;
  const togglePartner = (id: string) => setSelectedPartners(prev => prev.includes(id)
    ? prev.filter(x => x !== id) : prev.length >= maxPartners ? [...prev.slice(1), id] : [...prev, id]);
  const reset = () => {
    setSelectedPartners([]); setRedemptionMode('pending'); setRedemptionStep('accept'); setRedemptionBetMode(null); setError(false);
  };
  const decide = async (solo: boolean) => {
    setSaving(true); setError(false);
    try {
      await onDecision(solo ? [] : selectedPartners, solo, offeringRecovery ? redemptionBetMode ?? 'normal' : undefined);
      setSelectedPartners([]); setEditing(false); setRedemptionMode('accepted');
    } catch { setError(true); } finally { setSaving(false); }
  };
  const partnerSelection = <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{offeringRecovery && redemptionBetMode === 'all_in'
      ? `🔥 All-in ($${fmtMoney(loss)}) · ${trs('Elige pareja o ve solo ×2:')}` : trs('Elige pareja o ve solo ×2:')}</p>
    <div className="flex flex-wrap gap-2">{otherPlayers.map(p => <Button key={p.id} size="sm"
      variant={selectedPartners.includes(p.id) ? 'default' : 'outline'} disabled={saving}
      onClick={() => togglePartner(p.id)} aria-pressed={selectedPartners.includes(p.id)} className="text-xs gap-1.5">
      <PlayerAvatar initials={disambiguated.get(p.id) ?? p.initials} background={p.color} size="xs" isLoggedInUser={p.profileId === currentUserId} />
      {p.name.split(' ')[0]}
    </Button>)}</div>
    <div className="flex gap-2">
      <Button size="sm" className="flex-1" disabled={saving || !selectedPartners.length} onClick={() => decide(false)}>{trs('Con pareja')}</Button>
      <Button size="sm" variant="outline" disabled={saving} onClick={() => decide(true)}>{trs('🐺 Solo ×2')}</Button>
    </div>
    {offeringRecovery && <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setSelectedPartners([]); setRedemptionStep('choose_mode'); }}>{trs('← Volver')}</Button>}
  </div>;
  return <div className="rounded-lg border border-border overflow-hidden mb-3">
    <div className="bg-primary text-primary-foreground px-3 py-2">
      <div className="flex items-center gap-2"><span>🐺</span>
        <PlayerAvatar initials={disambiguated.get(wolfPlayer.id) ?? wolfPlayer.initials} background={wolfPlayer.color} size="sm" isLoggedInUser={wolfPlayer.profileId === currentUserId} />
        <span className="font-semibold text-sm">{wolfPlayer.name.split(' ')[0]}</span><span className="text-xs">{trs('— La Loba')}</span>
        {(offeringRecovery || holeState?.redemptionMode) && <Badge variant="secondary" className="ml-auto text-[9px]">{trs('Recuperación')}</Badge>}
      </div>
      <p className="text-[10px] mt-1 opacity-80">{mode === 'all_in'
        ? `${trs('Apuesta:')} $${fmtMoney(holeState?.allInAmount ?? loss)} (${trs('saldo perdido')})`
        : `$${fmtMoney(wolfConfig.holeValue)} ${trs('valor del hoyo')} · ${trs(timingLabels[wolfConfig.timing] ?? wolfConfig.timing)}`}</p>
    </div>
    <div className="p-3 bg-card space-y-2">
      {(!holeState || editing) && (canDecide ? offeringRecovery ? <>
        {redemptionStep === 'accept' && <div className="space-y-3">
          <p className="text-xs text-muted-foreground">🔥 <strong>{wolfPlayer.name.split(' ')[0]}</strong> {trs('va perdiendo')} <strong>-${fmtMoney(loss)}</strong>. {trs('¿Toma La Loba en H18?')}</p>
          <div className="flex gap-2"><Button size="sm" className="flex-1" onClick={() => setRedemptionStep('choose_mode')}>{trs('🐺 Sí, tomo La Loba')}</Button>
            <Button size="sm" variant="outline" onClick={() => { setRedemptionMode('declined'); setSelectedPartners([]); }}>{trs('Declinar')}</Button></div>
        </div>}
        {redemptionStep === 'choose_mode' && <div className="space-y-2">
          <p className="text-xs font-medium">{trs('¿Qué apuesta eliges?')}</p>
          <Button variant="outline" className="w-full h-auto whitespace-normal text-left justify-start p-2.5" onClick={() => { setRedemptionBetMode('normal'); setRedemptionStep('choose_partner'); }}>
            <span><span className="block text-xs font-semibold">{trs('Opción A — Valor normal del hoyo')}</span>
              <span className="block text-[11px] font-normal mt-1">${fmtMoney(wolfConfig.holeValue)} {trs('(+ carryover si aplica). Puedes elegir pareja o ir solo ×2.')}</span></span>
          </Button>
          <Button variant="outline" className="w-full h-auto whitespace-normal text-left justify-start p-2.5 border-destructive text-destructive" onClick={() => { setRedemptionBetMode('all_in'); setRedemptionStep('choose_partner'); }}>
            <span><span className="block text-xs font-semibold">{trs('Opción B — Apostar todo el saldo perdido')}</span>
              <span className="block text-[11px] font-normal mt-1">{trs('Valor total con pareja:')} ${fmtMoney(loss)} · {trs('Solo ×2:')} ${fmtMoney(loss * 2)}</span></span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRedemptionStep('accept')}>{trs('← Volver')}</Button>
        </div>}
        {redemptionStep === 'choose_partner' && partnerSelection}
      </> : partnerSelection : <p className="text-xs text-muted-foreground italic">{trs(offeringRecovery ? 'Esperando decisión de recuperación…' : 'Esperando decisión de La Loba…')}</p>)}
      {holeState && !editing && <>
        <div className="flex flex-wrap gap-2">
          {holeState.redemptionMode === 'all_in' ? <Badge variant="destructive">🔥 All-in · {trs(holeState.wentSolo ? 'Solo ×2' : 'Con pareja')}</Badge>
            : holeState.wentSolo ? <Badge variant="secondary">{trs('🐺 Sola ×2')}</Badge> : holeState.partnerIds.map(id => <Badge key={id} variant="secondary">{players.find(p => p.id === id)?.name.split(' ')[0]}</Badge>)}
          {holeState.redemptionMode !== 'all_in' && holeState.carryoverHoles > 0 && <Badge variant="secondary">↑ Carry +{holeState.carryoverHoles}</Badge>}
        </div>
        {holeState.result === null ? <p className="text-xs text-muted-foreground">{trs('Valor efectivo del hoyo:')} <strong className="text-foreground">${fmtMoney(effectiveHV)}</strong> · ${fmtMoney(perPair)}/{trs('ganador')}</p>
          : <div className={`rounded-md px-3 py-2 text-sm font-medium ${holeState.result === 'lost' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'}`}>
            {holeState.result === 'tied' ? trs('↔ Empate') : <>{trs(holeState.redemptionMode === 'all_in'
              ? holeState.result === 'won' ? '✅ Recuperación ganada' : '❌ Recuperación perdida'
              : holeState.result === 'won' ? '✅ La Loba ganó' : '❌ La Loba perdió')} · {holeState.result === 'won' ? '+' : '-'}${fmtMoney(perPair)}/{trs('ganador')}</>}
          </div>}
        {canDecide && <Button size="sm" variant="outline" disabled={saving} onClick={async () => {
          if (holeState.result === null) { reset(); setEditing(true); return; }
          if (!onRevert) return;
          setSaving(true); setError(false);
          try { await onRevert(holeNumber); reset(); setEditing(false); } catch { setError(true); } finally { setSaving(false); }
        }}>{trs('Cambiar')}</Button>}
      </>}
      {error && <p role="alert" className="text-xs text-destructive">{trs('No se pudo guardar la decisión. Intenta de nuevo.')}</p>}
    </div>
  </div>;
};
