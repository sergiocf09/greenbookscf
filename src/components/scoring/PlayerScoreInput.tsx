import React, { useState } from 'react';
import { Minus, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { 
  ScoreMarkers, 
  InlineScoreMarkers, 
  MarkerState, 
  defaultMarkerState 
} from './ScoreMarkers';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface PlayerScoreInputProps {
  playerName: string;
  playerInitials?: string;
  avatarColor?: string;
  holeNumber: number;
  par: number;
  strokes: number;
  putts?: number;
  markers: MarkerState;
  onStrokesChange: (strokes: number) => void;
  onPuttsChange?: (putts: number) => void;
  onMarkersChange: (markers: MarkerState) => void;
  handicapStrokes?: number;
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
}) => {
  const [showAllMarkers, setShowAllMarkers] = useState(false);

  const initials = playerInitials || playerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  
  const scoreToPar = strokes - par;
  const netScore = strokes - handicapStrokes;
  const netToPar = netScore - par;

  const getScoreColor = (toPar: number) => {
    if (toPar <= -2) return 'text-golf-gold'; // Eagle or better
    if (toPar === -1) return 'text-green-500'; // Birdie
    if (toPar === 0) return 'text-foreground'; // Par
    if (toPar === 1) return 'text-orange-500'; // Bogey
    return 'text-destructive'; // Double bogey or worse
  };

  const getScoreLabel = (toPar: number) => {
    if (toPar <= -3) return 'Albatros';
    if (toPar === -2) return 'Águila';
    if (toPar === -1) return 'Birdie';
    if (toPar === 0) return 'Par';
    if (toPar === 1) return 'Bogey';
    if (toPar === 2) return 'Doble';
    if (toPar === 3) return 'Triple';
    return `+${toPar}`;
  };

  const activeMarkersCount = Object.values(markers).filter(Boolean).length;

  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-3">
      {/* Player Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold',
            avatarColor,
            'text-white shadow-sm'
          )}>
            {initials}
          </div>
          <div>
            <p className="font-semibold text-foreground">{playerName}</p>
            {handicapStrokes > 0 && (
              <p className="text-xs text-muted-foreground">
                +{handicapStrokes} stroke{handicapStrokes > 1 ? 's' : ''} este hoyo
              </p>
            )}
          </div>
        </div>
        
        {/* Score Display */}
        {strokes > 0 && (
          <div className="text-right">
            <p className={cn('text-2xl font-bold', getScoreColor(scoreToPar))}>
              {strokes}
            </p>
            <p className={cn('text-xs font-medium', getScoreColor(scoreToPar))}>
              {getScoreLabel(scoreToPar)}
            </p>
          </div>
        )}
      </div>

      {/* Score Input */}
      <div className="flex items-center justify-between bg-muted/30 rounded-lg p-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground w-16">Golpes</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onStrokesChange(Math.max(1, strokes - 1))}
              disabled={strokes <= 1}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className="w-12 text-center">
              <span className="text-xl font-bold">{strokes || '-'}</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onStrokesChange(strokes + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Inline Quick Markers */}
        <InlineScoreMarkers state={markers} onChange={onMarkersChange} />
      </div>

      {/* Putts Input (optional) */}
      {onPuttsChange && (
        <div className="flex items-center justify-between bg-muted/30 rounded-lg p-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-16">Putts</span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => onPuttsChange(Math.max(0, (putts || 0) - 1))}
                disabled={(putts || 0) <= 0}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="w-12 text-center">
                <span className="text-xl font-bold">{putts ?? '-'}</span>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => onPuttsChange((putts || 0) + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Expandable All Markers */}
      <Collapsible open={showAllMarkers} onOpenChange={setShowAllMarkers}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-center gap-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {showAllMarkers ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Ocultar marcadores
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Todos los marcadores
                {activeMarkersCount > 0 && (
                  <span className="bg-golf-gold text-golf-dark text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {activeMarkersCount}
                  </span>
                )}
              </>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-golf-gold font-semibold mb-1.5">
                Unidades
              </p>
              <ScoreMarkers
                state={markers}
                onChange={onMarkersChange}
                showUnidades={true}
                showManchas={false}
              />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-1.5">
                Manchas
              </p>
              <ScoreMarkers
                state={markers}
                onChange={onMarkersChange}
                showUnidades={false}
                showManchas={true}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Net Score Display */}
      {handicapStrokes > 0 && strokes > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">Score Neto</span>
          <span className={cn('text-sm font-semibold', getScoreColor(netToPar))}>
            {netScore} ({netToPar >= 0 ? '+' : ''}{netToPar})
          </span>
        </div>
      )}
    </div>
  );
};
