import React, { useMemo } from 'react';
import { BetConfig, Player, RayasSegmentConfig, RayasBilateralOverride, RayasSkinVariant, OyesModality, RayasOyesMode } from '@/types/golf';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CollapsibleSubSection } from './CollapsibleSubSection';
import { formatPlayerName } from '@/lib/playerInput';
import { AmountInput } from './AmountInput';

interface RayasConfigProps {
  config: BetConfig;
  players: Player[];
  basePlayerId?: string;
  onUpdateRayas: (updates: Partial<BetConfig['rayas']>) => void;
}

const SEGMENT_LABELS: Record<string, { name: string; emoji: string }> = {
  skins: { name: 'Skins', emoji: '🎯' },
  units: { name: 'Unidades', emoji: '⭐' },
  oyes: { name: 'Oyes', emoji: '📍' },
  medal: { name: 'Medal', emoji: '🏅' },
};

const SEGMENT_KEYS = ['skins', 'units', 'oyes', 'medal'] as const;

export const RayasConfig: React.FC<RayasConfigProps> = ({
  config,
  players,
  basePlayerId,
  onUpdateRayas,
}) => {
  const [expandedBilateral, setExpandedBilateral] = React.useState(false);
  
  const rayas = config.rayas ?? { enabled: false, frontValue: 25, backValue: 50, medalTotalValue: 25, skinVariant: 'acumulados', oyesMode: 'allVsAll' as const };
  
  const getSegmentConfig = (segmentKey: string): RayasSegmentConfig => {
    const seg = rayas.segments?.[segmentKey as keyof typeof rayas.segments];
    return seg ?? { enabled: true, frontValue: rayas.frontValue, backValue: rayas.backValue };
  };
  
  const updateSegment = (segmentKey: string, updates: Partial<RayasSegmentConfig>) => {
    const currentSegments = rayas.segments ?? {
      skins: { enabled: true, frontValue: rayas.frontValue, backValue: rayas.backValue },
      units: { enabled: true, frontValue: rayas.frontValue, backValue: rayas.backValue },
      oyes: { enabled: true, frontValue: rayas.frontValue, backValue: rayas.backValue },
      medal: { enabled: true, frontValue: rayas.frontValue, backValue: rayas.backValue },
    };
    
    onUpdateRayas({
      segments: {
        ...currentSegments,
        [segmentKey]: { ...currentSegments[segmentKey as keyof typeof currentSegments], ...updates },
      },
    });
  };
  
  const getBilateralOverrides = (): RayasBilateralOverride[] => {
    if (!basePlayerId) return [];
    return rayas.bilateralOverrides?.[basePlayerId] ?? [];
  };
  
  const updateBilateralOverride = (rivalId: string, updates: Partial<RayasBilateralOverride>) => {
    if (!basePlayerId) return;
    
    const currentOverrides = rayas.bilateralOverrides ? { ...rayas.bilateralOverrides } : {};
    const playerOverrides = [...(currentOverrides[basePlayerId] ?? [])];
    
    const existingIdx = playerOverrides.findIndex(o => o.rivalId === rivalId);
    if (existingIdx >= 0) {
      playerOverrides[existingIdx] = { ...playerOverrides[existingIdx], ...updates };
    } else {
      playerOverrides.push({ rivalId, enabled: true, ...updates });
    }
    
    currentOverrides[basePlayerId] = playerOverrides;
    onUpdateRayas({ bilateralOverrides: currentOverrides });
  };
  
  const getRivalOverride = (rivalId: string): RayasBilateralOverride | undefined => {
    return getBilateralOverrides().find(o => o.rivalId === rivalId);
  };
  
  const rivals = useMemo(() => {
    if (!basePlayerId) return [];
    return players.filter(p => p.id !== basePlayerId && p.profileId !== basePlayerId);
  }, [players, basePlayerId]);

  // Per-player skin variant helpers
  const getPlayerSkinVariant = (playerId: string): RayasSkinVariant => {
    return rayas.playerSkinVariants?.[playerId] ?? rayas.skinVariant ?? 'acumulados';
  };

  const updatePlayerSkinVariant = (playerId: string, variant: RayasSkinVariant) => {
    const current = rayas.playerSkinVariants ? { ...rayas.playerSkinVariants } : {};
    current[playerId] = variant;
    onUpdateRayas({ playerSkinVariants: current });
  };

  // Count how many players differ from default
  const customSkinVariantCount = players.filter(p => {
    const pv = rayas.playerSkinVariants?.[p.id];
    return pv !== undefined && pv !== (rayas.skinVariant ?? 'acumulados');
  }).length;

  const configSummary = `${(rayas.skinVariant ?? 'acumulados') === 'acumulados' ? 'Acum' : 'Sin Acum'} · ${(rayas as any).oyesMode === 'singleWinner' ? '1 Ganador' : 'Todos vs Todos'} · ${(rayas.oyesModality ?? 'acumulados') === 'sangron' ? 'Sang' : 'Acum'}${customSkinVariantCount > 0 ? ` · ${customSkinVariantCount} personaliz.` : ''}`;

  return (
    <div className="space-y-4">
      {/* Global values - always visible */}
      <div className="space-y-1">
        <AmountInput label="Front 9" value={rayas.frontValue} onChange={(v) => {
          const updates: Partial<typeof rayas> = { frontValue: v };
          // Cascade to segments whose frontValue matched the OLD global value
          if (rayas.segments) {
            const oldGlobal = rayas.frontValue;
            const newSegments = { ...rayas.segments };
            let changed = false;
            for (const key of Object.keys(newSegments) as Array<keyof typeof newSegments>) {
              const seg = newSegments[key];
              if (seg && seg.frontValue === oldGlobal) {
                newSegments[key] = { ...seg, frontValue: v };
                changed = true;
              }
            }
            if (changed) updates.segments = newSegments;
          }
          onUpdateRayas(updates);
        }} />
        <AmountInput label="Back 9" value={rayas.backValue} onChange={(v) => {
          const updates: Partial<typeof rayas> = { backValue: v };
          // Cascade to segments whose backValue matched the OLD global value
          if (rayas.segments) {
            const oldGlobal = rayas.backValue;
            const newSegments = { ...rayas.segments };
            let changed = false;
            for (const key of Object.keys(newSegments) as Array<keyof typeof newSegments>) {
              const seg = newSegments[key];
              if (seg && seg.backValue === oldGlobal) {
                newSegments[key] = { ...seg, backValue: v };
                changed = true;
              }
            }
            if (changed) updates.segments = newSegments;
          }
          onUpdateRayas(updates);
        }} />
        <AmountInput label="Medal Total" value={rayas.medalTotalValue} onChange={(v) => onUpdateRayas({ medalTotalValue: v })} />
      </div>

      {/* Configuration - collapsed by default */}
      <CollapsibleSubSection label="Configuración" summary={configSummary}>
        <div className="space-y-4">
          {/* Skin variant (default) - immediately visible */}
          <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
            <Label className="text-xs text-muted-foreground">Variante Skins</Label>
            <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()}>
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateRayas({ skinVariant: 'acumulados' as RayasSkinVariant }); }}
                className={cn("px-2 py-1 text-[10px] rounded transition-colors",
                  (rayas.skinVariant ?? 'acumulados') === 'acumulados' ? "bg-golf-gold text-golf-dark font-medium" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}>Acum</button>
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateRayas({ skinVariant: 'sinAcumulacion' as RayasSkinVariant }); }}
                className={cn("px-2 py-1 text-[10px] rounded transition-colors",
                  (rayas.skinVariant ?? 'acumulados') === 'sinAcumulacion' ? "bg-primary text-primary-foreground font-medium" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}>Sin Acum</button>
            </div>
          </div>

          {/* Oyes Mode Selector - immediately visible */}
          <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
            <Label className="text-xs text-muted-foreground">Modalidad Oyeses</Label>
            <Select value={(rayas as any).oyesMode ?? 'allVsAll'} onValueChange={(value) => onUpdateRayas({ oyesMode: value as RayasOyesMode })}>
              <SelectTrigger className="w-[140px] h-8 text-[10px]"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="singleWinner" className="text-[11px]">Un solo ganador</SelectItem>
                <SelectItem value="allVsAll" className="text-[11px]">Todos vs Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-[9px] text-muted-foreground">La variante por par de jugadores se puede ajustar en el Dashboard de Apuestas.</p>
          
          {/* Segments configuration */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium">Segmentos incluidos</Label>
              <div className="flex gap-1 text-[9px] text-muted-foreground pr-1">
                <span className="w-14 text-center">Front</span>
                <span className="w-2"></span>
                <span className="w-14 text-center">Back</span>
              </div>
            </div>
            <div className="space-y-1">
              {SEGMENT_KEYS.map(segKey => {
                const segConfig = getSegmentConfig(segKey);
                const segInfo = SEGMENT_LABELS[segKey];
                
                return (
                  <div key={segKey} className={cn("flex items-center gap-2 p-2 rounded-lg transition-colors", segConfig.enabled ? "bg-muted/50" : "bg-muted/20 opacity-60")}>
                    <Switch checked={segConfig.enabled} onCheckedChange={(v) => updateSegment(segKey, { enabled: v })} className="scale-75" />
                    <span className="text-xs flex-1">{segInfo.emoji} {segInfo.name}</span>
                    {segConfig.enabled && (
                      <div className="flex items-center gap-1">
                        <Input type="number" value={segConfig.frontValue} onChange={(e) => updateSegment(segKey, { frontValue: Number(e.target.value) || 0 })} className="h-6 w-14 text-[10px] text-center" />
                        <span className="text-[9px] text-muted-foreground">/</span>
                        <Input type="number" value={segConfig.backValue} onChange={(e) => updateSegment(segKey, { backValue: Number(e.target.value) || 0 })} className="h-6 w-14 text-[10px] text-center" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CollapsibleSubSection>
      
      {/* Bilateral overrides */}
      {rivals.length > 0 && (
        <CollapsibleSubSection label="Personalizar por rival" summary={`${rivals.length} rivales`}>
          <p className="text-[10px] text-muted-foreground">
            La configuración de segmentos por par se ajusta en la pantalla de Resultados,
            en el detalle bilateral de cada par. Si dos jugadores tienen preferencias distintas,
            ahí se resuelve qué segmentos juegan.
          </p>
        </CollapsibleSubSection>
      )}
      
      <p className="text-[9px] text-muted-foreground">
        Rayas = Skins ganados + Unidades (+) + Oyes (el más cercano gana a todos) + Medal por segmento
      </p>
    </div>
  );
};
