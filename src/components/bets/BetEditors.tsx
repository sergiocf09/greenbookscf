import React, { useState, useMemo, useEffect } from 'react';
import { BetConfig, BilateralHandicap, Player } from '@/types/golf';
import { fmtMoney } from '@/lib/formatMoney';
import { formatPlayerName, disambiguateInitials } from '@/lib/playerInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// Bet Amount Editor Component - Shows front/back/total for each bet type
interface BetAmountEditorProps {
  betType: string;
  initialValues?: { front?: number; back?: number; total?: number; unitsAdvantage?: number };
  betConfig: BetConfig;
  onSave: (overrides: { front?: number; back?: number; total?: number; unitsAdvantage?: number }) => void;
  onClose: () => void;
}

const BetAmountEditor: React.FC<BetAmountEditorProps> = ({
  betType,
  initialValues,
  betConfig,
  onSave,
  onClose,
}) => {
  // Get default amounts based on bet type with segments
  const getSegmentConfig = (): { front?: number; back?: number; total?: number } => {
    switch (betType) {
      case 'medal': 
        return { 
          front: betConfig.medal.frontAmount, 
          back: betConfig.medal.backAmount, 
          total: betConfig.medal.totalAmount 
        };
      case 'pressures': 
        return { 
          front: betConfig.pressures.frontAmount, 
          back: betConfig.pressures.backAmount, 
          total: betConfig.pressures.totalAmount 
        };
      case 'skins': 
        return { 
          front: betConfig.skins.frontValue, 
          back: betConfig.skins.backValue 
        };
      case 'caros': 
        return { total: betConfig.caros.amount };
      case 'oyeses':
        return { total: betConfig.oyeses.amount };
      case 'units': 
        return { total: betConfig.units.valuePerPoint };
      case 'manchas': 
        return { total: betConfig.manchas.valuePerPoint };
      case 'culebras': 
        return { total: betConfig.culebras.valuePerOccurrence };
      case 'pinguinos': 
        return { total: betConfig.pinguinos.valuePerOccurrence };
      case 'rayas':
        return { 
          front: betConfig.rayas?.frontValue || 25, 
          back: betConfig.rayas?.backValue || 25, 
          total: betConfig.rayas?.medalTotalValue || 50 
        };
      case 'putts':
        return {
          front: betConfig.putts?.frontAmount ?? 50,
          back: betConfig.putts?.backAmount ?? 50,
          total: betConfig.putts?.totalAmount ?? 0,
        };
      case 'matchPlay':
        return { total: (betConfig as any).matchPlay?.amount ?? 50 };
      default: 
        return {};
    }
  };

  const segmentConfig = getSegmentConfig();
  const [frontAmount, setFrontAmount] = useState(initialValues?.front ?? segmentConfig.front ?? 0);
  const [backAmount, setBackAmount] = useState(initialValues?.back ?? segmentConfig.back ?? 0);
  const [totalAmount, setTotalAmount] = useState(initialValues?.total ?? segmentConfig.total ?? 0);
  const [unitsAdvantage, setUnitsAdvantage] = useState(initialValues?.unitsAdvantage ?? 0);

  // When switching bet type (or reopening dialog), rehydrate from the per-pair overrides.
  React.useEffect(() => {
    setFrontAmount(initialValues?.front ?? segmentConfig.front ?? 0);
    setBackAmount(initialValues?.back ?? segmentConfig.back ?? 0);
    setTotalAmount(initialValues?.total ?? segmentConfig.total ?? 0);
    setUnitsAdvantage(initialValues?.unitsAdvantage ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betType]);

  const hasFront = segmentConfig.front !== undefined;
  const hasBack = segmentConfig.back !== undefined;
  const hasTotal = segmentConfig.total !== undefined;

  const handleSave = () => {
    onSave({
      ...(hasFront && { front: frontAmount }),
      ...(hasBack && { back: backAmount }),
      ...(hasTotal && { total: totalAmount }),
      ...(betType === 'units' && { unitsAdvantage }),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Modifica el importe de esta apuesta solo para este par de jugadores.
      </p>
      
      {hasFront && (
        <div className="flex items-center justify-between">
          <Label className="text-sm">Front 9:</Label>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setFrontAmount(Math.max(0, frontAmount - 25))}><Minus className="h-3 w-3" /></Button>
            <div className="flex items-center gap-0.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input type="number" value={frontAmount} onChange={(e) => setFrontAmount(parseInt(e.target.value) || 0)} className="w-20 h-8 text-center" min={0} step={25} />
            </div>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setFrontAmount(frontAmount + 25)}><Plus className="h-3 w-3" /></Button>
          </div>
        </div>
      )}
      
      {hasBack && (
        <div className="flex items-center justify-between">
          <Label className="text-sm">Back 9:</Label>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setBackAmount(Math.max(0, backAmount - 25))}><Minus className="h-3 w-3" /></Button>
            <div className="flex items-center gap-0.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input type="number" value={backAmount} onChange={(e) => setBackAmount(parseInt(e.target.value) || 0)} className="w-20 h-8 text-center" min={0} step={25} />
            </div>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setBackAmount(backAmount + 25)}><Plus className="h-3 w-3" /></Button>
          </div>
        </div>
      )}
      
      {hasTotal && (
        <div className="flex items-center justify-between">
          <Label className="text-sm">{hasFront || hasBack ? 'Total 18:' : 'Importe:'}</Label>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setTotalAmount(Math.max(0, totalAmount - 25))}><Minus className="h-3 w-3" /></Button>
            <div className="flex items-center gap-0.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input type="number" value={totalAmount} onChange={(e) => setTotalAmount(parseInt(e.target.value) || 0)} className="w-20 h-8 text-center" min={0} step={25} />
            </div>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setTotalAmount(totalAmount + 25)}><Plus className="h-3 w-3" /></Button>
          </div>
        </div>
      )}

      {betType === 'units' && (
        <div className="space-y-2 pt-3 border-t border-border/50">
          <Label className="text-sm font-semibold">Ventaja de Unidades</Label>
          <p className="text-xs text-muted-foreground">
            Unidades fijas que un jugador otorga al otro para equilibrar.
            El que da ventaja empieza debiendo ese número de unidades.
          </p>
          <div className="text-xs text-center text-muted-foreground italic">
            {unitsAdvantage === 0
              ? '— Sin ventaja —'
              : unitsAdvantage > 0
                ? `Tú das ${unitsAdvantage} unidad${unitsAdvantage !== 1 ? 'es' : ''}`
                : `Rival da ${Math.abs(unitsAdvantage)} unidad${Math.abs(unitsAdvantage) !== 1 ? 'es' : ''}`}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setUnitsAdvantage(v => v - 1)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className={cn(
              'min-w-[80px] text-center text-2xl font-bold tabular-nums',
              unitsAdvantage > 0 ? 'text-destructive'
                : unitsAdvantage < 0 ? 'text-green-600'
                : 'text-muted-foreground'
            )}>
              {unitsAdvantage === 0 ? '—' : (unitsAdvantage > 0 ? `+${unitsAdvantage}` : `${unitsAdvantage}`)}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setUnitsAdvantage(v => v + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            + = tú das ventaja · − = rival te da ventaja · 0 = sin ventaja
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Valores originales: {hasFront && `Front $${segmentConfig.front}`} {hasBack && `Back $${segmentConfig.back}`} {hasTotal && `${hasFront || hasBack ? 'Total' : ''} $${segmentConfig.total}`}
      </p>
      
      <div className="flex gap-2">
        <Button variant="outline" onClick={onClose} className="flex-1">
          Cancelar
        </Button>
        <Button onClick={handleSave} className="flex-1">
          Guardar
        </Button>
      </div>
    </div>
  );
};

// Bilateral Handicap Editor
interface BilateralHandicapEditorProps {
  player: Player;
  rival: Player;
  currentHandicap?: BilateralHandicap;
  onSave: (handicap: BilateralHandicap) => void;
}

const BilateralHandicapEditor: React.FC<BilateralHandicapEditorProps> = ({
  player,
  rival,
  currentHandicap,
  onSave,
}) => {
  // Correctly map handicaps based on stored player order
  const isPlayerA = currentHandicap?.playerAId === player.id;
  const [playerAHcp, setPlayerAHcp] = useState(
    currentHandicap 
      ? (isPlayerA ? currentHandicap.playerAHandicap : currentHandicap.playerBHandicap)
      : player.handicap
  );
  const [playerBHcp, setPlayerBHcp] = useState(
    currentHandicap 
      ? (isPlayerA ? currentHandicap.playerBHandicap : currentHandicap.playerAHandicap)
      : rival.handicap
  );
  
  const disambiguatedAbbrsHcp = useMemo(() => disambiguateInitials([player, rival]), [player, rival]);
  const getPlayerAbbr = (p: Player) => disambiguatedAbbrsHcp.get(p.id) || p.initials;
  const difference = Math.abs(playerAHcp - playerBHcp);
  const playerReceives = playerAHcp > playerBHcp;
  
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Este handicap se usará para <strong>todas las apuestas individuales</strong> entre estos dos jugadores (Medal, Presiones, Skins, Caros, Unidades, Manchas, etc.)
      </p>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs flex items-center gap-2">
            <div 
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: player.color }}
            >
              {getPlayerAbbr(player)}
            </div>
            {formatPlayerName(player.name)}
          </Label>
          <Input
            type="number"
            value={playerAHcp}
            onChange={(e) => setPlayerAHcp(Number(e.target.value))}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Original: {player.handicap}
          </p>
        </div>
        <div>
          <Label className="text-xs flex items-center gap-2">
            <div 
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: rival.color }}
            >
              {getPlayerAbbr(rival)}
            </div>
            {formatPlayerName(rival.name)}
          </Label>
          <Input
            type="number"
            value={playerBHcp}
            onChange={(e) => setPlayerBHcp(Number(e.target.value))}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Original: {rival.handicap}
          </p>
        </div>
      </div>
      
      {difference > 0 && (
        <div className="bg-muted/50 p-3 rounded-lg text-center">
          <p className="text-sm">
            <strong>{formatPlayerName(playerReceives ? player.name : rival.name)}</strong> recibe{' '}
            <span className="text-lg font-bold text-primary">{difference}</span> golpes
          </p>
        </div>
      )}
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setPlayerAHcp(player.handicap);
            setPlayerBHcp(rival.handicap);
          }}
          className="flex-1"
        >
          Restaurar Originales
        </Button>
        <Button
          onClick={() => onSave({
            playerAId: player.id,
            playerBId: rival.id,
            playerAHandicap: playerAHcp,
            playerBHandicap: playerBHcp,
          })}
          className="flex-1"
        >
          Guardar
        </Button>
      </div>
    </div>
  );
};

export { BetAmountEditor, BilateralHandicapEditor };
export type { BetAmountEditorProps, BilateralHandicapEditorProps };
