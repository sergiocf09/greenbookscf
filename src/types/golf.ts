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
  yardsBlue?: number;
  yardsWhite?: number;
  yardsYellow?: number;
  yardsRed?: number;
}

export interface Player {
  id: string;
  name: string;
  initials: string;
  color: string;
  handicap: number; // General handicap for the round
  teamHandicap?: number; // Specific handicap for team bets (Carritos)
  profileId?: string; // Link to database profile
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
  // Manually toggleable - Manchas (UPDATED NAMES)
  ladies: boolean;        // was pinkie - tiro de damas
  swingBlanco: boolean;   // was paloma - swing en blanco
  retruje: boolean;       // golpe para atrás
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
  ladies: false,
  swingBlanco: false,
  retruje: false,
  trampa: false,
  dobleAgua: false,
  dobleOB: false,
  par3GirMas3: false,
  dobleDigito: false,
  moreliana: false,
  culebra: false,
};

// Marker display info
export const markerInfo: Record<keyof MarkerState, { label: string; emoji: string; isUnit: boolean; autoDetected: boolean }> = {
  birdie: { label: 'Birdie', emoji: '🐦', isUnit: true, autoDetected: true },
  eagle: { label: 'Águila', emoji: '🦅', isUnit: true, autoDetected: true },
  albatross: { label: 'Albatros', emoji: '🦢', isUnit: true, autoDetected: true },
  cuatriput: { label: 'Cuatriput', emoji: '😱', isUnit: false, autoDetected: true },
  sandyPar: { label: 'Sandy Par', emoji: '🏖️', isUnit: true, autoDetected: false },
  aquaPar: { label: 'Aqua Par', emoji: '💧', isUnit: true, autoDetected: false },
  holeOut: { label: 'Hole Out', emoji: '🎯', isUnit: true, autoDetected: false },
  ladies: { label: 'Ladies', emoji: '👠', isUnit: false, autoDetected: false },
  swingBlanco: { label: 'Swing Blanco', emoji: '💨', isUnit: false, autoDetected: false },
  retruje: { label: 'Retruje', emoji: '↩️', isUnit: false, autoDetected: false },
  trampa: { label: 'Trampa', emoji: '⚠️', isUnit: false, autoDetected: false },
  dobleAgua: { label: 'Doble Agua', emoji: '🌊', isUnit: false, autoDetected: false },
  dobleOB: { label: 'Doble OB', emoji: '🚫', isUnit: false, autoDetected: false },
  par3GirMas3: { label: 'Par3 +3 GIR', emoji: '3️⃣', isUnit: false, autoDetected: false },
  dobleDigito: { label: 'Doble Dígito', emoji: '🔟', isUnit: false, autoDetected: false },
  moreliana: { label: 'Moreliana', emoji: '🎭', isUnit: false, autoDetected: false },
  culebra: { label: 'Culebra', emoji: '🐍', isUnit: false, autoDetected: true },
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

// Per-bet handicap override
export interface BetHandicapOverride {
  betType: string;
  playerAHandicap: number;
  playerBHandicap: number;
}
