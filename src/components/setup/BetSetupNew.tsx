import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { BetConfig, Player, BetCategory } from '@/types/golf';
import { BetCategoryTabs } from './BetCategoryTabs';
import { IndividualBets } from './bets/IndividualBets';
import { ParejasBets } from './bets/ParejasBets';
import { GrupalBets } from './bets/GrupalBets';

interface BetSetupProps {
  config: BetConfig;
  onChange: (config: BetConfig) => void;
  players: Player[];
}

export const BetSetup: React.FC<BetSetupProps> = ({
  config,
  onChange,
  players,
}) => {
  const [activeCategory, setActiveCategory] = useState<BetCategory>('individual');
  const [expandedSections, setExpandedSections] = useState<string[]>(['medal']);

  // Prevent scroll jumping to the top of the bet setup when the parent re-renders.
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const isRestoringRef = useRef(false);

  useLayoutEffect(() => {
    const y = pendingScrollRestoreRef.current;
    if (typeof y !== 'number' || isRestoringRef.current) return;
    
    isRestoringRef.current = true;
    pendingScrollRestoreRef.current = null;
    
    // Immediate restore
    window.scrollTo({ top: y, behavior: 'instant' });
    
    // Backup restore after a microtask
    queueMicrotask(() => {
      window.scrollTo({ top: y, behavior: 'instant' });
    });
    
    // Final backup with RAF
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: 'instant' });
      isRestoringRef.current = false;
    });
  });

  const safeOnChange = useCallback(
    (next: BetConfig) => {
      pendingScrollRestoreRef.current = window.scrollY;
      onChange(next);
    },
    [onChange]
  );

  const toggleSection = (section: string, open: boolean) => {
    setExpandedSections((prev) => {
      const isOpen = prev.includes(section);
      if (open === isOpen) return prev;
      return open ? [...prev, section] : prev.filter((s) => s !== section);
    });
  };

  const updateBet = <K extends keyof BetConfig>(
    betType: K,
    updates: Partial<BetConfig[K]>
  ) => {
    safeOnChange({
      ...config,
      [betType]: { ...config[betType], ...updates },
    });
  };

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">Configuración de Apuestas</Label>

      {/* Category Tabs */}
      <BetCategoryTabs
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      {/* Category Content */}
      <div className="min-h-[200px]">
        {activeCategory === 'individual' && (
          <IndividualBets
            config={config}
            players={players}
            expandedSections={expandedSections}
            onToggleSection={toggleSection}
            onUpdateBet={updateBet}
          />
        )}
        
        {activeCategory === 'parejas' && (
          <ParejasBets
            config={config}
            players={players}
            expandedSections={expandedSections}
            onToggleSection={toggleSection}
            onUpdateBet={updateBet}
            onUpdateConfig={safeOnChange}
          />
        )}
        
        {activeCategory === 'grupal' && (
          <GrupalBets
            config={config}
            players={players}
            expandedSections={expandedSections}
            onToggleSection={toggleSection}
            onUpdateBet={updateBet}
          />
        )}
      </div>
    </div>
  );
};

// Re-export defaultBetConfig for backwards compatibility
export { defaultBetConfig } from './bets/defaultBetConfig';
