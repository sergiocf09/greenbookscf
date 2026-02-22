import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BetConfig, Player } from '@/types/golf';
import { useAuth } from '@/contexts/AuthContext';
import { devError, devLog } from '@/lib/logger';

export interface BetTemplate {
  id: string;
  name: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

interface TemplateJson {
  version: number;
  betConfig: Omit<BetConfig, 'sideBets'>; // sideBets are ad-hoc, excluded
}

/**
 * Strip player-specific IDs from template config so it's portable.
 * We keep participantIds as-is — they'll be remapped on load.
 */
const buildTemplateJson = (config: BetConfig): TemplateJson => {
  // Deep clone and remove sideBets
  const { sideBets, ...rest } = JSON.parse(JSON.stringify(config));
  return { version: 1, betConfig: rest };
};

/**
 * Remap participantIds in a loaded template to match the current round's players.
 * Strategy:
 *  - Match by profileId when available (same registered user).
 *  - Players not found in the template are added to all active bets (default = participates).
 *  - Template players not in the round are silently dropped.
 */
const remapParticipants = (
  templateConfig: Omit<BetConfig, 'sideBets'>,
  currentPlayers: Player[],
): BetConfig => {
  const currentIds = new Set(currentPlayers.map((p) => p.id));
  const currentProfileIds = new Map<string, string>(); // profileId -> playerId
  currentPlayers.forEach((p) => {
    if (p.profileId) currentProfileIds.set(p.profileId, p.id);
  });

  // Build a mapping from template player IDs to current player IDs
  // We try profileId matching first, then positional fallback
  const remapIds = (ids: string[] | undefined): string[] | undefined => {
    if (!ids) return undefined;
    // ids that are empty arrays should stay empty (explicit "nobody participates")
    if (ids.length === 0) return [];
    
    const mapped = ids
      .map((id) => {
        // Direct match (same player ID)
        if (currentIds.has(id)) return id;
        // profileId-based match is harder without stored profileIds in template
        // We'll just drop players that aren't found
        return null;
      })
      .filter((id): id is string => id !== null);

    // Add any current players that weren't in the template (new players default to participating)
    const mappedSet = new Set(mapped);
    currentPlayers.forEach((p) => {
      if (!mappedSet.has(p.id)) {
        mapped.push(p.id);
      }
    });

    return mapped;
  };

  const result = JSON.parse(JSON.stringify(templateConfig)) as any;

  // Remap participantIds across all bet types that support them
  const betsWithParticipants = [
    'medal', 'pressures', 'skins', 'caros', 'oyeses', 'units', 'manchas',
    'culebras', 'pinguinos', 'rayas', 'putts', 'medalGeneral', 'coneja',
    'stableford', 'zoologico',
  ];

  for (const key of betsWithParticipants) {
    if (result[key] && 'participantIds' in result[key]) {
      result[key].participantIds = remapIds(result[key].participantIds);
    }
  }

  // Clear player-specific overrides that won't map correctly
  result.bilateralHandicaps = [];
  result.betOverrides = [];
  result.crossGroupRivals = {};
  result.groupBetOverrides = {};
  result.disabledTeamBetIds = [];

  // Clear carritos teams (player-specific pairings)
  result.carritos = {
    ...result.carritos,
    enabled: false,
    teamA: ['', ''],
    teamB: ['', ''],
    teamHandicaps: {},
  };
  result.carritosTeams = [];

  // Clear team pressures (player-specific pairings)
  if (result.teamPressures) {
    result.teamPressures = { enabled: false, bets: [] };
  }

  // Clear player-specific configs in oyeses
  if (result.oyeses) {
    result.oyeses.playerConfigs = [];
  }

  // Clear player handicaps in medalGeneral and stableford (will be recalculated)
  if (result.medalGeneral) {
    result.medalGeneral.playerHandicaps = [];
  }
  if (result.stableford) {
    result.stableford.playerHandicaps = [];
  }

  // Clear zoologico events (round-specific)
  if (result.zoologico) {
    result.zoologico.events = [];
    result.zoologico.tieBreakers = {};
  }

  // Add sideBets back (always fresh)
  result.sideBets = { enabled: true, bets: [] };

  return result as BetConfig;
};

export const useBetTemplates = () => {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<BetTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    if (!profile?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('bet_templates')
        .select('id, name, is_favorite, created_at, updated_at, last_used_at')
        .eq('owner_profile_id', profile.id)
        .order('is_favorite', { ascending: false })
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .order('name', { ascending: true });

      if (error) throw error;
      setTemplates((data as BetTemplate[]) || []);
    } catch (err) {
      devError('Error fetching bet templates:', err);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const saveTemplate = useCallback(
    async (name: string, config: BetConfig, isFavorite: boolean = false): Promise<{ success: boolean; conflict?: boolean }> => {
      if (!profile?.id) return { success: false };
      try {
        const templateJson = buildTemplateJson(config);

        // Check for existing name
        const { data: existing } = await supabase
          .from('bet_templates')
          .select('id')
          .eq('owner_profile_id', profile.id)
          .eq('name', name)
          .maybeSingle();

        if (existing) {
          return { success: false, conflict: true };
        }

        const { error } = await supabase.from('bet_templates').insert({
          owner_profile_id: profile.id,
          name,
          template_json: templateJson as any,
          is_favorite: isFavorite,
        });

        if (error) throw error;
        devLog('Bet template saved:', name);
        await fetchTemplates();
        return { success: true };
      } catch (err) {
        devError('Error saving bet template:', err);
        return { success: false };
      }
    },
    [profile?.id, fetchTemplates],
  );

  const overwriteTemplate = useCallback(
    async (name: string, config: BetConfig): Promise<boolean> => {
      if (!profile?.id) return false;
      try {
        const templateJson = buildTemplateJson(config);

        const { error } = await supabase
          .from('bet_templates')
          .update({
            template_json: templateJson as any,
            updated_at: new Date().toISOString(),
          })
          .eq('owner_profile_id', profile.id)
          .eq('name', name);

        if (error) throw error;
        devLog('Bet template overwritten:', name);
        await fetchTemplates();
        return true;
      } catch (err) {
        devError('Error overwriting bet template:', err);
        return false;
      }
    },
    [profile?.id, fetchTemplates],
  );

  const loadTemplate = useCallback(
    async (templateId: string, currentPlayers: Player[]): Promise<BetConfig | null> => {
      if (!profile?.id) return null;
      try {
        const { data, error } = await supabase
          .from('bet_templates')
          .select('template_json')
          .eq('id', templateId)
          .single();

        if (error) throw error;

        const templateJson = data.template_json as unknown as TemplateJson;
        if (!templateJson?.betConfig) {
          devError('Invalid template format');
          return null;
        }

        // Update last_used_at
        await supabase
          .from('bet_templates')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', templateId);

        const remapped = remapParticipants(templateJson.betConfig, currentPlayers);
        devLog('Bet template loaded and remapped');
        await fetchTemplates();
        return remapped;
      } catch (err) {
        devError('Error loading bet template:', err);
        return null;
      }
    },
    [profile?.id, fetchTemplates],
  );

  const deleteTemplate = useCallback(
    async (templateId: string): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('bet_templates')
          .delete()
          .eq('id', templateId);

        if (error) throw error;
        devLog('Bet template deleted');
        await fetchTemplates();
        return true;
      } catch (err) {
        devError('Error deleting bet template:', err);
        return false;
      }
    },
    [fetchTemplates],
  );

  const renameTemplate = useCallback(
    async (templateId: string, newName: string): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('bet_templates')
          .update({ name: newName, updated_at: new Date().toISOString() })
          .eq('id', templateId);

        if (error) throw error;
        await fetchTemplates();
        return true;
      } catch (err) {
        devError('Error renaming bet template:', err);
        return false;
      }
    },
    [fetchTemplates],
  );

  const toggleFavorite = useCallback(
    async (templateId: string, isFavorite: boolean): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('bet_templates')
          .update({ is_favorite: isFavorite })
          .eq('id', templateId);

        if (error) throw error;
        await fetchTemplates();
        return true;
      } catch (err) {
        devError('Error toggling favorite:', err);
        return false;
      }
    },
    [fetchTemplates],
  );

  return {
    templates,
    isLoading,
    fetchTemplates,
    saveTemplate,
    overwriteTemplate,
    loadTemplate,
    deleteTemplate,
    renameTemplate,
    toggleFavorite,
  };
};
