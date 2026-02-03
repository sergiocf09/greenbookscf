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
  teeColor?: string; // Player's selected tee (white, blue, yellow, red). NULL = use round default.
}

export interface PlayerScore {
  playerId: string;
  holeNumber: number;
  strokes: number;
  putts: number;
  markers: MarkerState;
  strokesReceived: number; // Calculated from handicap
  oyesProximity?: number | null; // Oyeses proximity order (1=closest, null=no number)
  netScore: number; // strokes - strokesReceived
  confirmed: boolean; // Whether the score has been validated
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

// Bet override for individual pair bets
export interface BetOverride {
  playerAId: string;
  playerBId: string;
  betType: string; // 'medal_front', 'skins_back', etc.
  enabled: boolean;
  amountOverride?: number;
}

// Carritos team bet config
export interface CarritosTeamBet {
  id: string;
  teamA: [string, string];
  teamB: [string, string];
  frontAmount: number;
  backAmount: number;
  totalAmount: number;
  scoringType: 'lowBall' | 'highBall' | 'combined' | 'all';
  teamHandicaps?: Record<string, number>;
  enabled: boolean;
}

// Oyeses (Closest to the Pin) configuration
export type OyesModality = 'acumulados' | 'sangron';

export interface OyesesPlayerConfig {
  playerId: string;
  modality: OyesModality;
  enabled: boolean;
}

export interface OyesesBetConfig {
  enabled: boolean;
  amount: number;
  playerConfigs: OyesesPlayerConfig[];
}

// Oyeses hole result - captures proximity order per player per hole
export interface OyesHoleResult {
  playerId: string;
  holeNumber: number;
  proximityOrder: number | null; // 1 = closest, null = no green in 1 (acumulados) or not set
  reachedGreen: boolean; // Only relevant for acumulados mode
}

// Bilateral handicap override for a player pair
export interface BilateralHandicap {
  playerAId: string;
  playerBId: string;
  playerAHandicap: number;
  playerBHandicap: number;
}

// Rayas bet config - aggregator bet
export type RayasSkinVariant = 'acumulados' | 'sinAcumulacion';

// Rayas segment configuration (skins, units, oyes, medal)
export interface RayasSegmentConfig {
  enabled: boolean;
  frontValue: number;
  backValue: number;
}

// Rayas bilateral override for a specific player pair
export interface RayasBilateralOverride {
  rivalId: string; // The opponent player ID
  enabled: boolean;
  segments?: {
    skins?: { enabled?: boolean; frontValue?: number; backValue?: number };
    units?: { enabled?: boolean; frontValue?: number; backValue?: number };
    oyes?: { enabled?: boolean; frontValue?: number; backValue?: number; modality?: OyesModality };
    medal?: { enabled?: boolean; frontValue?: number; backValue?: number };
  };
}

export interface RayasBetConfig {
  enabled: boolean;
  frontValue: number;     // Default value per raya in Front 9
  backValue: number;      // Default value per raya in Back 9
  medalTotalValue: number; // Value for the Medal Total raya
  skinVariant: RayasSkinVariant; // Whether skins accumulate in Rayas
  // Per-segment configuration (optional, defaults to enabled with main values)
  segments?: {
    skins: RayasSegmentConfig;
    units: RayasSegmentConfig;
    oyes: RayasSegmentConfig;
    medal: RayasSegmentConfig;
  };
  // Per-player bilateral overrides (keyed by logged-in player's ID)
  bilateralOverrides?: Record<string, RayasBilateralOverride[]>;
}

// Medal General - Group bet for lowest net total score
export interface MedalGeneralPlayerConfig {
  playerId: string;
  handicap: number; // Specific handicap for this group bet
}

export interface MedalGeneralBetConfig {
  enabled: boolean;
  amount: number; // Amount each loser pays to winner(s)
  playerHandicaps: MedalGeneralPlayerConfig[]; // Per-player handicaps for this bet
}

// Coneja - Group bet based on patas per hole and sets
export type ConejaHandicapMode = 'individual' | 'bilateral';

export interface ConejaBetConfig {
  enabled: boolean;
  amount: number; // Amount per coneja (same for all 3 sets)
  handicapMode: ConejaHandicapMode; // 'individual' = use player handicap, 'bilateral' = use bilateral handicaps
}

// Coneja pata state for a specific hole
export interface ConejaPataState {
  holeNumber: number;
  winnerId: string | null; // Player who won the hole absolutely, null if no winner
  patasPerPlayer: Record<string, number>; // Patas accumulated by each player up to this hole
}

// Coneja set result
export interface ConejaSetResult {
  setNumber: 1 | 2 | 3;
  startHole: number;
  endHole: number;
  winnerId: string | null; // Winner of this coneja, null if accumulated
  wonOnHole: number | null; // Hole where it was won (for accumulated conejas)
  isAccumulated: boolean; // Whether this coneja was accumulated from previous set(s)
  accumulatedSets: number[]; // Which sets are accumulated in this win (e.g., [1, 2] if set 1 and 2 accumulated into set 3)
}

// =====================================================
// NEW BET TYPES
// =====================================================

// Putts bet - Individual, no handicap, direct putt comparison
export interface PuttsBetConfig {
  enabled: boolean;
  frontAmount: number;
  backAmount: number;
  totalAmount: number;
}

// Side Bets - Quick capture, no handicap, direct money
export interface SideBet {
  id: string;
  winners: string[];  // Player IDs who receive money
  losers: string[];   // Player IDs who pay
  amount: number;     // Amount per person
  description?: string;
  holeNumber?: number; // Hole where the side bet was created
  createdAt: string;
}

export interface SideBetsConfig {
  enabled: boolean;
  bets: SideBet[];
}

// Stableford - Group bet with configurable point values
export interface StablefordPointConfig {
  albatross: number;
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  doubleBogey: number;
  tripleBogey: number;
  quadrupleOrWorse: number;
}

export interface StablefordPlayerConfig {
  playerId: string;
  handicap: number;
}

export interface StablefordBetConfig {
  enabled: boolean;
  amount: number;
  points: StablefordPointConfig;
  playerHandicaps: StablefordPlayerConfig[];
}

// Presiones por Parejas - Team pressures
export interface TeamPressuresBet {
  id: string;
  teamA: [string, string];
  teamB: [string, string];
  frontAmount: number;
  backAmount: number;
  totalAmount: number;
  openingThreshold: 3 | 4; // Opens new pressure when diff reaches this
  teamHandicaps: Record<string, number>; // Per-player handicaps for this bet
  scoringType: 'lowBall' | 'highBall' | 'combined';
  enabled: boolean;
}

export interface TeamPressuresBetConfig {
  enabled: boolean;
  bets: TeamPressuresBet[];
}

// =====================================================
// MAIN BET CONFIG
// =====================================================

// Bet configuration types
export interface BetConfig {
  medal: MedalBetConfig;
  pressures: PressureBetConfig;
  skins: SkinsBetConfig;
  caros: CarosBetConfig;
  oyeses: OyesesBetConfig;
  units: UnitsBetConfig;
  manchas: ManchasBetConfig;
  culebras: CumulativeBetConfig;
  pinguinos: CumulativeBetConfig;
  rayas: RayasBetConfig;
  carritos: CarritosBetConfig;
  medalGeneral: MedalGeneralBetConfig; // Group bet - lowest net total wins
  coneja: ConejaBetConfig; // Group bet - patas system per set of 6 holes
  carritosTeams?: CarritosTeamBet[]; // Multiple team bets
  betOverrides?: BetOverride[]; // Individual bet overrides
  bilateralHandicaps?: BilateralHandicap[]; // Handicap overrides per player pair
  crossGroupRivals?: Record<string, string[]>; // Per-player map: basePlayerId -> array of cross-group rival IDs
  // NEW BET TYPES
  putts: PuttsBetConfig;
  sideBets: SideBetsConfig;
  stableford: StablefordBetConfig;
  teamPressures: TeamPressuresBetConfig;
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
  totalAmount: number; // Match 18 bet amount
}

export interface SkinsBetConfig {
  enabled: boolean;
  frontValue: number;
  backValue: number;
  carryOver: boolean; // If skins carry from 9 to 10
  modality?: 'acumulados' | 'sinAcumular'; // acumulados = ties add to pot; sinAcumular = ties are void
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
  tieBreakLoser?: string; // Manual override for who pays when tie on last hole
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
  teamHandicaps?: Record<string, number>; // playerId -> handicap for carritos
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

// Player group for multi-group rounds
export interface PlayerGroup {
  id: string;
  name: string;
  players: Player[];
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

// Bet Category for UI organization
export type BetCategory = 'individual' | 'parejas' | 'grupal';

// Helper to classify bets by category
export const BET_CATEGORIES: Record<string, BetCategory> = {
  medal: 'individual',
  pressures: 'individual',
  skins: 'individual',
  caros: 'individual',
  oyeses: 'individual',
  units: 'individual',
  manchas: 'individual',
  putts: 'individual',
  // Parejas
  carritos: 'parejas',
  teamPressures: 'parejas',
  // Grupal
  coneja: 'grupal',
  culebras: 'grupal',
  pinguinos: 'grupal',
  medalGeneral: 'grupal',
  stableford: 'grupal',
  rayas: 'individual', // Rayas is an aggregator of individual bets
};

// Default Stableford point values (flexible)
export const DEFAULT_STABLEFORD_POINTS: StablefordPointConfig = {
  albatross: 5,
  eagle: 4,
  birdie: 3,
  par: 2,
  bogey: 1,
  doubleBogey: 0,
  tripleBogey: -1,
  quadrupleOrWorse: -2,
};
