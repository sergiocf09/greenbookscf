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
import { MarkerState, defaultMarkerState } from '@/types/golf';
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

  const handleMarkersChange = (newMarkers: MarkerState) => {
    // Only update manual markers, auto-detected ones are computed
    onMarkersChange(newMarkers);
  };

  const toggleMarker = (key: keyof MarkerState) => {
    handleMarkersChange({ ...markers, [key]: !markers[key] });
  };

  // Get active manual markers for display
  const activeUnits = manualUnitMarkers.filter(m => markers[m.key]);
  const activeStains = manualStainMarkers.filter(m => markers[m.key]);

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

      {/* Inputs (Golpes + Putts) */}
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
          
          {/* Green Units Popover */}
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
                {manualUnitMarkers.map(marker => (
                  <button
                    key={marker.key}
                    onClick={() => toggleMarker(marker.key)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors text-left",
                      markers[marker.key]
                        ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                        : "hover:bg-muted"
                    )}
                  >
                    <span>{marker.emoji}</span>
                    <span>{marker.label}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          
          {/* Active Units Labels */}
          {activeUnits.length > 0 && (
            <div className="flex flex-wrap gap-1.5 flex-1">
              {activeUnits.map(m => (
                <div key={m.key} className="relative inline-flex items-center">
                  <button
                    onClick={() => toggleMarker(m.key)}
                    className="absolute -top-1.5 -right-1 w-3 h-3 rounded-full bg-muted-foreground/60 hover:bg-destructive text-white flex items-center justify-center"
                  >
                    <X className="h-2 w-2" strokeWidth={3} />
                  </button>
                  <span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">
                    {markerLabels[m.key]}
                  </span>
                </div>
              ))}
            </div>
          )}
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
          
          {/* Red Stains Popover */}
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
                {manualStainMarkers.map(marker => (
                  <button
                    key={marker.key}
                    onClick={() => toggleMarker(marker.key)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors text-left",
                      markers[marker.key]
                        ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
                        : "hover:bg-muted"
                    )}
                  >
                    <span>{marker.emoji}</span>
                    <span>{marker.label}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          
          {/* Active Stains Labels + Auto-detected badges */}
          <div className="flex flex-wrap gap-1.5 flex-1 items-center">
            {/* Auto-detected putt badges */}
            {mergedMarkers.culebra && !mergedMarkers.cuatriput && (
              <AutoDetectedBadge type="culebra" show={true} />
            )}
            {mergedMarkers.cuatriput && (
              <AutoDetectedBadge type="cuatriput" show={true} />
            )}
            
            {/* Manual stains */}
            {activeStains.length > 0 && (
              <>
              {activeStains.map(m => (
                <div key={m.key} className="relative inline-flex items-center">
                  <button
                    onClick={() => toggleMarker(m.key)}
                    className="absolute -top-1.5 -right-1 w-3 h-3 rounded-full bg-muted-foreground/60 hover:bg-destructive text-white flex items-center justify-center"
                  >
                    <X className="h-2 w-2" strokeWidth={3} />
                  </button>
                  <span className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                    {markerLabels[m.key]}
                  </span>
                </div>
              ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Net Score Display */}
      {handicapStrokes > 0 && strokes > 0 && (
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <span className="text-xs text-muted-foreground">Neto</span>
          <span className={cn('text-sm font-semibold', getScoreColor(netToPar))}>
            {netScore} ({netToPar >= 0 ? '+' : ''}{netToPar})
          </span>
        </div>
      )}
    </div>
  );
};

export { defaultMarkerState };
export type { MarkerState };
