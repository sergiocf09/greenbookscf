import { BetConfig, DEFAULT_STABLEFORD_POINTS, SkinsGrupalBetConfig } from '@/types/golf';

export const defaultBetConfig: BetConfig = {
  medal: { enabled: false, frontAmount: 50, backAmount: 100, totalAmount: 100 },
  pressures: { enabled: false, frontAmount: 50, backAmount: 100, totalAmount: 50 },
  skins: { enabled: false, frontValue: 25, backValue: 50, carryOver: true, modality: 'acumulados' },
  caros: { enabled: false, amount: 200, startHole: 15, endHole: 18 },
  oyeses: { enabled: false, amount: 25, playerConfigs: [] },
  units: { enabled: false, valuePerPoint: 25 },
  manchas: { enabled: false, valuePerPoint: 25 },
  culebras: { enabled: false, valuePerOccurrence: 25 },
  pinguinos: { enabled: false, valuePerOccurrence: 25 },
  rayas: { enabled: false, frontValue: 25, backValue: 50, medalTotalValue: 25, skinVariant: 'acumulados', oyesMode: 'allVsAll' },
  carritos: { 
    enabled: false, 
    teamA: ['', ''], 
    teamB: ['', ''], 
    frontAmount: 100, 
    backAmount: 100, 
    totalAmount: 100,
    useTeamHandicaps: false,
    scoringType: 'all',
    teamHandicaps: {},
  },
  medalGeneral: { enabled: false, amount: 100, playerHandicaps: [] },
  coneja: { enabled: false, amount: 50, handicapMode: 'individual' },
  carritosTeams: [],
  betOverrides: [],
  bilateralHandicaps: [],
  crossGroupRivals: {},
  groupBetOverrides: {},
  disabledTeamBetIds: [],
  // NEW BET TYPES
  putts: { enabled: false, frontAmount: 50, backAmount: 50, totalAmount: 100 },
  sideBets: { enabled: false, bets: [] },
  stableford: { 
    enabled: false, 
    amount: 100, 
    points: DEFAULT_STABLEFORD_POINTS,
    playerHandicaps: [] 
  },
  teamPressures: { enabled: false, bets: [] },
  // ZOOLOGICO - NEW
  zoologico: {
    enabled: false,
    valuePerOccurrence: 10, // Default $10 as per spec
    enabledAnimals: ['camello', 'pez', 'gorila'], // All enabled by default
    events: [],
    tieBreakers: {},
  },
  // SKINS GRUPAL - NEW
  skinsGrupal: {
    enabled: false,
    frontAmount: 50,
    backAmount: 100,
    modality: 'acumulados',
    playerHandicaps: [],
  },
};
