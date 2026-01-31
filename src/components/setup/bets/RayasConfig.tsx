import React, { useMemo } from 'react';
import { BetConfig, Player, RayasSegmentConfig, RayasBilateralOverride, RayasSkinVariant } from '@/types/golf';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface RayasConfigProps {
  config: BetConfig;
  players: Player[];
  basePlayerId?: string; // Logged-in player
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
  
  const rayas = config.rayas ?? { enabled: false, frontValue: 25, backValue: 50, medalTotalValue: 25, skinVariant: 'acumulados' };
  
  // Get default segment config
  const getSegmentConfig = (segmentKey: string): RayasSegmentConfig => {
    const seg = rayas.segments?.[segmentKey as keyof typeof rayas.segments];
    return seg ?? { enabled: true, frontValue: rayas.frontValue, backValue: rayas.backValue };
  };
  
  // Update a specific segment
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
  
  // Get bilateral overrides for logged-in player
  const getBilateralOverrides = (): RayasBilateralOverride[] => {
    if (!basePlayerId) return [];
    return rayas.bilateralOverrides?.[basePlayerId] ?? [];
  };
  
  // Update bilateral override for a specific rival
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
  
  // Get rival override
  const getRivalOverride = (rivalId: string): RayasBilateralOverride | undefined => {
    return getBilateralOverrides().find(o => o.rivalId === rivalId);
  };
  
  // Rivals for bilateral config (all players except logged-in)
  const rivals = useMemo(() => {
    if (!basePlayerId) return [];
    return players.filter(p => p.id !== basePlayerId && p.profileId !== basePlayerId);
  }, [players, basePlayerId]);

  return (
    <div className="space-y-4">
      {/* Global values */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Front 9 (default)</Label>
          <Input
            type="number"
            value={rayas.frontValue}
            onChange={(e) => onUpdateRayas({ frontValue: Number(e.target.value) || 0 })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Back 9 (default)</Label>
          <Input
            type="number"
            value={rayas.backValue}
            onChange={(e) => onUpdateRayas({ backValue: Number(e.target.value) || 0 })}
            className="h-8 text-sm"
          />
        </div>
      </div>
      
      <div>
        <Label className="text-[10px] text-muted-foreground">Medal Total (raya extra)</Label>
        <Input
          type="number"
          value={rayas.medalTotalValue}
          onChange={(e) => onUpdateRayas({ medalTotalValue: Number(e.target.value) || 0 })}
          className="h-8 text-sm w-1/2"
        />
      </div>
      
      {/* Skin variant */}
      <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <Label className="text-xs text-muted-foreground">Variante Skins</Label>
        <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUpdateRayas({ skinVariant: 'acumulados' as RayasSkinVariant });
            }}
            className={cn(
              "px-2 py-1 text-[10px] rounded transition-colors",
              (rayas.skinVariant ?? 'acumulados') === 'acumulados' 
                ? "bg-golf-gold text-golf-dark font-medium" 
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            Acum
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUpdateRayas({ skinVariant: 'sinAcumulacion' as RayasSkinVariant });
            }}
            className={cn(
              "px-2 py-1 text-[10px] rounded transition-colors",
              (rayas.skinVariant ?? 'acumulados') === 'sinAcumulacion' 
                ? "bg-primary text-primary-foreground font-medium" 
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            Sin Acum
          </button>
        </div>
      </div>
      
      {/* Segments configuration */}
      <div className="border-t pt-3">
        <Label className="text-xs font-medium mb-2 block">Segmentos incluidos</Label>
        <div className="space-y-2">
          {SEGMENT_KEYS.map(segKey => {
            const segConfig = getSegmentConfig(segKey);
            const segInfo = SEGMENT_LABELS[segKey];
            
            return (
              <div 
                key={segKey}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg transition-colors",
                  segConfig.enabled ? "bg-muted/50" : "bg-muted/20 opacity-60"
                )}
              >
                <Switch
                  checked={segConfig.enabled}
                  onCheckedChange={(v) => updateSegment(segKey, { enabled: v })}
                  className="scale-75"
                />
                <span className="text-xs flex-1">{segInfo.emoji} {segInfo.name}</span>
                
                {segConfig.enabled && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={segConfig.frontValue}
                      onChange={(e) => updateSegment(segKey, { frontValue: Number(e.target.value) || 0 })}
                      className="h-6 w-14 text-[10px] text-center"
                      title="Front 9"
                    />
                    <span className="text-[9px] text-muted-foreground">/</span>
                    <Input
                      type="number"
                      value={segConfig.backValue}
                      onChange={(e) => updateSegment(segKey, { backValue: Number(e.target.value) || 0 })}
                      className="h-6 w-14 text-[10px] text-center"
                      title="Back 9"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[9px] text-muted-foreground mt-1">
          Valores: Front / Back por raya
        </p>
      </div>
      
      {/* Bilateral overrides */}
      {rivals.length > 0 && (
        <Collapsible open={expandedBilateral} onOpenChange={setExpandedBilateral}>
          <CollapsibleTrigger className="flex items-center justify-between w-full border-t pt-3">
            <Label className="text-xs font-medium cursor-pointer">Personalizar por rival</Label>
            {expandedBilateral ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </CollapsibleTrigger>
          
          <CollapsibleContent className="space-y-2 mt-2">
            <p className="text-[9px] text-muted-foreground mb-2">
              Puedes desactivar Rayas o ajustar segmentos con rivales específicos.
            </p>
            
            {rivals.map(rival => {
              const override = getRivalOverride(rival.id);
              const isCustomized = override !== undefined;
              const isEnabled = override?.enabled ?? true;
              
              return (
                <div 
                  key={rival.id}
                  className={cn(
                    "p-2 rounded-lg transition-colors border",
                    isCustomized ? "border-primary/30 bg-primary/5" : "border-transparent bg-muted/30"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                        style={{ backgroundColor: rival.color }}
                      >
                        {rival.initials}
                      </div>
                      <span className="text-xs font-medium">{rival.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground">
                        {isEnabled ? 'Activo' : 'Desactivado'}
                      </span>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(v) => updateBilateralOverride(rival.id, { enabled: v })}
                        className="scale-75"
                      />
                    </div>
                  </div>
                  
                  {isEnabled && isCustomized && (
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      {SEGMENT_KEYS.map(segKey => {
                        const segOverride = override?.segments?.[segKey as keyof typeof override.segments];
                        const globalSeg = getSegmentConfig(segKey);
                        const isSegEnabled = segOverride?.enabled ?? globalSeg.enabled;
                        
                        return (
                          <button
                            key={segKey}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const currentSegments = override?.segments ?? {};
                              updateBilateralOverride(rival.id, {
                                segments: {
                                  ...currentSegments,
                                  [segKey]: { 
                                    ...currentSegments[segKey as keyof typeof currentSegments],
                                    enabled: !isSegEnabled 
                                  },
                                },
                              });
                            }}
                            className={cn(
                              "px-1 py-1 text-[9px] rounded transition-colors",
                              isSegEnabled
                                ? "bg-golf-gold text-golf-dark font-medium"
                                : "bg-muted text-muted-foreground line-through"
                            )}
                          >
                            {SEGMENT_LABELS[segKey].emoji}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  
                  {!isCustomized && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updateBilateralOverride(rival.id, { enabled: true });
                      }}
                      className="text-[9px] text-primary hover:underline"
                    >
                      + Personalizar
                    </button>
                  )}
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}
      
      <p className="text-[9px] text-muted-foreground">
        Rayas = Skins ganados + Unidades (+) + Oyes (el más cercano gana a todos) + Medal por segmento
      </p>
    </div>
  );
};
