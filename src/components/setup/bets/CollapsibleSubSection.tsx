import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSubSectionProps {
  label: string;
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export const CollapsibleSubSection: React.FC<CollapsibleSubSectionProps> = ({
  label,
  summary,
  children,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={cn(
          "w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors",
          "bg-muted/40 hover:bg-muted/60 border border-border/50"
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{label}:</span>
          <span className="font-medium">{summary}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="mt-2 pl-1" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
};
