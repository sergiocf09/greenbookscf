import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  BetConfig,
  BilateralHandicap,
  BetOverride,
  MedalGeneralPlayerConfig,
  CarritosBetConfig,
  CarritosTeamBet,
  MedalBetConfig,
  PressureBetConfig,
  SkinsBetConfig,
  CarosBetConfig,
  UnitsBetConfig,
  ManchasBetConfig,
  CumulativeBetConfig,
} from '@/types/golf';

interface UseBetConfigPersistenceProps {
  roundId: string | null;
  betConfig: BetConfig;
  setBetConfig: React.Dispatch<React.SetStateAction<BetConfig>>;
}

interface RoundBetConfig {
  // Standard bilateral bets
  medal?: MedalBetConfig;
  pressures?: PressureBetConfig;
  skins?: SkinsBetConfig;
  caros?: CarosBetConfig;
  units?: UnitsBetConfig;
  manchas?: ManchasBetConfig;
  culebras?: CumulativeBetConfig;
  pinguinos?: CumulativeBetConfig;

  rayas?: {
    enabled: boolean;
    frontValue: number;
    backValue: number;
    medalTotalValue: number;
    skinVariant: 'acumulados' | 'sinAcumulacion';
  };
  oyeses?: {
    enabled: boolean;
    amount: number;
    playerConfigs: Array<{
      playerId: string;
      modality: 'acumulados' | 'sangron';
      enabled: boolean;
    }>;
  };
  medalGeneral?: {
    enabled: boolean;
    amount: number;
    playerHandicaps: MedalGeneralPlayerConfig[];
  };
  carritos?: CarritosBetConfig;
  carritosTeams?: CarritosTeamBet[];
  bilateralHandicaps?: BilateralHandicap[];
  betOverrides?: BetOverride[];
}

export const useBetConfigPersistence = ({
  roundId,
  betConfig,
  setBetConfig,
}: UseBetConfigPersistenceProps) => {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadedRef = useRef(false);

  // Load bet config from database
  const loadBetConfig = useCallback(async () => {
    if (!roundId) return;

    try {
      const { data: round, error } = await supabase
        .from('rounds')
        .select('bet_config')
        .eq('id', roundId)
        .single();

      if (error) {
        console.error('Error loading bet config:', error);
        return;
      }

      if (round?.bet_config) {
        const dbConfig = round.bet_config as RoundBetConfig;
        
        // Merge database config with current config
        setBetConfig(prev => {
          const newConfig = { ...prev };

          // Apply standard bets if exist
          if (dbConfig.medal) {
            newConfig.medal = { ...prev.medal, ...dbConfig.medal };
          }
          if (dbConfig.pressures) {
            newConfig.pressures = { ...prev.pressures, ...dbConfig.pressures };
          }
          if (dbConfig.skins) {
            newConfig.skins = { ...prev.skins, ...dbConfig.skins };
          }
          if (dbConfig.caros) {
            newConfig.caros = { ...prev.caros, ...dbConfig.caros };
          }
          if (dbConfig.units) {
            newConfig.units = { ...prev.units, ...dbConfig.units };
          }
          if (dbConfig.manchas) {
            newConfig.manchas = { ...prev.manchas, ...dbConfig.manchas };
          }
          if (dbConfig.culebras) {
            newConfig.culebras = { ...prev.culebras, ...dbConfig.culebras };
          }
          if (dbConfig.pinguinos) {
            newConfig.pinguinos = { ...prev.pinguinos, ...dbConfig.pinguinos };
          }
          
          // Apply Rayas config if exists
          if (dbConfig.rayas) {
            newConfig.rayas = {
              enabled: dbConfig.rayas.enabled ?? prev.rayas.enabled,
              frontValue: dbConfig.rayas.frontValue ?? prev.rayas.frontValue,
              backValue: dbConfig.rayas.backValue ?? prev.rayas.backValue,
              medalTotalValue: dbConfig.rayas.medalTotalValue ?? prev.rayas.medalTotalValue,
              skinVariant: dbConfig.rayas.skinVariant ?? prev.rayas.skinVariant,
            };
          }
          
          // Apply Oyeses config if exists
          if (dbConfig.oyeses) {
            newConfig.oyeses = {
              enabled: dbConfig.oyeses.enabled ?? prev.oyeses.enabled,
              amount: dbConfig.oyeses.amount ?? prev.oyeses.amount,
              playerConfigs: dbConfig.oyeses.playerConfigs ?? prev.oyeses.playerConfigs,
            };
          }
          
          // Apply bilateral handicaps if exist
          if (dbConfig.bilateralHandicaps) {
            newConfig.bilateralHandicaps = dbConfig.bilateralHandicaps;
          }
          
          // Apply bet overrides if exist
          if (dbConfig.betOverrides) {
            newConfig.betOverrides = dbConfig.betOverrides;
          }
          
          // Apply Medal General config if exists
          if (dbConfig.medalGeneral) {
            newConfig.medalGeneral = {
              enabled: dbConfig.medalGeneral.enabled ?? prev.medalGeneral.enabled,
              amount: dbConfig.medalGeneral.amount ?? prev.medalGeneral.amount,
              playerHandicaps: dbConfig.medalGeneral.playerHandicaps ?? prev.medalGeneral.playerHandicaps,
            };
          }

          // Apply Carritos config if exists
          if (dbConfig.carritos) {
            newConfig.carritos = {
              ...prev.carritos,
              ...dbConfig.carritos,
              // Defensive: keep tuple shape stable
              teamA: (dbConfig.carritos.teamA ?? prev.carritos.teamA) as [string, string],
              teamB: (dbConfig.carritos.teamB ?? prev.carritos.teamB) as [string, string],
              teamHandicaps: dbConfig.carritos.teamHandicaps ?? prev.carritos.teamHandicaps,
            };
          }

          if (dbConfig.carritosTeams) {
            newConfig.carritosTeams = dbConfig.carritosTeams;
          }
          
          return newConfig;
        });
        
        // Mark loaded after we apply the incoming config
        isLoadedRef.current = true;
        console.log('Bet config loaded from database:', dbConfig);
      } else {
        // Important: rounds can have empty '{}' bet_config.
        // We still want to enable debounced saving for future changes (overrides/cancelaciones).
        isLoadedRef.current = true;
      }
    } catch (err) {
      console.error('Error in loadBetConfig:', err);
    }
  }, [roundId, setBetConfig]);

  // Save bet config to database
  const saveBetConfig = useCallback(async (config: BetConfig) => {
    if (!roundId) return;

    try {
      // Build the config object to store
      const configToSave: RoundBetConfig = {
        // Standard bets
        medal: config.medal,
        pressures: config.pressures,
        skins: config.skins,
        caros: config.caros,
        units: config.units,
        manchas: config.manchas,
        culebras: config.culebras,
        pinguinos: config.pinguinos,

        rayas: {
          enabled: config.rayas.enabled,
          frontValue: config.rayas.frontValue,
          backValue: config.rayas.backValue,
          medalTotalValue: config.rayas.medalTotalValue,
          skinVariant: config.rayas.skinVariant,
        },
        oyeses: {
          enabled: config.oyeses.enabled,
          amount: config.oyeses.amount,
          playerConfigs: config.oyeses.playerConfigs,
        },
        medalGeneral: {
          enabled: config.medalGeneral.enabled,
          amount: config.medalGeneral.amount,
          playerHandicaps: config.medalGeneral.playerHandicaps,
        },
        carritos: config.carritos,
        carritosTeams: config.carritosTeams || [],
        bilateralHandicaps: config.bilateralHandicaps || [],
        betOverrides: config.betOverrides || [],
      };

      const { error } = await supabase
        .from('rounds')
        .update({ bet_config: JSON.parse(JSON.stringify(configToSave)) })
        .eq('id', roundId);

      if (error) {
        console.error('Error saving bet config:', error);
        return;
      }

      console.log('Bet config saved to database');
    } catch (err) {
      console.error('Error in saveBetConfig:', err);
    }
  }, [roundId]);

  // Debounced save on config change
  const debouncedSave = useCallback((config: BetConfig) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveBetConfig(config);
    }, 500);
  }, [saveBetConfig]);

  // Auto-save when bet config changes (after initial load)
  useEffect(() => {
    if (isLoadedRef.current && roundId) {
      debouncedSave(betConfig);
    }
  }, [betConfig, roundId, debouncedSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    loadBetConfig,
    saveBetConfig,
  };
};
