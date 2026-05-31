import React from 'react';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, X } from 'lucide-react';
import { 
  AutoDetectedBadge,
  manualUnitMarkers,
  manualStainMarkers,
  markerLabels,
} from './InlineMarkers';
import { MarkerState, defaultMarkerState, ZooAnimalType, ZOO_ANIMALS } from '@/types/golf';
import { detectScoreBasedMarkers, mergeMarkers } from '@/lib/scoreDetection';
import { ScoreStepper } from './ScoreStepper';
import { formatPlayerName } from '@/lib/playerInput';

interface PlayerScoreInputProps {
  playerName: string;
  playerInitials?: string;
  avatarColor?: string;
  holeNumber: number;
  par: number;
  strokes: number;
  putts: number;
  markers: MarkerState;
  onStrokesChange: (strokes: number) => void;
  onPuttsChange: (putts: number) => void;
  onMarkersChange: (markers: MarkerState) => void;
  handicapStrokes?: number;
  isBasePlayer?: boolean;
  playerId?: string;
  basePlayerId?: string;
  zooEnabledAnimals?: ZooAnimalType[];
  zooCounts?: Partial<Record<ZooAnimalType, number>>;
  onZooCountChange?: (animal: ZooAnimalType, newCount: number) => void;
}

export const PlayerScoreInput: React.FC<PlayerScoreInputProps> = ({
  playerName,
  playerInitials,
  avatarColor = 'bg-golf-green',
  holeNumber,
  par,
  strokes,
  putts,
  markers,
  onStrokesChange,
  onPuttsChange,
  onMarkersChange,
  handicapStrokes = 0,
  isBasePlayer = false,
  playerId,
  basePlayerId,
}) => {
  const initials = playerInitials || playerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const isLoggedInUser = playerId && basePlayerId ? playerId === basePlayerId : false;
  const latestMarkersRef = React.useRef(markers);

  React.useEffect(() => {
    latestMarkersRef.current = markers;
  }, [markers]);
  
  // Auto-detect score-based markers
  const autoDetected = strokes > 0 ? detectScoreBasedMarkers(strokes, putts, par) : {};
  const mergedMarkers = mergeMarkers(autoDetected, markers);
  
  const scoreToPar = strokes - par;
  const netScore = strokes - handicapStrokes;
  const netToPar = netScore - par;

  const getScoreColor = (toPar: number) => {
    if (strokes === 0) return 'text-muted-foreground';
    if (toPar <= -2) return 'text-golf-gold';
    if (toPar === -1) return 'text-green-500';
    if (toPar === 0) return 'text-foreground';
    if (toPar === 1) return 'text-orange-500';
    return 'text-destructive';
  };

  const handleMarkersChange = (nextMarkers: MarkerState | ((current: MarkerState) => MarkerState)) => {
    const resolvedMarkers = typeof nextMarkers === 'function'
      ? nextMarkers(latestMarkersRef.current)
      : nextMarkers;

    latestMarkersRef.current = resolvedMarkers;
    onMarkersChange(resolvedMarkers);
  };

  const toggleMarker = (key: keyof MarkerState) => {
    handleMarkersChange((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const incrementMarker = (key: 'manchaGenerica' | 'unidadGenerica', delta: number) => {
    handleMarkersChange((current) => ({
      ...current,
      [key]: Math.max(0, ((current[key] as number) ?? 0) + delta),
    }));
  };

  // Get active manual markers for display
  const activeUnits = manualUnitMarkers.filter(m => {
    const val = markers[m.key as keyof MarkerState];
    return typeof val === 'number' ? val > 0 : !!val;
  });
  const activeStains = manualStainMarkers.filter(m => {
    const val = markers[m.key as keyof MarkerState];
    return typeof val === 'number' ? val > 0 : !!val;
  });

  return (
    <div className={cn(
      "bg-card border rounded-xl p-3 space-y-2",
      isBasePlayer ? "border-primary border-2" : "border-border"
    )}>
      {/* Player Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PlayerAvatar initials={initials} background={avatarColor} size="md" className="shadow-sm" isLoggedInUser={isLoggedInUser} />
          <div>
            <p className="font-semibold text-sm text-foreground">{formatPlayerName(playerName)}</p>
            {handicapStrokes > 0 && (
              <p className="text-[10px] text-muted-foreground">
                +{handicapStrokes} golpe{handicapStrokes > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {strokes > 0 && (
            <>
              <div className="flex gap-1">
                <AutoDetectedBadge type="albatross" show={mergedMarkers.albatross} />
                <AutoDetectedBadge type="eagle" show={mergedMarkers.eagle && !mergedMarkers.albatross} />
                <AutoDetectedBadge type="birdie" show={mergedMarkers.birdie && !mergedMarkers.eagle} />
                <AutoDetectedBadge type="dobleDigito" show={mergedMarkers.dobleDigito} />
              </div>
              <p className={cn('text-2xl font-bold', getScoreColor(scoreToPar))}>
                {strokes}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Inputs (Golpes + Putts) with marker icons */}
      <div className="bg-muted/30 rounded-lg p-2 space-y-2">
        {/* Golpes Row */}
        <div className="flex items-center gap-2">
          <ScoreStepper
            label="Golpes"
            value={strokes}
            min={1}
            onChange={onStrokesChange}
            className="shrink-0"
          />
          
          {/* Active Units Labels */}
          {activeUnits.length > 0 && (
            <div className="flex flex-wrap gap-1.5 flex-1">
              {activeUnits.map(m => {
                const isGeneric = m.key === 'unidadGenerica';
                const genVal = isGeneric ? ((markers.unidadGenerica as number) ?? 0) : 0;
                return (
                  <div key={m.key} className="relative inline-flex items-center">
                    {isGeneric && genVal > 1 && (
                      <span className="absolute -top-2 -left-1.5 min-w-[14px] h-[14px] rounded-full bg-green-600 text-white text-[9px] font-bold flex items-center justify-center px-0.5 z-10">
                        {genVal}
                      </span>
                    )}
                    <button
                      onClick={() => isGeneric ? incrementMarker('unidadGenerica', -1) : toggleMarker(m.key)}
                      className="absolute -top-1.5 -right-1 w-3 h-3 rounded-full bg-muted-foreground/60 hover:bg-destructive text-white flex items-center justify-center"
                    >
                      <X className="h-2 w-2" strokeWidth={3} />
                    </button>
                    <span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">
                      {markerLabels[m.key]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {activeUnits.length === 0 && <div className="flex-1" />}

          {/* Green Units Popover - right side */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0",
                activeUnits.length > 0 
                  ? "bg-green-500 text-white" 
                  : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
              )}>
                <Check className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="end">
              <div className="flex flex-col gap-1">
                {manualUnitMarkers.map(marker => {
                  if (marker.key === 'unidadGenerica') {
                    const val = (markers.unidadGenerica as number) ?? 0;
                    return (
                      <div key={marker.key} className="flex items-center gap-2 px-3 py-1.5">
                        <span>{marker.emoji}</span>
                        <span className="text-sm flex-1">{marker.label}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => incrementMarker('unidadGenerica', -1)} disabled={val === 0} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-sm font-bold disabled:opacity-30">−</button>
                          <span className={cn("w-5 text-center text-sm font-semibold", val > 0 ? "text-green-700 dark:text-green-300" : "text-muted-foreground")}>{val}</span>
                          <button onClick={() => incrementMarker('unidadGenerica', 1)} className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 flex items-center justify-center text-sm font-bold">+</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={marker.key}
                      onClick={() => toggleMarker(marker.key)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors text-left",
                        markers[marker.key as keyof MarkerState]
                          ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                          : "hover:bg-muted"
                      )}
                    >
                      <span>{marker.emoji}</span>
                      <span>{marker.label}</span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        {/* Putts Row */}
        <div className="flex items-center gap-2">
          <ScoreStepper
            label="Putts"
            value={putts}
            min={0}
            onChange={onPuttsChange}
            className="shrink-0"
          />
          
          {/* Active Stains Labels + Auto-detected badges */}
          <div className="flex flex-wrap gap-1.5 flex-1 items-center">
            {mergedMarkers.culebra && !mergedMarkers.cuatriput && (
              <AutoDetectedBadge type="culebra" show={true} />
            )}
            {mergedMarkers.cuatriput && (
              <AutoDetectedBadge type="cuatriput" show={true} />
            )}
            {activeStains.map(m => {
              const isGeneric = m.key === 'manchaGenerica';
              const genVal = isGeneric ? ((markers.manchaGenerica as number) ?? 0) : 0;
              return (
                <div key={m.key} className="relative inline-flex items-center">
                  {isGeneric && genVal > 1 && (
                    <span className="absolute -top-2 -left-1.5 min-w-[14px] h-[14px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5 z-10">
                      {genVal}
                    </span>
                  )}
                  <button
                    onClick={() => isGeneric ? incrementMarker('manchaGenerica', -1) : toggleMarker(m.key)}
                    className="absolute -top-1.5 -right-1 w-3 h-3 rounded-full bg-muted-foreground/60 hover:bg-destructive text-white flex items-center justify-center"
                  >
                    <X className="h-2 w-2" strokeWidth={3} />
                  </button>
                  <span className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                    {markerLabels[m.key]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Red Stains Popover - right side */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0",
                activeStains.length > 0 
                  ? "bg-destructive text-destructive-foreground" 
                  : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
              )}>
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="end">
              <div className="flex flex-col gap-1">
                {manualStainMarkers.map(marker => {
                  if (marker.key === 'manchaGenerica') {
                    const val = (markers.manchaGenerica as number) ?? 0;
                    return (
                      <div key={marker.key} className="flex items-center gap-2 px-3 py-1.5">
                        <span>{marker.emoji}</span>
                        <span className="text-sm flex-1">{marker.label}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => incrementMarker('manchaGenerica', -1)} disabled={val === 0} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-sm font-bold disabled:opacity-30">−</button>
                          <span className={cn("w-5 text-center text-sm font-semibold", val > 0 ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>{val}</span>
                          <button onClick={() => incrementMarker('manchaGenerica', 1)} className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 flex items-center justify-center text-sm font-bold">+</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={marker.key}
                      onClick={() => toggleMarker(marker.key)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors text-left",
                        markers[marker.key as keyof MarkerState]
                          ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
                          : "hover:bg-muted"
                      )}
                    >
                      <span>{marker.emoji}</span>
                      <span>{marker.label}</span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
};

export { defaultMarkerState };
export type { MarkerState };
