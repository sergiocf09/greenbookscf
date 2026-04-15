import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { BetConfig, Player, BetCategory } from '@/types/golf';
import { BetCategoryTabs } from './BetCategoryTabs';
import { IndividualBets } from './bets/IndividualBets';
import { ParejasBets } from './bets/ParejasBets';
import { GrupalBets } from './bets/GrupalBets';
import { BetTemplatesDialog } from './bets/BetTemplatesDialog';
import { useAuth } from '@/contexts/AuthContext';
import { BookMarked, Lock, Pencil, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setGroupBetOverride, resolveConfigForGroup } from '@/lib/groupBetOverrides';
import { cn } from '@/lib/utils';

interface BetSetupProps {
  config: BetConfig;
  onChange: (config: BetConfig) => void;
  players: Player[];
  hasMultipleGroups?: boolean;
  /** The groupId of the currently logged-in user (undefined = organizer / G1) */
  userGroupId?: string;
  /** Whether the current user is the round organizer */
  isOrganizer?: boolean;
  /** Matrix strokes lookup — returns strokes A gives to B (positive = A gives) */
  getStrokesForLocalPair?: (localIdA: string, localIdB: string) => number;
}

type GroupTab = 'inherited' | 'mygroup';

export const BetSetup: React.FC<BetSetupProps> = ({
  config,
  onChange,
  players,
  hasMultipleGroups = false,
  userGroupId,
  isOrganizer = true,
  getStrokesForLocalPair,
}) => {
  const { profile } = useAuth();
  const [activeCategory, setActiveCategory] = useState<BetCategory>('individual');
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);
  const [groupTab, setGroupTab] = useState<GroupTab>('mygroup');

  const isSecondaryGroup = hasMultipleGroups && !isOrganizer && !!userGroupId;

  // Prevent scroll jumping
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const isRestoringRef = useRef(false);

  useLayoutEffect(() => {
    const y = pendingScrollRestoreRef.current;
    if (typeof y !== 'number' || isRestoringRef.current) return;
    isRestoringRef.current = true;
    pendingScrollRestoreRef.current = null;
    window.scrollTo({ top: y, behavior: 'instant' });
    queueMicrotask(() => { window.scrollTo({ top: y, behavior: 'instant' }); });
    requestAnimationFrame(() => { window.scrollTo({ top: y, behavior: 'instant' }); isRestoringRef.current = false; });
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

  // For secondary groups editing their own overrides
  const updateBetForMyGroup = <K extends keyof BetConfig>(
    betType: K,
    updates: Partial<BetConfig[K]>
  ) => {
    if (isSecondaryGroup && userGroupId) {
      const updated = setGroupBetOverride(config, userGroupId, betType, updates);
      safeOnChange(updated);
    } else {
      const current = config[betType];
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        safeOnChange({
          ...config,
          [betType]: { ...current, ...updates },
        });
      } else {
        safeOnChange({
          ...config,
          [betType]: updates,
        });
      }
    }
  };

  // Read-only no-op for inherited view
  const noOpUpdateBet = <K extends keyof BetConfig>(
    _betType: K,
    _updates: Partial<BetConfig[K]>
  ) => {
    // Read-only — do nothing
  };

  const noOpOnChange = useCallback((_: BetConfig) => {
    // Read-only — do nothing
  }, []);

  const handleApplyTemplate = useCallback((cfg: BetConfig) => {
    safeOnChange(cfg);
  }, [safeOnChange]);

  // The resolved config for the user's group (base + overrides merged)
  const resolvedConfig = isSecondaryGroup
    ? resolveConfigForGroup(config, userGroupId)
    : config;

  // Determine which config and handlers to use based on active tab
  const isReadOnly = isSecondaryGroup && groupTab === 'inherited';
  const activeConfig = isReadOnly ? config : resolvedConfig;
  const activeUpdateBet = isReadOnly ? noOpUpdateBet : updateBetForMyGroup;
  const activeOnChange = isReadOnly ? noOpOnChange : safeOnChange;

  const renderBetContent = () => (
    <div className="min-h-[200px]">
      {activeCategory === 'individual' && (
        <IndividualBets
          config={activeConfig}
          players={players}
          expandedSections={expandedSections}
          onToggleSection={isReadOnly ? () => {} : toggleSection}
          onUpdateBet={activeUpdateBet}
          onUpdateConfig={activeOnChange}
          basePlayerId={profile?.id}
        />
      )}
      {activeCategory === 'parejas' && (
        <ParejasBets
          config={activeConfig}
          players={players}
          expandedSections={expandedSections}
          onToggleSection={isReadOnly ? () => {} : toggleSection}
          onUpdateBet={activeUpdateBet}
          onUpdateConfig={activeOnChange}
          getStrokesForLocalPair={getStrokesForLocalPair}
        />
      )}
      {activeCategory === 'grupal' && (
        <GrupalBets
          config={activeConfig}
          players={players}
          expandedSections={expandedSections}
          onToggleSection={isReadOnly ? () => {} : toggleSection}
          onUpdateBet={activeUpdateBet}
          onUpdateConfig={activeOnChange}
          hasMultipleGroups={hasMultipleGroups}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Secondary group: dual tab selector */}
      {isSecondaryGroup && (
        <div className="space-y-3">
          <div className="flex gap-1.5 p-1 bg-muted/50 rounded-xl border border-border/40">
            <button
              type="button"
              onClick={() => setGroupTab('inherited')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                groupTab === 'inherited'
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/80'
              )}
            >
              <Lock className="h-3.5 w-3.5" />
              Grupo 1 (heredado)
            </button>
            <button
              type="button"
              onClick={() => setGroupTab('mygroup')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                groupTab === 'mygroup'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/80'
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              Mi Grupo
            </button>
          </div>

          {/* Context banner */}
          {groupTab === 'inherited' ? (
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
              <Lock className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200 leading-tight">
                  Configuración base del Grupo 1 (solo lectura)
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight mt-0.5">
                  Esta es la plantilla que tu grupo hereda. No se puede modificar desde aquí.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-primary/5 p-3 rounded-xl border border-primary/20">
              <Pencil className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground leading-tight">
                  Apuestas de tu grupo
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  Heredas la base del Grupo 1. Aquí puedes modificar montos o activar/desactivar apuestas para tu grupo.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <BetCategoryTabs
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      {/* Templates Strip — only show for organizer or when on "mygroup" tab */}
      {(!isSecondaryGroup || groupTab === 'mygroup') && (
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
      )}

      {/* Read-only overlay wrapper for inherited tab */}
      {isReadOnly ? (
        <div className="pointer-events-none opacity-60">
          {renderBetContent()}
        </div>
      ) : (
        renderBetContent()
      )}

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
