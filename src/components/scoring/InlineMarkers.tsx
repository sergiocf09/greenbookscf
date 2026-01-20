import React from 'react';
import { 
  Flag,
  Waves,
  Target,
  Skull,
  Bird,
  Repeat,
  AlertTriangle,
  Droplets,
  XCircle,
  CircleDot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MarkerState } from '@/types/golf';

interface MarkerConfig {
  key: keyof MarkerState;
  icon: React.ElementType;
  label: string;
  description: string;
  type: 'unidad' | 'mancha';
  points?: number;
}

// Manual unit markers (shown on strokes row)
export const manualUnitMarkers: MarkerConfig[] = [
  { key: 'sandyPar', icon: Flag, label: 'Sandy Par', description: 'Par desde bunker', type: 'unidad', points: 1 },
  { key: 'aquaPar', icon: Waves, label: 'Aqua Par', description: 'Par después de agua', type: 'unidad', points: 1 },
  { key: 'holeOut', icon: Target, label: 'Hole Out', description: 'Embocada desde fuera', type: 'unidad', points: 1 },
];

// Manual stain markers (shown on putts row)
export const manualStainMarkers: MarkerConfig[] = [
  { key: 'pinkie', icon: Skull, label: 'Pinkie', description: 'Bola en agua tee shot', type: 'mancha' },
  { key: 'paloma', icon: Bird, label: 'Paloma', description: 'OB desde tee', type: 'mancha' },
  { key: 'retruje', icon: Repeat, label: 'Retruje', description: 'Golpe repetido', type: 'mancha' },
  { key: 'trampa', icon: AlertTriangle, label: 'Trampa', description: 'Bunker a bunker', type: 'mancha' },
  { key: 'dobleAgua', icon: Droplets, label: 'Doble Agua', description: '2+ veces en agua', type: 'mancha' },
  { key: 'dobleOB', icon: XCircle, label: 'Doble OB', description: '2+ veces OB', type: 'mancha' },
  { key: 'par3GirMas3', icon: CircleDot, label: 'Par 3 GIR>3', description: 'Par 3 sin GIR en 3+', type: 'mancha' },
];

interface InlineMarkersProps {
  state: MarkerState;
  onChange: (newState: MarkerState) => void;
  markers: MarkerConfig[];
  compact?: boolean;
}

export const InlineMarkers: React.FC<InlineMarkersProps> = ({
  state,
  onChange,
  markers,
  compact = true,
}) => {
  const toggleMarker = (key: keyof MarkerState) => {
    onChange({ ...state, [key]: !state[key] });
  };

  return (
    <div className="flex items-center gap-0.5">
      {markers.map(marker => {
        const Icon = marker.icon;
        const isActive = state[marker.key];
        const isUnidad = marker.type === 'unidad';

        return (
          <TooltipProvider key={marker.key} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => toggleMarker(marker.key)}
                  className={cn(
                    'rounded-full p-1 transition-all duration-150',
                    'hover:scale-105 active:scale-95',
                    isActive
                      ? isUnidad
                        ? 'bg-golf-gold/90 text-golf-dark'
                        : 'bg-destructive/90 text-destructive-foreground'
                      : 'bg-transparent text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30'
                  )}
                >
                  <Icon className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
                </button>
              </TooltipTrigger>
              <TooltipContent 
                side="top" 
                className={cn(
                  'text-xs',
                  isUnidad ? 'bg-golf-gold text-golf-dark' : 'bg-destructive text-destructive-foreground'
                )}
              >
                <p className="font-semibold">{marker.label}</p>
                <p className="text-[10px] opacity-90">{marker.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
};

// Auto-detected badge component
interface AutoDetectedBadgeProps {
  type: 'birdie' | 'eagle' | 'albatross' | 'culebra' | 'dobleDigito';
  show: boolean;
}

export const AutoDetectedBadge: React.FC<AutoDetectedBadgeProps> = ({ type, show }) => {
  if (!show) return null;

  const configs: Record<string, { label: string; color: string }> = {
    birdie: { label: 'Birdie', color: 'bg-green-500 text-white' },
    eagle: { label: 'Águila', color: 'bg-golf-gold text-golf-dark' },
    albatross: { label: 'Albatros', color: 'bg-gradient-to-r from-golf-gold to-yellow-300 text-golf-dark' },
    culebra: { label: '🐍', color: 'bg-destructive/80 text-destructive-foreground' },
    dobleDigito: { label: '10+', color: 'bg-destructive text-destructive-foreground' },
  };

  const config = configs[type];

  return (
    <span className={cn(
      'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
      config.color
    )}>
      {config.label}
    </span>
  );
};
