import React from 'react';
import { 
  Bird, 
  Trophy, 
  Star,
  Waves,
  Flag,
  Target,
  Skull,
  Droplets,
  AlertTriangle,
  XCircle,
  CircleDot,
  Frown,
  Repeat,
  Gauge
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface MarkerState {
  // Unidades (positive)
  birdie: boolean;
  eagle: boolean;
  albatross: boolean;
  sandyPar: boolean;
  aquaPar: boolean;
  holeOut: boolean;
  // Manchas (negative)
  pinkie: boolean;
  paloma: boolean;
  retruje: boolean;
  trampa: boolean;
  dobleAgua: boolean;
  dobleOB: boolean;
  par3GirMas3: boolean;
  dobleDigito: boolean;
  moreliana: boolean;
  cuatriput: boolean;
}

export const defaultMarkerState: MarkerState = {
  birdie: false,
  eagle: false,
  albatross: false,
  sandyPar: false,
  aquaPar: false,
  holeOut: false,
  pinkie: false,
  paloma: false,
  retruje: false,
  trampa: false,
  dobleAgua: false,
  dobleOB: false,
  par3GirMas3: false,
  dobleDigito: false,
  moreliana: false,
  cuatriput: false,
};

interface MarkerConfig {
  key: keyof MarkerState;
  icon: React.ElementType;
  label: string;
  description: string;
  type: 'unidad' | 'mancha';
  points?: number;
}

const markers: MarkerConfig[] = [
  // Unidades
  { key: 'birdie', icon: Bird, label: 'Birdie', description: '1 bajo par', type: 'unidad', points: 1 },
  { key: 'eagle', icon: Trophy, label: 'Águila', description: '2 bajo par', type: 'unidad', points: 2 },
  { key: 'albatross', icon: Star, label: 'Albatros', description: '3 bajo par', type: 'unidad', points: 3 },
  { key: 'sandyPar', icon: Flag, label: 'Sandy Par', description: 'Par desde bunker', type: 'unidad', points: 1 },
  { key: 'aquaPar', icon: Waves, label: 'Aqua Par', description: 'Par después de agua', type: 'unidad', points: 1 },
  { key: 'holeOut', icon: Target, label: 'Hole Out', description: 'Embocada desde fuera', type: 'unidad', points: 1 },
  // Manchas
  { key: 'pinkie', icon: Skull, label: 'Pinkie', description: 'Bola en agua tee shot', type: 'mancha' },
  { key: 'paloma', icon: Bird, label: 'Paloma', description: 'OB desde tee', type: 'mancha' },
  { key: 'retruje', icon: Repeat, label: 'Retruje', description: 'Golpe repetido', type: 'mancha' },
  { key: 'trampa', icon: AlertTriangle, label: 'Trampa', description: 'Bunker a bunker', type: 'mancha' },
  { key: 'dobleAgua', icon: Droplets, label: 'Doble Agua', description: '2+ veces en agua', type: 'mancha' },
  { key: 'dobleOB', icon: XCircle, label: 'Doble OB', description: '2+ veces OB', type: 'mancha' },
  { key: 'par3GirMas3', icon: CircleDot, label: 'Par 3 GIR>3', description: 'Par 3 sin GIR en 3+', type: 'mancha' },
  { key: 'dobleDigito', icon: Gauge, label: 'Doble Dígito', description: '10+ golpes', type: 'mancha' },
  { key: 'moreliana', icon: Frown, label: 'Moreliana', description: '4 putts', type: 'mancha' },
  { key: 'cuatriput', icon: Frown, label: 'Cuatriput', description: '4+ putts', type: 'mancha' },
];

interface ScoreMarkersProps {
  state: MarkerState;
  onChange: (newState: MarkerState) => void;
  showUnidades?: boolean;
  showManchas?: boolean;
  compact?: boolean;
}

export const ScoreMarkers: React.FC<ScoreMarkersProps> = ({
  state,
  onChange,
  showUnidades = true,
  showManchas = true,
  compact = false,
}) => {
  const toggleMarker = (key: keyof MarkerState) => {
    onChange({ ...state, [key]: !state[key] });
  };

  const filteredMarkers = markers.filter(m => 
    (m.type === 'unidad' && showUnidades) || (m.type === 'mancha' && showManchas)
  );

  const unidades = filteredMarkers.filter(m => m.type === 'unidad');
  const manchas = filteredMarkers.filter(m => m.type === 'mancha');

  const renderMarker = (marker: MarkerConfig) => {
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
                'relative rounded-full p-1.5 transition-all duration-200',
                'hover:scale-110 active:scale-95',
                'focus:outline-none focus:ring-2 focus:ring-offset-1',
                compact ? 'p-1' : 'p-1.5',
                isActive
                  ? isUnidad
                    ? 'bg-golf-gold text-golf-dark shadow-md focus:ring-golf-gold'
                    : 'bg-destructive text-destructive-foreground shadow-md focus:ring-destructive'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted focus:ring-muted-foreground/50'
              )}
            >
              <Icon className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
              {isActive && marker.points && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-golf-dark text-[9px] font-bold text-golf-gold">
                  {marker.points}
                </span>
              )}
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
            {marker.points && (
              <p className="text-[10px] font-medium mt-0.5">+{marker.points} punto{marker.points > 1 ? 's' : ''}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className={cn('flex flex-wrap gap-1', compact ? 'gap-0.5' : 'gap-1')}>
      {showUnidades && unidades.length > 0 && (
        <div className="flex items-center gap-0.5">
          {unidades.map(renderMarker)}
        </div>
      )}
      {showUnidades && showManchas && unidades.length > 0 && manchas.length > 0 && (
        <div className="w-px h-4 bg-border mx-1 self-center" />
      )}
      {showManchas && manchas.length > 0 && (
        <div className="flex items-center gap-0.5">
          {manchas.map(renderMarker)}
        </div>
      )}
    </div>
  );
};

// Compact inline version for score input rows
interface InlineScoreMarkersProps {
  state: MarkerState;
  onChange: (newState: MarkerState) => void;
}

export const InlineScoreMarkers: React.FC<InlineScoreMarkersProps> = ({
  state,
  onChange,
}) => {
  const activeMarkers = markers.filter(m => state[m.key]);
  
  const toggleMarker = (key: keyof MarkerState) => {
    onChange({ ...state, [key]: !state[key] });
  };

  // Show only most common markers inline, with option to expand
  const quickMarkers: MarkerConfig[] = [
    markers.find(m => m.key === 'birdie')!,
    markers.find(m => m.key === 'eagle')!,
    markers.find(m => m.key === 'sandyPar')!,
    markers.find(m => m.key === 'pinkie')!,
    markers.find(m => m.key === 'trampa')!,
  ];

  return (
    <div className="flex items-center gap-0.5">
      {quickMarkers.map(marker => {
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
                      : 'bg-transparent text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {marker.label}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
};
