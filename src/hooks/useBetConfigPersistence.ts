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
import { devError, devLog, devWarn } from '@/lib/logger';

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
    oyesMode?: 'allVsAll' | 'singleWinner';
    playerSkinVariants?: Record<string, 'acumulados' | 'sinAcumulacion'>;
    pairSkinVariantOverrides?: Record<string, 'acumulados' | 'sinAcumulacion'>;
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
    participantIds?: string[];
    oneVsAll?: boolean;
    anchorPlayerId?: string;
  };
  oyeses?: {
    enabled: boolean;
    amount: number;
    playerConfigs: Array<{
      playerId: string;
      modality: 'acumulados' | 'sangron';
      enabled: boolean;
    }>;
    participantIds?: string[];
  };
  medalGeneral?: {
    enabled: boolean;
    amount: number;
    playerHandicaps: MedalGeneralPlayerConfig[];
    participantIds?: string[];
    scope?: 'group' | 'global' | 'both';
  };
  coneja?: {
    enabled: boolean;
    amount: number;
    handicapMode: 'individual' | 'bilateral';
    participantIds?: string[];
  };
  carritos?: CarritosBetConfig;
  carritosTeams?: CarritosTeamBet[];
  bilateralHandicaps?: BilateralHandicap[];
  betOverrides?: BetOverride[];
  crossGroupRivals?: Record<string, string[]>;
  groupBetOverrides?: Record<string, any>;
  disabledTeamBetIds?: string[];
  
  // New bet types
  putts?: {
    enabled: boolean;
    frontAmount: number;
    backAmount: number;
    totalAmount: number;
    participantIds?: string[];
    oneVsAll?: boolean;
    anchorPlayerId?: string;
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
    participantIds?: string[];
    scope?: 'group' | 'global' | 'both';
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
  // Track the last known updated_at to prevent stale writes
  const lastKnownUpdatedAtRef = useRef<string | null>(null);
  // Track if a save is in flight (legacy, kept for safety)
  const savingRef = useRef(false);
  // Track when we are applying a remote config change to suppress our own re-save
  const isApplyingRemoteRef = useRef(false);

  // Load bet config from database
  const loadBetConfig = useCallback(async () => {
    if (!roundId) return;

    try {
      const { data: round, error } = await supabase
        .from('rounds')
        .select('bet_config, updated_at')
        .eq('id', roundId)
        .single();

      if (error) {
        devError('Error loading bet config:', error);
        return;
      }

      // Store the updated_at for concurrency checks
      if (round?.updated_at) {
        lastKnownUpdatedAtRef.current = round.updated_at;
      }

      if (round?.bet_config) {
        const dbConfig = round.bet_config as RoundBetConfig;
        applyDbConfigToState(dbConfig);
        devLog('Bet config loaded from database:', dbConfig);
      }
      
      isLoadedRef.current = true;
      setIsLoaded(true);
    } catch (err) {
      devError('Error in loadBetConfig:', err);
    }
  }, [roundId, setBetConfig]);

  // Shared logic to merge DB config into local state
  const applyDbConfigToState = useCallback((dbConfig: RoundBetConfig) => {
    setBetConfig(prev => {
      const newConfig = { ...prev };

      if (dbConfig.medal) newConfig.medal = { ...prev.medal, ...dbConfig.medal };
      if (dbConfig.pressures) newConfig.pressures = { ...prev.pressures, ...dbConfig.pressures };
      if (dbConfig.skins) newConfig.skins = { ...prev.skins, ...dbConfig.skins };
      if (dbConfig.caros) newConfig.caros = { ...prev.caros, ...dbConfig.caros };
      if (dbConfig.units) newConfig.units = { ...prev.units, ...dbConfig.units };
      if (dbConfig.manchas) newConfig.manchas = { ...prev.manchas, ...dbConfig.manchas };
      if (dbConfig.culebras) newConfig.culebras = { ...prev.culebras, ...dbConfig.culebras };
      if (dbConfig.pinguinos) newConfig.pinguinos = { ...prev.pinguinos, ...dbConfig.pinguinos };
      
      if (dbConfig.rayas) {
        const dbRayas = dbConfig.rayas as any;
        newConfig.rayas = {
          enabled: dbRayas.enabled ?? prev.rayas.enabled,
          frontValue: dbRayas.frontValue ?? prev.rayas.frontValue,
          backValue: dbRayas.backValue ?? prev.rayas.backValue,
          medalTotalValue: dbRayas.medalTotalValue ?? prev.rayas.medalTotalValue,
          skinVariant: dbRayas.skinVariant ?? prev.rayas.skinVariant,
          oyesMode: dbRayas.oyesMode ?? 'allVsAll',
          playerSkinVariants: dbRayas.playerSkinVariants ?? prev.rayas.playerSkinVariants,
          pairSkinVariantOverrides: dbRayas.pairSkinVariantOverrides ?? prev.rayas.pairSkinVariantOverrides,
          segments: dbRayas.segments ?? prev.rayas.segments,
          bilateralOverrides: dbRayas.bilateralOverrides ?? prev.rayas.bilateralOverrides,
          participantIds: 'participantIds' in dbRayas ? dbRayas.participantIds : prev.rayas.participantIds,
          oneVsAll: dbRayas.oneVsAll ?? prev.rayas.oneVsAll,
          anchorPlayerId: dbRayas.anchorPlayerId ?? prev.rayas.anchorPlayerId,
        };
      }
      
      if (dbConfig.oyeses) {
        newConfig.oyeses = {
          enabled: dbConfig.oyeses.enabled ?? prev.oyeses.enabled,
          amount: dbConfig.oyeses.amount ?? prev.oyeses.amount,
          playerConfigs: dbConfig.oyeses.playerConfigs ?? prev.oyeses.playerConfigs,
          participantIds: 'participantIds' in dbConfig.oyeses ? dbConfig.oyeses.participantIds : prev.oyeses.participantIds,
        };
      }
      
      if (dbConfig.bilateralHandicaps) newConfig.bilateralHandicaps = dbConfig.bilateralHandicaps;
      if (dbConfig.betOverrides) newConfig.betOverrides = dbConfig.betOverrides;
      
      if (dbConfig.medalGeneral) {
        newConfig.medalGeneral = {
          enabled: dbConfig.medalGeneral.enabled ?? prev.medalGeneral.enabled,
          amount: dbConfig.medalGeneral.amount ?? prev.medalGeneral.amount,
          playerHandicaps: dbConfig.medalGeneral.playerHandicaps ?? prev.medalGeneral.playerHandicaps,
          participantIds: 'participantIds' in dbConfig.medalGeneral ? dbConfig.medalGeneral.participantIds : prev.medalGeneral.participantIds,
          scope: dbConfig.medalGeneral.scope ?? prev.medalGeneral.scope,
        };
      }

      if (dbConfig.coneja) {
        newConfig.coneja = {
          enabled: dbConfig.coneja.enabled ?? prev.coneja.enabled,
          amount: dbConfig.coneja.amount ?? prev.coneja.amount,
          handicapMode: dbConfig.coneja.handicapMode ?? prev.coneja.handicapMode,
          participantIds: 'participantIds' in dbConfig.coneja ? dbConfig.coneja.participantIds : prev.coneja.participantIds,
        };
      }

      if (dbConfig.carritos) {
        newConfig.carritos = {
          ...prev.carritos,
          ...dbConfig.carritos,
          teamA: (dbConfig.carritos.teamA ?? prev.carritos.teamA) as [string, string],
          teamB: (dbConfig.carritos.teamB ?? prev.carritos.teamB) as [string, string],
          teamHandicaps: dbConfig.carritos.teamHandicaps ?? prev.carritos.teamHandicaps,
        };
      }

      if (dbConfig.carritosTeams) newConfig.carritosTeams = dbConfig.carritosTeams;
      if (dbConfig.crossGroupRivals) newConfig.crossGroupRivals = dbConfig.crossGroupRivals;
      if (dbConfig.groupBetOverrides) newConfig.groupBetOverrides = dbConfig.groupBetOverrides;
      if ('disabledTeamBetIds' in dbConfig) newConfig.disabledTeamBetIds = dbConfig.disabledTeamBetIds || [];
      
      if (dbConfig.putts) {
        newConfig.putts = {
          enabled: dbConfig.putts.enabled ?? prev.putts.enabled,
          frontAmount: dbConfig.putts.frontAmount ?? prev.putts.frontAmount,
          backAmount: dbConfig.putts.backAmount ?? prev.putts.backAmount,
          totalAmount: dbConfig.putts.totalAmount ?? prev.putts.totalAmount,
          participantIds: dbConfig.putts.participantIds ?? prev.putts.participantIds,
          oneVsAll: dbConfig.putts.oneVsAll ?? prev.putts.oneVsAll,
          anchorPlayerId: dbConfig.putts.anchorPlayerId ?? prev.putts.anchorPlayerId,
        };
      }
      
      if (dbConfig.sideBets) {
        newConfig.sideBets = {
          enabled: dbConfig.sideBets.enabled ?? prev.sideBets.enabled,
          bets: dbConfig.sideBets.bets ?? prev.sideBets.bets,
        };
      }
      
      if (dbConfig.stableford) {
        newConfig.stableford = {
          enabled: dbConfig.stableford.enabled ?? prev.stableford.enabled,
          amount: dbConfig.stableford.amount ?? prev.stableford.amount,
          points: dbConfig.stableford.points ?? prev.stableford.points,
          playerHandicaps: dbConfig.stableford.playerHandicaps ?? prev.stableford.playerHandicaps,
          participantIds: 'participantIds' in dbConfig.stableford ? dbConfig.stableford.participantIds : prev.stableford.participantIds,
          scope: dbConfig.stableford.scope ?? prev.stableford.scope,
        };
      }
      
      if (dbConfig.teamPressures) {
        newConfig.teamPressures = {
          enabled: dbConfig.teamPressures.enabled ?? prev.teamPressures.enabled,
          bets: dbConfig.teamPressures.bets ?? prev.teamPressures.bets,
        };
      }
      
      if (dbConfig.zoologico) {
        newConfig.zoologico = {
          enabled: dbConfig.zoologico.enabled ?? prev.zoologico.enabled,
          valuePerOccurrence: dbConfig.zoologico.valuePerOccurrence ?? prev.zoologico.valuePerOccurrence,
          enabledAnimals: dbConfig.zoologico.enabledAnimals ?? prev.zoologico.enabledAnimals,
          events: dbConfig.zoologico.events ?? prev.zoologico.events,
          tieBreakers: dbConfig.zoologico.tieBreakers ?? prev.zoologico.tieBreakers,
          participantIds: dbConfig.zoologico.participantIds ?? prev.zoologico.participantIds,
        };
      }
      
      return newConfig;
    });
  }, [setBetConfig]);

  // Save bet config to database with concurrency protection
  const saveBetConfig = useCallback(async (config: BetConfig) => {
    if (!roundId) return;

    try {
      const configToSave: RoundBetConfig = {
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
          oyesMode: config.rayas.oyesMode,
          playerSkinVariants: config.rayas.playerSkinVariants,
          pairSkinVariantOverrides: config.rayas.pairSkinVariantOverrides,
          segments: config.rayas.segments,
          bilateralOverrides: config.rayas.bilateralOverrides,
          participantIds: config.rayas.participantIds,
          oneVsAll: config.rayas.oneVsAll,
          anchorPlayerId: config.rayas.anchorPlayerId,
        },
        oyeses: {
          enabled: config.oyeses.enabled,
          amount: config.oyeses.amount,
          playerConfigs: config.oyeses.playerConfigs,
          participantIds: config.oyeses.participantIds,
        },
        medalGeneral: {
          enabled: config.medalGeneral.enabled,
          amount: config.medalGeneral.amount,
          playerHandicaps: config.medalGeneral.playerHandicaps,
          participantIds: config.medalGeneral.participantIds,
          scope: config.medalGeneral.scope,
        },
        coneja: {
          enabled: config.coneja.enabled,
          amount: config.coneja.amount,
          handicapMode: config.coneja.handicapMode,
          participantIds: config.coneja.participantIds,
        },
        carritos: config.carritos,
        carritosTeams: config.carritosTeams || [],
        bilateralHandicaps: config.bilateralHandicaps || [],
        betOverrides: config.betOverrides || [],
        crossGroupRivals: config.crossGroupRivals || {},
        groupBetOverrides: config.groupBetOverrides || {},
        disabledTeamBetIds: config.disabledTeamBetIds || [],
        putts: {
          enabled: config.putts.enabled,
          frontAmount: config.putts.frontAmount,
          backAmount: config.putts.backAmount,
          totalAmount: config.putts.totalAmount,
          participantIds: config.putts.participantIds,
          oneVsAll: config.putts.oneVsAll,
          anchorPlayerId: config.putts.anchorPlayerId,
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
          participantIds: config.stableford.participantIds,
          scope: config.stableford.scope,
        },
        teamPressures: {
          enabled: config.teamPressures.enabled,
          bets: config.teamPressures.bets,
        },
        zoologico: config.zoologico,
      };

      // Concurrency guard: check updated_at before writing
      if (lastKnownUpdatedAtRef.current) {
        const { data: current, error: checkErr } = await supabase
          .from('rounds')
          .select('updated_at')
          .eq('id', roundId)
          .single();
        
        if (!checkErr && current?.updated_at && current.updated_at !== lastKnownUpdatedAtRef.current) {
          // Someone else updated — reload their config first, then re-merge
          devWarn('Concurrency conflict detected on bet_config save. Reloading remote state.');
          await loadBetConfig();
          return;
        }
      }

      savingRef.current = true;
      const { data: updated, error } = await supabase
        .from('rounds')
        .update({ bet_config: JSON.parse(JSON.stringify(configToSave)) })
        .eq('id', roundId)
        .select('updated_at')
        .single();

      savingRef.current = false;

      if (error) {
        devError('Error saving bet config:', error);
        return;
      }

      // Register our own save timestamp so we can suppress its Realtime echo
      if (updated?.updated_at) {
        lastKnownUpdatedAtRef.current = updated.updated_at;
        ownSaveTimestampsRef.current.add(updated.updated_at);
        // Clean up old entries to avoid unbounded growth
        if (ownSaveTimestampsRef.current.size > 20) {
          const arr = Array.from(ownSaveTimestampsRef.current);
          ownSaveTimestampsRef.current = new Set(arr.slice(-10));
        }
      }

      devLog('Bet config saved to database');
    } catch (err) {
      savingRef.current = false;
      devError('Error in saveBetConfig:', err);
    }
  }, [roundId, loadBetConfig]);

  // Debounced save on config change
  const debouncedSave = useCallback((config: BetConfig) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveBetConfig(config);
    }, 500);
  }, [saveBetConfig]);

  // Auto-save when bet config changes (after initial load).
  // Skip if the change came from a remote Realtime update to prevent echo loops.
  useEffect(() => {
    if (isApplyingRemoteRef.current) {
      isApplyingRemoteRef.current = false;
      return;
    }
    if (isLoadedRef.current && roundId) {
      debouncedSave(betConfig);
    }
  }, [betConfig, roundId, debouncedSave]);

  // Track our own save timestamps to suppress our own Realtime echo
  const ownSaveTimestampsRef = useRef<Set<string>>(new Set());

  // Realtime subscription for bet_config changes from other players
  useEffect(() => {
    if (!roundId) return;

    const channel = supabase
      .channel(`round-config-${roundId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rounds',
          filter: `id=eq.${roundId}`,
        },
        (payload) => {
          const newRecord = payload.new as any;
          if (!newRecord?.bet_config) return;

          const incomingUpdatedAt = newRecord.updated_at as string | undefined;

          // Skip if this is our own save echo (identified by updated_at)
          if (incomingUpdatedAt && ownSaveTimestampsRef.current.has(incomingUpdatedAt)) {
            devLog('Realtime: skipping own save echo at', incomingUpdatedAt);
            ownSaveTimestampsRef.current.delete(incomingUpdatedAt);
            return;
          }

          devLog('Realtime: bet_config updated by another player');

          // Update our known timestamp
          if (incomingUpdatedAt) {
            lastKnownUpdatedAtRef.current = incomingUpdatedAt;
          }

          // Apply the remote config — suppress auto-save re-trigger
          isApplyingRemoteRef.current = true;
          const dbConfig = newRecord.bet_config as RoundBetConfig;
          applyDbConfigToState(dbConfig);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId, applyDbConfigToState]);

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
