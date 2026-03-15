/**
 * Bet Calculations Engine — Orchestrator
 * 
 * All individual calculators live under src/lib/bets/.
 * This file re-exports everything for backward compatibility and contains
 * only the top-level `calculateAllBets` orchestrator.
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { resolveConfigForGroup } from './groupBetOverrides';
import { calculateOyesesBets } from './oyesesCalculations';
import { calculateRayasBets } from './rayasCalculations';
import { calculateConejaBets } from './conejaCalculations';

// ── Re-exports from modular files (backward compatibility) ──
export type { BetSummary } from './bets/shared';
export {
  groupPlayersByGroup,
  resolveParticipantsForGroup,
  shouldCalculatePair,
  resolveParticipantsWithOneVsAll,
  getBilateralHandicapForPair,
  getAdjustedScoresForPair,
  getHoleScore,
  getSegmentHoleRange,
  getSegmentNetTotal,
  getMutualSegmentNetTotals,
} from './bets/shared';

export { calculateMedalBets } from './bets/medal';
export { calculatePressureBets } from './bets/pressures';
export type { PressureHoleState, PressureEvolution } from './bets/pressures';
export { getPressureEvolution } from './bets/pressures';
export { calculateUnitsBets } from './bets/units';
export { calculateManchasBets } from './bets/manchas';
export { calculateCulebrasBets } from './bets/culebras';
export { calculatePinguinosBets } from './bets/pinguinos';
export { calculateMedalGeneralBets } from './bets/medalGeneral';
export { calculatePuttsBets } from './bets/putts';
export { calculateSideBets } from './bets/sideBets';
export { calculateStablefordBets } from './bets/stableford';
export { calculateSkinsBets } from './bets/skins';
export { calculateCarosBets } from './bets/caros';
export { calculateCarritosBets } from './bets/carritos';
export { calculateTeamPressuresBets } from './bets/teamPressures';
export { calculateZoologicoBets, calculateZoologicoAnimalResult } from './bets/zoologico';
export type { ZoologicoAnimalResult } from './bets/zoologico';
export { getSkinsEvolution } from './bets/skinsEvolution';
export type { SkinsHoleState, SkinsEvolution } from './bets/skinsEvolution';
export {
  getPlayerBalance,
  getBilateralBalance,
  groupSummariesByType,
  detectTiesNeedingResolution,
} from './bets/helpers';
export type { TieResolution } from './bets/helpers';

// ── Imports for the orchestrator ──
import type { BetSummary } from './bets/shared';
import { groupPlayersByGroup, resolveParticipantsForGroup } from './bets/shared';
import { calculateMedalBets } from './bets/medal';
import { calculatePressureBets } from './bets/pressures';
import { calculateUnitsBets } from './bets/units';
import { calculateManchasBets } from './bets/manchas';
import { calculateCulebrasBets } from './bets/culebras';
import { calculatePinguinosBets } from './bets/pinguinos';
import { calculateMedalGeneralBets } from './bets/medalGeneral';
import { calculatePuttsBets } from './bets/putts';
import { calculateSideBets } from './bets/sideBets';
import { calculateStablefordBets } from './bets/stableford';
import { calculateSkinsBets } from './bets/skins';
import { calculateCarosBets } from './bets/caros';
import { calculateCarritosBets } from './bets/carritos';
import { calculateTeamPressuresBets } from './bets/teamPressures';
import { calculateZoologicoBets } from './bets/zoologico';

// Calculate ALL bet summaries with bet overrides and bilateral handicap overrides applied
export const calculateAllBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  startingHole: 1 | 10 = 1,
  confirmedHoles: Set<number> = new Set()
): BetSummary[] => {
  const bilateralHandicaps = config.bilateralHandicaps;
  
  // Convert Coneja bets to BetSummary format (scoped PER GROUP)
  const conejaSummaries: BetSummary[] = [];
  if (config.coneja?.enabled && players.length >= 2) {
    const playersByGroup = groupPlayersByGroup(players);
    
    playersByGroup.forEach(groupPlayers => {
      if (groupPlayers.length < 2) return;
      const groupId = groupPlayers[0]?.groupId;
      const resolvedConfig = resolveConfigForGroup(config, groupId);
      if (!resolvedConfig.coneja?.enabled) return;

      const participatingPlayers = resolveParticipantsForGroup(
        players,
        resolvedConfig.coneja.participantIds,
        groupPlayers
      );
      if (participatingPlayers.length < 2) return;

      const conejaBets = calculateConejaBets(participatingPlayers, scores, course, resolvedConfig, confirmedHoles);
      conejaBets.forEach(bet => {
        conejaSummaries.push({
          playerId: bet.winnerId,
          vsPlayer: bet.loserId,
          betType: 'Coneja',
          amount: bet.amount,
          segment: 'total',
          description: bet.description,
        });
        conejaSummaries.push({
          playerId: bet.loserId,
          vsPlayer: bet.winnerId,
          betType: 'Coneja',
          amount: -bet.amount,
          segment: 'total',
          description: bet.description,
        });
      });
    });
  }
  
  const allSummaries = [
    ...calculateMedalBets(players, scores, config, course, bilateralHandicaps, startingHole),
    ...calculatePressureBets(players, scores, config, course, bilateralHandicaps, startingHole),
    ...calculateSkinsBets(players, scores, config, course, bilateralHandicaps, startingHole),
    ...calculateCarosBets(players, scores, config, course, bilateralHandicaps, startingHole),
    ...calculateOyesesBets(players, scores, config, course),
    ...calculateUnitsBets(players, scores, config, course),
    ...calculateManchasBets(players, scores, config),
    ...calculateCulebrasBets(players, scores, config),
    ...calculatePinguinosBets(players, scores, config, course),
    ...calculateZoologicoBets(players, config),
    ...calculateRayasBets(players, scores, config, course, bilateralHandicaps, startingHole),
    ...calculateMedalGeneralBets(players, scores, config, course),
    ...conejaSummaries,
    ...calculatePuttsBets(players, scores, config, startingHole),
    ...calculateSideBets(players, config),
    ...calculateStablefordBets(players, scores, config, course),
    ...calculateTeamPressuresBets(players, scores, config, course, startingHole),
    ...calculateCarritosBets(players, scores, config, course),
  ];
  
  // Apply bet overrides - cancel disabled bets and apply amount overrides
  if (config.betOverrides && config.betOverrides.length > 0) {
    const resolveOverridePlayerId = (pid: string): string => {
      const direct = players.find((p) => p.id === pid);
      if (direct) return direct.id;
      const byProfile = players.find((p) => p.profileId === pid);
      return byProfile?.id ?? pid;
    };

    return allSummaries.map(summary => {
      const override = config.betOverrides?.find(o => {
        const aId = resolveOverridePlayerId(o.playerAId);
        const bId = resolveOverridePlayerId(o.playerBId);
        const matchesPair = (aId === summary.playerId && bId === summary.vsPlayer) ||
                           (aId === summary.vsPlayer && bId === summary.playerId);
        const summaryType = summary.betType.toLowerCase();
        const rawOverrideType = (o.betType ?? '').toLowerCase();
        const overrideType = (() => {
          switch (rawOverrideType) {
            case 'pressures': return 'presiones';
            case 'oyeses': return 'oyes';
            case 'units': return 'unidades';
            case 'pinguinos': return 'pingüinos';
            case 'medalgeneral': return 'medal general';
            default: return rawOverrideType;
          }
        })();

        const isCarryLabel = summaryType.includes('(carry');
        
        const matchesBetType = (() => {
          // Carry variants like "presiones back (carry x2+match)" must still match
          // their parent override type ("presiones"). Previously this required exact
          // match which prevented the override from disabling carry results.
          if (isCarryLabel) return summaryType.includes(overrideType);
          if (overrideType === 'medal' && (summaryType.includes('medal general') || summaryType.includes('rayas medal'))) return false;
          if (overrideType === 'rayas' && summaryType.includes('rayas medal') && o.enabled !== false) return false;
          if (overrideType === 'presiones' && summaryType.includes('presiones parejas')) return false;
          return summaryType.includes(overrideType);
        })();
        return matchesPair && matchesBetType;
      });
      
      if (override) {
        if (override.enabled === false) return { ...summary, amount: 0 };
        const isRayasType = summary.betType === 'Rayas Front' || 
                            summary.betType === 'Rayas Back' || 
                            summary.betType === 'Rayas Medal Total' ||
                            summary.betType === 'Rayas Oyes';
        if (override.amountOverride !== undefined && summary.amount !== 0 && !isRayasType) {
          if (typeof summary.units === 'number') {
            const sign = summary.amount > 0 ? 1 : -1;
            const mult = typeof summary.multiplier === 'number' ? summary.multiplier : 1;
            return { ...summary, baseUnitAmount: override.amountOverride, amount: sign * Math.abs(summary.units) * override.amountOverride * mult };
          }
          const sign = summary.amount > 0 ? 1 : -1;
          return { ...summary, amount: sign * override.amountOverride };
        }
      }
      return summary;
    }).filter(s => s.amount !== 0 || !config.betOverrides?.some(o => {
      if (o.enabled !== false) return false;
      const aId = resolveOverridePlayerId(o.playerAId);
      const bId = resolveOverridePlayerId(o.playerBId);
      return (aId === s.playerId && bId === s.vsPlayer) || (aId === s.vsPlayer && bId === s.playerId);
    }));
  }
  
  return allSummaries;
};
