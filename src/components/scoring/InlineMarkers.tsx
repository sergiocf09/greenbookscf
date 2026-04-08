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
  XCircle,
  MapPin,
  Square,
  Star,
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
  emoji: string;
  points?: number;
}

const PinkiesHeelIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon iconNode={highHeel} {...props} />
);

const MorelianaIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 18 Q12 10 20 18" />
    <circle cx="17" cy="7" r="2.5" fill="currentColor" />
    <path d="M14 12 L16 8.5" />
    <polyline points="14.5,8 16,8.5 15.5,10" />
  </svg>
);

// Manual unit markers (shown on strokes row) - LARGER SIZE
export const manualUnitMarkers: MarkerConfig[] = [
  { key: 'sandyPar', icon: Flag, label: 'Sandy Par', description: 'Par desde bunker', type: 'unidad', emoji: '⛳', points: 1 },
  { key: 'holeOut', icon: Target, label: 'Hole Out', description: 'Embocada desde fuera', type: 'unidad', emoji: '🎯', points: 1 },
  { key: 'aquaPar', icon: Waves, label: 'Aqua Par', description: 'Par después de agua', type: 'unidad', emoji: '💧', points: 1 },
  { key: 'unidadGenerica', icon: Star, label: 'Unidad', description: 'Unidad genérica', type: 'unidad', emoji: '⭐' },
];

// Manual stain markers (shown on putts row) - Pinkies y Paloma updated labels - LARGER SIZE
// Removed cuatriput from manual markers - now auto-detected based on putts >= 4
export const manualStainMarkers: MarkerConfig[] = [
  { key: 'par3GirMas3', icon: CircleDot, label: 'Par 3 GIR>3', description: 'Par 3 sin GIR en 3+', type: 'mancha', emoji: '🔴' },
  { key: 'trampa', icon: Hourglass, label: 'Trampa', description: 'Bunker a bunker', type: 'mancha', emoji: '⏳' },
  { key: 'ladies', icon: PinkiesHeelIcon, label: 'Pinkies', description: 'Tiro de damas', type: 'mancha', emoji: '👠' },
  { key: 'retruje', icon: Repeat, label: 'Retruje', description: 'Golpe para atrás', type: 'mancha', emoji: '🔄' },
  { key: 'dobleAgua', icon: Droplets, label: 'Doble Agua', description: '2+ veces en agua', type: 'mancha', emoji: '💦' },
  { key: 'swingBlanco', icon: Bird, label: 'Paloma', description: 'Swing en blanco', type: 'mancha', emoji: '🕊️' },
  { key: 'dobleOB', icon: XCircle, label: 'Doble OB', description: '2+ veces fuera de límites', type: 'mancha', emoji: '🚫' },
  { key: 'moreliana', icon: MorelianaIcon, label: 'Moreliana', description: 'Se salió del green poteando', type: 'mancha', emoji: '🎭' },
  { key: 'manchaGenerica', icon: Square, label: 'Mancha', description: 'Mancha genérica', type: 'mancha', emoji: '⬛' },
];

// Export marker labels for external use (short versions)
export const markerLabels: Record<string, string> = {
  sandyPar: 'Sandy',
  holeOut: 'HoleOut',
  aquaPar: 'Aqua',
  par3GirMas3: 'GIR>3',
  trampa: 'Trampa',
  ladies: 'Pinkies',
  retruje: 'Retruje',
  dobleAgua: '2xAgua',
  swingBlanco: 'Paloma',
  dobleOB: 'Doble OB',
  moreliana: 'Moreliana',
  manchaGenerica: 'Mancha',
  unidadGenerica: 'Unidad',
};

// Counter marker component for numeric markers (manchaGenerica, unidadGenerica)
const CounterMarker: React.FC<{
  value: number;
  onChange: (newValue: number) => void;
  icon: React.ElementType;
  label: string;
  type: 'unidad' | 'mancha';
  compact?: boolean;
}> = ({ value, onChange, icon: IconComp, label, type, compact = true }) => {
  const isUnidad = type === 'unidad';
  const isActive = value > 0;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onChange(Math.max(0, value - 1))}
              disabled={value === 0}
              className={cn(
                'rounded-full transition-all duration-150 p-1',
                'text-xs font-bold leading-none',
                value === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110 active:scale-95',
                isUnidad ? 'text-primary' : 'text-destructive'
              )}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => onChange(value + 1)}
              className={cn(
                'rounded-full transition-all duration-150 relative',
                compact ? 'p-2' : 'p-2.5',
                isActive
                  ? isUnidad
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/40 shadow-sm'
                    : 'bg-destructive text-destructive-foreground ring-2 ring-destructive/40 shadow-sm'
                  : isUnidad
                    ? 'bg-primary/5 text-primary/60 ring-1 ring-primary/10 hover:bg-primary/10 hover:text-primary'
                    : 'bg-destructive/5 text-destructive/60 ring-1 ring-destructive/10 hover:bg-destructive/10 hover:text-destructive',
                'hover:scale-110 active:scale-95'
              )}
            >
              <IconComp className="h-4 w-4" />
              {isActive && (
                <span className={cn(
                  'absolute -top-1 -right-1 rounded-full text-[9px] font-bold leading-none px-1 min-w-[14px] text-center',
                  isUnidad ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground'
                )}>
                  {value}
                </span>
              )}
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs font-medium">{label}</p>
          {value > 0 && <p className="text-xs text-muted-foreground">{value} registrada{value > 1 ? 's' : ''}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

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
        // Numeric counter markers
        if (marker.key === 'manchaGenerica' || marker.key === 'unidadGenerica') {
          const numericValue = (state[marker.key] as number) ?? 0;
          return (
            <CounterMarker
              key={marker.key}
              value={numericValue}
              onChange={(newValue) => onChange({ ...state, [marker.key]: newValue })}
              icon={marker.icon}
              label={marker.label}
              type={marker.type}
              compact={compact}
            />
          );
        }

        const IconEl = marker.icon;
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
                  <IconEl className={cn(compact ? 'h-5 w-5' : 'h-6 w-6')} />
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
