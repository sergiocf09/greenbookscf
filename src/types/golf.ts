// Golf Types for the entire application

export interface GolfCourse {
  id: string;
  name: string;
  location: string;
  holes: HoleInfo[];
}

export interface HoleInfo {
  number: number;
  par: number;
  handicapIndex: number; // Stroke index for handicap distribution
  yards?: number;
}

export interface Player {
  id: string;
  name: string;
  initials: string;
  color: string;
  handicap: number; // General handicap for the round
  teamHandicap?: number; // Specific handicap for team bets (Carritos)
}

export interface PlayerScore {
  playerId: string;
  holeNumber: number;
  strokes: number;
  putts: number;
  markers: MarkerState;
  strokesReceived: number; // Calculated from handicap
  netScore: number; // strokes - strokesReceived
}

export interface MarkerState {
  // Auto-detected by score (not toggleable)
  birdie: boolean;
  eagle: boolean;
  albatross: boolean;
  cuatriput: boolean;
  // Manually toggleable - Unidades
  sandyPar: boolean;
  aquaPar: boolean;
  holeOut: boolean;
  // Manually toggleable - Manchas
  pinkie: boolean;
  paloma: boolean;
  retruje: boolean;
  trampa: boolean;
  dobleAgua: boolean;
  dobleOB: boolean;
  par3GirMas3: boolean;
  dobleDigito: boolean;
  moreliana: boolean;
  culebra: boolean; // 3+ putts (for cumulative bet)
}

export const defaultMarkerState: MarkerState = {
  birdie: false,
  eagle: false,
  albatross: false,
  cuatriput: false,
  sandyPar: false,
  aquaPar: false,
  holeOut: false,
  pinkie: false,
  paloma: false,
  retruje: false,
  trampa: false,
  dobleAgua: false,
  dobleOB: false,
  par3GirMas3: false,
  dobleDigito: false,
  moreliana: false,
  culebra: false,
};

// Bet configuration types
export interface BetConfig {
  medal: MedalBetConfig;
  pressures: PressureBetConfig;
  skins: SkinsBetConfig;
  caros: CarosBetConfig;
  units: UnitsBetConfig;
  manchas: ManchasBetConfig;
  culebras: CumulativeBetConfig;
  pinguinos: CumulativeBetConfig;
  carritos: CarritosBetConfig;
}

export interface MedalBetConfig {
  enabled: boolean;
  frontAmount: number;
  backAmount: number;
  totalAmount: number;
}

export interface PressureBetConfig {
  enabled: boolean;
  frontAmount: number;
  backAmount: number;
}

export interface SkinsBetConfig {
  enabled: boolean;
  frontValue: number;
  backValue: number;
  carryOver: boolean; // If skins carry from 9 to 10
}

export interface CarosBetConfig {
  enabled: boolean;
  amount: number; // Per hole 15-18
}

export interface UnitsBetConfig {
  enabled: boolean;
  valuePerPoint: number;
}

export interface ManchasBetConfig {
  enabled: boolean;
  valuePerPoint: number;
}

export interface CumulativeBetConfig {
  enabled: boolean;
  valuePerOccurrence: number;
}

export interface CarritosBetConfig {
  enabled: boolean;
  teamA: [string, string]; // Player IDs
  teamB: [string, string]; // Player IDs
  frontAmount: number;
  backAmount: number;
  totalAmount: number;
  useTeamHandicaps: boolean;
  scoringType: 'lowBall' | 'highBall' | 'combined' | 'all';
}

// Round state
export interface Round {
  id: string;
  date: string;
  courseId: string;
  players: Player[];
  scores: PlayerScore[];
  betConfig: BetConfig;
  status: 'setup' | 'inProgress' | 'completed';
}

// Bet pair for bilateral calculations
export interface BetPair {
  playerA: string;
  playerB: string;
}

// Ledger entry
export interface LedgerEntry {
  id: string;
  roundId: string;
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  betType: string;
  segment: 'front' | 'back' | 'total' | 'hole';
  holeNumber?: number;
  timestamp: string;
}
