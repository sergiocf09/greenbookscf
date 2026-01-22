import React from 'react';
import { cn } from '@/lib/utils';
import { 
  InlineMarkers, 
  AutoDetectedBadge,
  manualUnitMarkers,
  manualStainMarkers,
} from './InlineMarkers';
import { MarkerState, defaultMarkerState } from '@/types/golf';
import { detectScoreBasedMarkers, mergeMarkers } from '@/lib/scoreDetection';
import { ScoreStepper } from './ScoreStepper';

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
  // Oyeses props
  isPar3?: boolean;
  oyesEnabled?: boolean;
  oyesProximity?: number | null;
  onOyesProximityChange?: (proximity: number | null) => void;
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
  // Oyeses props
  isPar3 = false,
  oyesEnabled = false,
  oyesProximity,
  onOyesProximityChange,
}) => {
  const initials = playerInitials || playerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  
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

  return (
    <div className={cn(
      "bg-card border rounded-xl p-3 space-y-2",
      isBasePlayer ? "border-primary border-2" : "border-border"
    )}>
      {/* Player Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shadow-sm',
            avatarColor,
          )}>
            {initials}
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">{playerName}</p>
            {handicapStrokes > 0 && (
              <p className="text-[10px] text-muted-foreground">
                +{handicapStrokes} golpe{handicapStrokes > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        
        {/* Score Display with auto-detected badges */}
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

      {/* Inputs (Golpes + Putts + Proximidad Par 3) */}
      <div className="bg-muted/30 rounded-lg p-2">
        <div className="grid grid-cols-[auto_auto_minmax(96px,1fr)] items-center gap-2">
          <ScoreStepper
            label="Golpes"
            value={strokes}
            min={1}
            onChange={onStrokesChange}
            className="shrink-0"
          />

          <ScoreStepper
            label="Putts"
            value={putts}
            min={0}
            onChange={onPuttsChange}
            className="shrink-0"
            rightSlot={(
              <>
                {mergedMarkers.culebra && !mergedMarkers.cuatriput && (
                  <AutoDetectedBadge type="culebra" show={true} />
                )}
                {mergedMarkers.cuatriput && (
                  <AutoDetectedBadge type="cuatriput" show={true} />
                )}
              </>
            )}
          />

          {/* Proximidad Oyes (solo Par 3) */}
          {isPar3 && oyesEnabled && onOyesProximityChange ? (
            <div className="flex items-center gap-1 justify-end">
              <span className="text-[10px] text-muted-foreground">🎯</span>
              <select
                value={oyesProximity ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onOyesProximityChange(val === '' ? null : parseInt(val));
                }}
                className={cn(
                  'h-7 w-12 text-xs text-center rounded border bg-background',
                  oyesProximity
                    ? 'border-primary text-primary font-bold'
                    : 'border-muted-foreground/30 text-muted-foreground'
                )}
              >
                <option value="">-</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
                <option value="6">6</option>
              </select>
            </div>
          ) : (
            <div />
          )}
        </div>
      </div>

      {/* Markers (Unidades + Manchas) */}
      <div className="bg-muted/30 rounded-lg p-2">
        <div className="flex items-center gap-3 flex-nowrap overflow-x-auto">
          <InlineMarkers
            state={markers}
            onChange={handleMarkersChange}
            markers={manualUnitMarkers}
            wrap={false}
          />

          <span className="h-5 w-px bg-border/60" aria-hidden="true" />

          <InlineMarkers
            state={markers}
            onChange={handleMarkersChange}
            markers={manualStainMarkers}
            wrap={false}
          />
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
