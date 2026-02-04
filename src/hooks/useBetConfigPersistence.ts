import { useCallback, useEffect, useRef, useState } from 'react';
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
  ZoologicoBetConfig,
} from '@/types/golf';
import { devError, devLog } from '@/lib/logger';

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
    segments?: {
      skins: { enabled: boolean; frontValue: number; backValue: number };
      units: { enabled: boolean; frontValue: number; backValue: number };
      oyes: { enabled: boolean; frontValue: number; backValue: number };
      medal: { enabled: boolean; frontValue: number; backValue: number };
    };
    bilateralOverrides?: Record<string, Array<{
      rivalId: string;
      enabled: boolean;
      segments?: {
        skins?: { enabled?: boolean; frontValue?: number; backValue?: number };
        units?: { enabled?: boolean; frontValue?: number; backValue?: number };
        oyes?: { enabled?: boolean; frontValue?: number; backValue?: number; modality?: 'acumulados' | 'sangron' };
        medal?: { enabled?: boolean; frontValue?: number; backValue?: number };
      };
    }>>;
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
  coneja?: {
    enabled: boolean;
    amount: number;
    handicapMode: 'individual' | 'bilateral';
  };
  carritos?: CarritosBetConfig;
  carritosTeams?: CarritosTeamBet[];
  bilateralHandicaps?: BilateralHandicap[];
  betOverrides?: BetOverride[];
  crossGroupRivals?: Record<string, string[]>;
  
  // New bet types
  putts?: {
    enabled: boolean;
    frontAmount: number;
    backAmount: number;
    totalAmount: number;
  };
  sideBets?: {
    enabled: boolean;
    bets: Array<{
      id: string;
      winners: string[];
      losers: string[];
      amount: number;
      description?: string;
      createdAt: string;
    }>;
  };
  stableford?: {
    enabled: boolean;
    amount: number;
    points: {
      albatross: number;
      eagle: number;
      birdie: number;
      par: number;
      bogey: number;
      doubleBogey: number;
      tripleBogey: number;
      quadrupleOrWorse: number;
    };
    playerHandicaps: Array<{
      playerId: string;
      handicap: number;
    }>;
  };
  teamPressures?: {
    enabled: boolean;
    bets: Array<{
      id: string;
      teamA: [string, string];
      teamB: [string, string];
      frontAmount: number;
      backAmount: number;
      totalAmount: number;
      openingThreshold: 3 | 4;
      teamHandicaps: Record<string, number>;
      scoringType: 'lowBall' | 'highBall' | 'combined';
      enabled: boolean;
    }>;
  };
  zoologico?: ZoologicoBetConfig;
}

export const useBetConfigPersistence = ({
  roundId,
  betConfig,
  setBetConfig,
}: UseBetConfigPersistenceProps) => {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadedRef = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);

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
        devError('Error loading bet config:', error);
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
            const dbRayas = dbConfig.rayas as any;
            newConfig.rayas = {
              enabled: dbRayas.enabled ?? prev.rayas.enabled,
              frontValue: dbRayas.frontValue ?? prev.rayas.frontValue,
              backValue: dbRayas.backValue ?? prev.rayas.backValue,
              medalTotalValue: dbRayas.medalTotalValue ?? prev.rayas.medalTotalValue,
              skinVariant: dbRayas.skinVariant ?? prev.rayas.skinVariant,
              oyesMode: dbRayas.oyesMode ?? 'allVsAll',
              segments: dbRayas.segments ?? prev.rayas.segments,
              bilateralOverrides: dbRayas.bilateralOverrides ?? prev.rayas.bilateralOverrides,
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

          // Apply Coneja config if exists
          if (dbConfig.coneja) {
            newConfig.coneja = {
              enabled: dbConfig.coneja.enabled ?? prev.coneja.enabled,
              amount: dbConfig.coneja.amount ?? prev.coneja.amount,
              handicapMode: dbConfig.coneja.handicapMode ?? prev.coneja.handicapMode,
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
          
          // Apply cross-group rivals if exist (new structure: Record<string, string[]>)
          if (dbConfig.crossGroupRivals) {
            newConfig.crossGroupRivals = dbConfig.crossGroupRivals;
          }
          
          // Apply Putts config if exists
          if (dbConfig.putts) {
            newConfig.putts = {
              enabled: dbConfig.putts.enabled ?? prev.putts.enabled,
              frontAmount: dbConfig.putts.frontAmount ?? prev.putts.frontAmount,
              backAmount: dbConfig.putts.backAmount ?? prev.putts.backAmount,
              totalAmount: dbConfig.putts.totalAmount ?? prev.putts.totalAmount,
            };
          }
          
          // Apply Side Bets config if exists
          if (dbConfig.sideBets) {
            newConfig.sideBets = {
              enabled: dbConfig.sideBets.enabled ?? prev.sideBets.enabled,
              bets: dbConfig.sideBets.bets ?? prev.sideBets.bets,
            };
          }
          
          // Apply Stableford config if exists
          if (dbConfig.stableford) {
            newConfig.stableford = {
              enabled: dbConfig.stableford.enabled ?? prev.stableford.enabled,
              amount: dbConfig.stableford.amount ?? prev.stableford.amount,
              points: dbConfig.stableford.points ?? prev.stableford.points,
              playerHandicaps: dbConfig.stableford.playerHandicaps ?? prev.stableford.playerHandicaps,
            };
          }
          
          // Apply Team Pressures config if exists
          if (dbConfig.teamPressures) {
            newConfig.teamPressures = {
              enabled: dbConfig.teamPressures.enabled ?? prev.teamPressures.enabled,
              bets: dbConfig.teamPressures.bets ?? prev.teamPressures.bets,
            };
          }
          
          // Apply Zoologico config if exists
          if (dbConfig.zoologico) {
            newConfig.zoologico = {
              enabled: dbConfig.zoologico.enabled ?? prev.zoologico.enabled,
              valuePerOccurrence: dbConfig.zoologico.valuePerOccurrence ?? prev.zoologico.valuePerOccurrence,
              enabledAnimals: dbConfig.zoologico.enabledAnimals ?? prev.zoologico.enabledAnimals,
              events: dbConfig.zoologico.events ?? prev.zoologico.events,
              tieBreakers: dbConfig.zoologico.tieBreakers ?? prev.zoologico.tieBreakers,
            };
          }
          
          return newConfig;
        });
        
        // Mark loaded after we apply the incoming config
        isLoadedRef.current = true;
        setIsLoaded(true);
        devLog('Bet config loaded from database:', dbConfig);
      } else {
        // Important: rounds can have empty '{}' bet_config.
        // We still want to enable debounced saving for future changes (overrides/cancelaciones).
        isLoadedRef.current = true;
        setIsLoaded(true);
      }
    } catch (err) {
      devError('Error in loadBetConfig:', err);
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
          segments: config.rayas.segments,
          bilateralOverrides: config.rayas.bilateralOverrides,
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
        coneja: {
          enabled: config.coneja.enabled,
          amount: config.coneja.amount,
          handicapMode: config.coneja.handicapMode,
        },
        carritos: config.carritos,
        carritosTeams: config.carritosTeams || [],
        bilateralHandicaps: config.bilateralHandicaps || [],
        betOverrides: config.betOverrides || [],
        crossGroupRivals: config.crossGroupRivals || {},
        // New bet types
        putts: {
          enabled: config.putts.enabled,
          frontAmount: config.putts.frontAmount,
          backAmount: config.putts.backAmount,
          totalAmount: config.putts.totalAmount,
        },
        sideBets: {
          enabled: config.sideBets.enabled,
          bets: config.sideBets.bets,
        },
        stableford: {
          enabled: config.stableford.enabled,
          amount: config.stableford.amount,
          points: config.stableford.points,
          playerHandicaps: config.stableford.playerHandicaps,
        },
        teamPressures: {
          enabled: config.teamPressures.enabled,
          bets: config.teamPressures.bets,
        },
        zoologico: config.zoologico,
      };

      const { error } = await supabase
        .from('rounds')
        .update({ bet_config: JSON.parse(JSON.stringify(configToSave)) })
        .eq('id', roundId);

      if (error) {
        devError('Error saving bet config:', error);
        return;
      }

      devLog('Bet config saved to database');
    } catch (err) {
      devError('Error in saveBetConfig:', err);
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
    isLoaded,
  };
};
