import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { BetConfig, Player, BetCategory } from '@/types/golf';
import { BetCategoryTabs } from './BetCategoryTabs';
import { IndividualBets } from './bets/IndividualBets';
import { ParejasBets } from './bets/ParejasBets';
import { GrupalBets } from './bets/GrupalBets';
import { BetTemplatesDialog } from './bets/BetTemplatesDialog';
import { useAuth } from '@/contexts/AuthContext';
import { BookMarked, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setGroupBetOverride } from '@/lib/groupBetOverrides';

interface BetSetupProps {
  config: BetConfig;
  onChange: (config: BetConfig) => void;
  players: Player[];
  hasMultipleGroups?: boolean;
  /** The groupId of the currently logged-in user (undefined = organizer / G1) */
  userGroupId?: string;
  /** Whether the current user is the round organizer */
  isOrganizer?: boolean;
}

export const BetSetup: React.FC<BetSetupProps> = ({
  config,
  onChange,
  players,
  hasMultipleGroups = false,
  userGroupId,
  isOrganizer = true,
}) => {
  const { profile } = useAuth();
  const [activeCategory, setActiveCategory] = useState<BetCategory>('individual');
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);

  // Non-organizer users in secondary groups write to groupBetOverrides
  // Only treat as secondary if there are actually multiple groups AND user is not organizer
  const isSecondaryGroup = hasMultipleGroups && !isOrganizer && !!userGroupId;

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
    if (isSecondaryGroup && userGroupId) {
      // Secondary group: save to groupBetOverrides instead of global config
      const updated = setGroupBetOverride(config, userGroupId, betType, updates);
      safeOnChange(updated);
    } else {
      // Organizer / G1: write directly to global config
      safeOnChange({
        ...config,
        [betType]: { ...config[betType], ...updates },
      });
    }
  };

  // For secondary groups, wrap onChange to route through overrides
  const handleSecondaryGroupConfigChange = useCallback((newConfig: BetConfig) => {
    // This is for full config replacements (e.g., from IndividualBets onUpdateConfig)
    // For secondary groups, we need to detect what changed and route to overrides
    if (!isSecondaryGroup || !userGroupId) {
      safeOnChange(newConfig);
      return;
    }
    // For now, allow full config changes to pass through
    // The individual bet components use updateBet for granular changes
    safeOnChange(newConfig);
  }, [isSecondaryGroup, userGroupId, safeOnChange]);

  const handleApplyTemplate = useCallback((cfg: BetConfig) => {
    safeOnChange(cfg);
  }, [safeOnChange]);

  return (
    <div className="space-y-4">

      {/* Secondary group banner */}
      {isSecondaryGroup && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
          <Lock className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200 leading-tight">
              Apuestas heredadas del Grupo 1 (solo lectura)
            </p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight mt-0.5">
              Puedes agregar apuestas adicionales para tu grupo
            </p>
          </div>
        </div>
      )}
      <BetCategoryTabs
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      {/* Templates Strip */}
      <div className="flex items-center gap-3 bg-muted/40 p-3 rounded-xl border border-border/30">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground leading-tight">Guarda esta configuración como plantilla</p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Cárgala después para iniciar rondas recurrentes</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0 gap-1.5 font-medium"
          onClick={() => setShowTemplatesDialog(true)}
        >
          <BookMarked className="h-4 w-4" />
          Plantillas
        </Button>
      </div>

      {/* Category Content */}
      <div className="min-h-[200px]">
        {activeCategory === 'individual' && (
          <IndividualBets
            config={config}
            players={players}
            expandedSections={expandedSections}
            onToggleSection={toggleSection}
            onUpdateBet={updateBet}
            onUpdateConfig={safeOnChange}
            basePlayerId={profile?.id}
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
            onUpdateConfig={safeOnChange}
            hasMultipleGroups={hasMultipleGroups}
          />
        )}
      </div>

      {/* Templates Dialog */}
      <BetTemplatesDialog
        open={showTemplatesDialog}
        onOpenChange={setShowTemplatesDialog}
        betConfig={config}
        players={players}
        onApplyTemplate={handleApplyTemplate}
      />
    </div>
  );
};

// Re-export defaultBetConfig for backwards compatibility
export { defaultBetConfig } from './bets/defaultBetConfig';
