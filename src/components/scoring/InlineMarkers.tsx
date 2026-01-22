import React from 'react';
import { 
  Icon,
  Flag,
  Waves,
  Target,
  Bird,
  Repeat,
  Droplets,
  CircleDot,
  Hourglass,
} from 'lucide-react';
import { highHeel } from '@lucide/lab';
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

const PinkiesHeelIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon iconNode={highHeel} {...props} />
);

// Manual unit markers (shown on strokes row) - LARGER SIZE
export const manualUnitMarkers: MarkerConfig[] = [
  { key: 'sandyPar', icon: Flag, label: 'Sandy Par', description: 'Par desde bunker', type: 'unidad', points: 1 },
  { key: 'holeOut', icon: Target, label: 'Hole Out', description: 'Embocada desde fuera', type: 'unidad', points: 1 },
  { key: 'aquaPar', icon: Waves, label: 'Aqua Par', description: 'Par después de agua', type: 'unidad', points: 1 },
];

// Manual stain markers (shown on putts row) - Pinkies y Paloma updated labels - LARGER SIZE
// Removed cuatriput from manual markers - now auto-detected based on putts >= 4
export const manualStainMarkers: MarkerConfig[] = [
  { key: 'par3GirMas3', icon: CircleDot, label: 'Par 3 GIR>3', description: 'Par 3 sin GIR en 3+', type: 'mancha' },
  { key: 'trampa', icon: Hourglass, label: 'Trampa', description: 'Bunker a bunker', type: 'mancha' },
  { key: 'ladies', icon: PinkiesHeelIcon, label: 'Pinkies', description: 'Tiro de damas', type: 'mancha' },
  { key: 'retruje', icon: Repeat, label: 'Retruje', description: 'Golpe para atrás', type: 'mancha' },
  { key: 'dobleAgua', icon: Droplets, label: 'Doble Agua', description: '2+ veces en agua', type: 'mancha' },
  { key: 'swingBlanco', icon: Bird, label: 'Paloma', description: 'Swing en blanco', type: 'mancha' },
];

interface InlineMarkersProps {
  state: MarkerState;
  onChange: (newState: MarkerState) => void;
  markers: MarkerConfig[];
  compact?: boolean;
  wrap?: boolean;
}

export const InlineMarkers: React.FC<InlineMarkersProps> = ({
  state,
  onChange,
  markers,
  compact = true,
  wrap = true,
}) => {
  const toggleMarker = (key: keyof MarkerState) => {
    onChange({ ...state, [key]: !state[key] });
  };

  return (
    <div className={cn('flex items-center gap-1', wrap ? 'flex-wrap' : 'flex-nowrap')}>
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
                    'rounded-full transition-all duration-150',
                    'hover:scale-110 active:scale-95',
                    // LARGER SIZE for mobile - p-2 instead of p-1
                    compact ? 'p-2' : 'p-2.5',
                    isActive
                      ? isUnidad
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary/40 shadow-sm'
                        : 'bg-destructive text-destructive-foreground ring-2 ring-destructive/40 shadow-sm'
                      : isUnidad
                        ? 'bg-primary/5 text-primary/60 ring-1 ring-primary/10 hover:bg-primary/10 hover:text-primary'
                        : 'bg-destructive/5 text-destructive/60 ring-1 ring-destructive/10 hover:bg-destructive/10 hover:text-destructive'
                  )}
                >
                  {/* LARGER ICONS - h-5 w-5 instead of h-3 w-3 */}
                  <Icon className={cn(compact ? 'h-5 w-5' : 'h-6 w-6')} />
                </button>
              </TooltipTrigger>
              <TooltipContent 
                side="top" 
                className={cn(
                  'text-xs',
                  isUnidad ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground'
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
  type: 'birdie' | 'eagle' | 'albatross' | 'culebra' | 'dobleDigito' | 'cuatriput';
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
    cuatriput: { label: '4+🕳️', color: 'bg-destructive text-destructive-foreground' },
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