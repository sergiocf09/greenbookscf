import { BetConfig, DEFAULT_STABLEFORD_POINTS } from '@/types/golf';

export const defaultBetConfig: BetConfig = {
  medal: { enabled: true, frontAmount: 50, backAmount: 100, totalAmount: 100 },
  pressures: { enabled: true, frontAmount: 50, backAmount: 100, totalAmount: 50 },
  skins: { enabled: true, frontValue: 25, backValue: 50, carryOver: false, modality: 'acumulados' },
  caros: { enabled: true, amount: 200 },
  oyeses: { enabled: false, amount: 25, playerConfigs: [] },
  units: { enabled: true, valuePerPoint: 25 },
  manchas: { enabled: true, valuePerPoint: 25 },
  culebras: { enabled: true, valuePerOccurrence: 25 },
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
  // NEW BET TYPES
  putts: { enabled: false, frontAmount: 50, backAmount: 50, totalAmount: 100 },
  sideBets: { enabled: true, bets: [] },
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
};
