import React from 'react';
import { GroupBetScope } from '@/types/golf';
import { cn } from '@/lib/utils';
import { Users, Globe, Layers } from 'lucide-react';

interface BetScopeSelectorProps {
  scope: GroupBetScope;
  onChange: (scope: GroupBetScope) => void;
}

const options: { value: GroupBetScope; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'group', label: 'Por Grupo', description: 'Una apuesta dentro de cada grupo', icon: <Users className="h-3.5 w-3.5" /> },
  { value: 'global', label: 'General', description: 'Una sola apuesta entre todos', icon: <Globe className="h-3.5 w-3.5" /> },
  { value: 'both', label: 'Ambas', description: 'Apuesta por grupo + una general', icon: <Layers className="h-3.5 w-3.5" /> },
];

export const BetScopeSelector: React.FC<BetScopeSelectorProps> = ({ scope, onChange }) => {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Alcance Multi-grupo</span>
      <div className="grid grid-cols-3 gap-1.5">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(opt.value); }}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-center transition-all border",
              scope === opt.value
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
            )}
          >
            {opt.icon}
            <span className="text-[10px] font-semibold leading-tight">{opt.label}</span>
            <span className="text-[8px] leading-tight opacity-80">{opt.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
