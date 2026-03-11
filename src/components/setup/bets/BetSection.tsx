import React from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface BetSectionProps {
  id: string;
  title: string;
  description: string;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  isExpanded: boolean;
  onExpandChange: (open: boolean) => void;
  children: React.ReactNode;
  color?: 'gold' | 'green' | 'red';
  helpText?: string;
}

export const BetSection: React.FC<BetSectionProps> = ({ 
  id, 
  title, 
  description, 
  enabled = true, 
  onToggle, 
  isExpanded,
  onExpandChange,
  children, 
  color = 'green',
  helpText,
}) => (
  <Collapsible 
    open={isExpanded} 
    onOpenChange={onExpandChange}
  >
    <div className="border rounded-lg overflow-hidden transition-colors border-border bg-card">
      <div className="flex items-center justify-between p-3">
        <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
          <div className={cn(
            'w-2 h-2 rounded-full',
            color === 'gold' ? 'bg-golf-gold' : color === 'red' ? 'bg-destructive' : 'bg-golf-green'
          )} />
          <div className="flex-1">
            <p className="font-medium text-sm">{title}</p>
            <p className="text-[10px] text-muted-foreground">{description}</p>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="p-3 pt-0 space-y-3">
          {children}
        </div>
      </CollapsibleContent>
    </div>
  </Collapsible>
);
