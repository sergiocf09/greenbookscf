// Golf Types for the entire application

export interface GolfCourse {
  id: string;
  name: string;
  location: string;
  holes: HoleInfo[];
  isManual?: boolean;
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
  groupId?: string; // Group ID for multi-group rounds (used to scope per-group bets)
  isFounder?: boolean; // Whether this player is a GreenBook Founder
  isAdmin?: boolean; // Co-administrator of their group (can capture scores). Organizer is implicitly admin everywhere.
}

export interface PlayerScore {
  playerId: string;
  holeNumber: number;
  strokes: number;
  putts: number;
  markers: MarkerState;
  strokesReceived: number; // Calculated from handicap
  oyesProximity?: number | null; // Oyeses proximity order for Acumulado modality (1=closest, null=no number/didn't reach green)
  oyesProximitySangron?: number | null; // Oyeses proximity order for Sangrón modality (must be complete when active)
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
  oyesUni: boolean;   // Oyes-unidad: manual unit for oyes proximity win
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
  manchaGenerica: number;
  unidadGenerica: number;
}

export const defaultMarkerState: MarkerState = {
  birdie: false,
  eagle: false,
  albatross: false,
  cuatriput: false,
  sandyPar: false,
  aquaPar: false,
  holeOut: false,
  oyesUni: false,
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
  manchaGenerica: 0,
  unidadGenerica: 0,
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
  oyesUni: { label: 'Oyes Uni', emoji: '📍', isUnit: true, autoDetected: false },
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
  manchaGenerica: { label: 'Mancha', emoji: '⬛', isUnit: false, autoDetected: false },
  unidadGenerica: { label: 'Unidad', emoji: '⭐', isUnit: true, autoDetected: false },
};

// Bet override for individual pair bets
export interface BetOverride {
  playerAId: string;
  playerBId: string;
  betType: string; // 'medal_front', 'skins_back', etc.
  enabled: boolean;
  amountOverride?: number;
  unitsAdvantage?: number; // Fixed units advantage that playerA gives to playerB
                           // Positive = A gives advantage to B (A starts owing N units)
                           // Negative = B gives advantage to A
                           // 0 or undefined = no advantage
  carryOverOnTie?: boolean; // Per-pair override for Bloques carry behavior
  carryHardOverride?: boolean; // Presiones: when Front is Carry, force the Back amount to this override
                               // (breaking the 2×Front+Total 18 formula) and pay Total 18 separately.
}

// Per-group bet override: partial config that overrides the organizer's template for a specific group
// Each key corresponds to a bet type key in BetConfig, and the value is a partial of that bet's config
export type GroupBetOverride = {
  [K in keyof BetConfig]?: Partial<BetConfig[K]>;
};

// Team Handicap Modalities (shared across all pair bets)
export type TeamHandicapMode = 'individual' | 'baseCero' | 'diferencialEquipo' | 'slidingEquipo';

export interface TeamHandicapConfig {
  mode: TeamHandicapMode;
  diferencialRecipientOverride?: string; // playerId when both players tie in HCP
  slidingHalfPointMode?: 'roundDown' | 'halfPoint'; // only when mode === 'slidingEquipo'
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
  handicapConfig?: TeamHandicapConfig;
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
  zapatoEnabled?: boolean; // Whether Zapato (x2 when one player wins all oyes) is active. Defaults to true.
  // Single-winner mode: only #1 (closest) is recognized per Par 3, and that player collects from ALL others.
  // In Acumulados, the #1 of the next played Par 3 also collects the accumulated pot. Defaults to false.
  singleWinner?: boolean;
  playerConfigs: OyesesPlayerConfig[];
  participantIds?: string[];
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

// Rayas Oyeses calculation mode
// - singleWinner: The absolute closest (#1) wins rayas vs ALL other players
// - allVsAll: Each pair is compared independently (hierarchical)
export type RayasOyesMode = 'singleWinner' | 'allVsAll';

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
  skinVariant: RayasSkinVariant; // Default skins variant
  oyesMode: RayasOyesMode; // How Oyes winners are calculated: 'singleWinner' = #1 beats all, 'allVsAll' = compare by pair
  oyesModality?: 'acumulados' | 'sangron'; // Global default modality for Rayas oyes segment
  pairOyesModalityOverrides?: Record<string, 'acumulados' | 'sangron'>; // pairKey -> modality
  playerSkinVariants?: Record<string, RayasSkinVariant>; // Per-player skin variant override (playerId -> variant)
  // Per-pair skin variant resolution when players disagree. Key = sorted "idA_idB"
  pairSkinVariantOverrides?: Record<string, RayasSkinVariant>;
  // Per-segment configuration (optional, defaults to enabled with main values)
  segments?: {
    skins: RayasSegmentConfig;
    units: RayasSegmentConfig;
    oyes: RayasSegmentConfig;
    medal: RayasSegmentConfig;
  };
  // Per-player bilateral overrides (keyed by logged-in player's ID)
  bilateralOverrides?: Record<string, RayasBilateralOverride[]>;
  // Per-pair segment resolution when players disagree. Key = sorted "idA_idB", value = segmentKey -> enabled
  pairSegmentOverrides?: Record<string, Record<string, boolean>>;
  participantIds?: string[];
  oneVsAll?: boolean;
  anchorPlayerId?: string;
}

// Medal General - Group bet for lowest net total score
export interface MedalGeneralPlayerConfig {
  playerId: string;
  handicap: number; // Specific handicap for this group bet
}

// Scope for group bets in multi-group rounds
// 'group' = only within each group, 'global' = single pool across all groups, 'both' = one pool per group + one global pool
export type GroupBetScope = 'group' | 'global' | 'both';

export interface MedalGeneralBetConfig {
  enabled: boolean;
  amount: number; // Amount each loser pays to winner(s) — used for total
  frontAmount?: number;
  backAmount?: number;
  segmentMode?: 'total' | 'segments'; // 'total' = only total 18, 'segments' = front+back+total
  playerHandicaps: MedalGeneralPlayerConfig[]; // Per-player handicaps for this bet
  participantIds?: string[];
  scope?: GroupBetScope; // Multi-group scope (default: 'global')
}

// Putts General - Group bet for lowest putt total
export interface PuttsGeneralBetConfig {
  enabled: boolean;
  amount: number; // Total 18
  frontAmount?: number;
  backAmount?: number;
  segmentMode?: 'total' | 'segments';
  participantIds?: string[];
  scope?: GroupBetScope;
}

// GIR General - Group bet for most Greens In Regulation
export interface GIRGeneralBetConfig {
  enabled: boolean;
  amount: number; // Total 18
  frontAmount?: number;
  backAmount?: number;
  segmentMode?: 'total' | 'segments';
  participantIds?: string[];
  scope?: GroupBetScope;
}



// Coneja - Group bet based on patas per hole and sets
export type ConejaHandicapMode = 'individual' | 'bilateral';

export interface ConejaBetConfig {
  enabled: boolean;
  amount: number; // Amount per coneja (same for all 3 sets)
  handicapMode: ConejaHandicapMode; // 'individual' = use player handicap, 'bilateral' = use bilateral handicaps
  participantIds?: string[];
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
  participantIds?: string[];
  oneVsAll?: boolean;
  anchorPlayerId?: string;
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
  deleted?: boolean; // Soft delete flag
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
  participantIds?: string[];
  scope?: GroupBetScope; // Multi-group scope (default: 'global')
}

// Team Pressure Units sub-modality config
export interface TeamPressureUnitsConfig {
  enabled: boolean;
  valuePerUnit: number;
  enabledMarkers: (keyof MarkerState)[]; // Which markers count as units
  unitsAdvantage?: number;        // Fixed units advantage
  unitsAdvantageTeam?: 'a' | 'b' | 'none'; // Which team GIVES the advantage
  includeGenericUnit?: boolean;   // Whether the incremental generic ⭐ marker counts as units
  valuePerGenericUnit?: number;   // Value per generic unit (defaults to valuePerUnit)
}

// Team Pressure Oyeses sub-modality config
export interface TeamPressureOyesesConfig {
  enabled: boolean;
  modality: 'acumulados' | 'sangron';
  valuePerOyes: number;
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
  scoringType: 'lowBall' | 'highBall' | 'combined' | 'matchOnly';
  enabled: boolean;
  continua?: boolean; // When true + matchOnly: single 18-hole match, early-win detection
  handicapConfig?: TeamHandicapConfig;
  // Optional sub-modalities
  unitsConfig?: TeamPressureUnitsConfig;
  oyesesConfig?: TeamPressureOyesesConfig;
}

export interface TeamPressuresBetConfig {
  enabled: boolean;
  bets: TeamPressuresBet[];
}

// =====================================================
// ZOOLOGICO BET (GROUP BET)
// =====================================================

// Types of zoo animals/events
export type ZooAnimalType = 'camello' | 'pez' | 'gorila';

// Zoo animal display info
export const ZOO_ANIMALS: Record<ZooAnimalType, { label: string; labelPlural: string; emoji: string; description: string }> = {
  camello: { label: 'Camello', labelPlural: 'Camellos', emoji: '🐪', description: 'Trampa de arena (bunker)' },
  pez: { label: 'Pez', labelPlural: 'Peces', emoji: '🐟', description: 'Irse al agua' },
  gorila: { label: 'Gorila', labelPlural: 'Gorilas', emoji: '🦍', description: 'Irse out of bounds (OB)' },
};

// A single zoo event occurrence
export interface ZooEvent {
  id: string;
  animalType: ZooAnimalType;
  playerId: string;
  holeNumber: number;
  count: number; // How many times this event happened (can be 1, 2, 3+)
  createdAt: string;
}

// Zoologico bet configuration
export interface ZoologicoBetConfig {
  enabled: boolean;
  valuePerOccurrence: number; // Default $10
  enabledAnimals: ZooAnimalType[]; // Which animals are enabled
  events: ZooEvent[]; // Recorded events during the round
  // Tie-breaker per animal type: "<holeNumber>:<playerId>"
  tieBreakers?: Partial<Record<ZooAnimalType, string>>;
  participantIds?: string[]; // Player IDs that participate (empty/undefined = all)
}

// =====================================================
// SKINS GRUPAL BET (GROUP BET)
// =====================================================

export interface SkinsGrupalBetConfig {
  enabled: boolean;
  frontAmount: number;
  backAmount: number;
  modality: 'acumulados' | 'sinAcumular';
  playerHandicaps: { playerId: string; handicap: number }[];
  participantIds?: string[];
}

// =====================================================
// MAIN BET CONFIG
// =====================================================

// Bet configuration types
export interface BetConfig {
  medal: MedalBetConfig;
  pressures: PressureBetConfig;
  matchPlay: MatchPlayBetConfig;
  bloques: BloquesBetConfig;
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
  puttsGeneral?: PuttsGeneralBetConfig; // Group bet - lowest putt total wins
  girGeneral?: GIRGeneralBetConfig; // Group bet - most GIRs wins
  coneja: ConejaBetConfig; // Group bet - patas system per set of 6 holes
  carritosTeams?: CarritosTeamBet[]; // Multiple team bets
  betOverrides?: BetOverride[]; // Individual bet overrides
  disabledTeamBetIds?: string[]; // Team bet IDs (carritos/pressures) disabled from dashboard (override, not delete)
  bilateralHandicaps?: BilateralHandicap[]; // Handicap overrides per player pair
  crossGroupRivals?: Record<string, string[]>; // Per-player map: basePlayerId -> array of cross-group rival IDs
  // Per-group overrides: allows each group to customize bet participation/amounts
  // Key is the groupId, value is a partial bet config that overrides the template
  groupBetOverrides?: Record<string, GroupBetOverride>;
  // Per-pair oyes modality override for individual oyeses bet (pairKey -> modality)
  oyesPairModalityOverrides?: Record<string, 'acumulados' | 'sangron'>;
  // Per-pair zapato enable override for individual oyeses bet (pairKey -> enabled)
  oyesPairZapatoOverrides?: Record<string, boolean>;
  // Per-pair pressure overrides (pairKey -> overrides)
  pressurePairOverrides?: Record<string, { onlyMatch?: boolean }>;
  // NEW BET TYPES
  putts: PuttsBetConfig;
  sideBets: SideBetsConfig;
  stableford: StablefordBetConfig;
  teamPressures: TeamPressuresBetConfig;
  zoologico: ZoologicoBetConfig; // NEW: Zoo bet
  skinsGrupal?: SkinsGrupalBetConfig; // NEW: Group skins
  // Sprint 3 new bets
  wolfSetup?: WolfSetupConfig;
  sixesBets?: SixesBetInstance[];
  sixesEnabled?: boolean;
  vegasBets?: VegasBetInstance[];
  vegasEnabled?: boolean;
  ninesBets?: NinesBetInstance[];
  parejasExcluded?: Record<string, string[]>; // betKey -> excluded player IDs
  roundHoles?: 9 | 18; // NEW: default 18. When 9, only the front segment is computed.
}

export interface MedalBetConfig {
  enabled: boolean;
  frontAmount: number;
  backAmount: number;
  totalAmount: number;
  participantIds?: string[];
  oneVsAll?: boolean;
  anchorPlayerId?: string;
}

export interface PressureBetConfig {
  enabled: boolean;
  frontAmount: number;
  backAmount: number;
  totalAmount: number; // Match 18 bet amount
  onlyMatch?: boolean; // When true, no secondary pressures open (only main bet per nine)
  continua?: boolean; // When true + onlyMatch: single 18-hole match (no 9-hole split), early-win detection
  participantIds?: string[];
  oneVsAll?: boolean;
  anchorPlayerId?: string;
}

// Match Play - Individual bilateral 18-hole continuous match (independent of Presiones)
export interface MatchPlayBetConfig {
  enabled: boolean;
  amount: number;       // Monto por match ganado
  participantIds?: string[];
  oneVsAll?: boolean;
  anchorPlayerId?: string;
}

// Bloques - Bilateral medal por bloques de N hoyos (2, 3 o 6)
export interface BloquesBetConfig {
  enabled: boolean;
  holesPerBlock: 2 | 3 | 6;
  amountPerBlock: number;
  carryOverOnTie: boolean;
  participantIds?: string[];
  oneVsAll?: boolean;
  anchorPlayerId?: string;
  /** Per-pair multiplier (1..5) applied to last block. Key = sorted "idA__idB". */
  lastBlockMultipliers?: Record<string, number>;
}

export interface SkinsBetConfig {
  enabled: boolean;
  frontValue: number;
  backValue: number;
  carryOver: boolean; // If skins carry from 9 to 10
  modality?: 'acumulados' | 'sinAcumular'; // acumulados = ties add to pot; sinAcumular = ties are void
  zapatoEnabled?: boolean; // Whether Zapato (x2 when one player wins all skins) is active. Defaults to true.
  participantIds?: string[];
  playerSkinVariants?: Record<string, 'acumulados' | 'sinAcumular'>; // Per-player skin variant override
  pairSkinVariantOverrides?: Record<string, 'acumulados' | 'sinAcumular'>; // Per-pair override (key = sorted "idA_idB")
  oneVsAll?: boolean;
  anchorPlayerId?: string;
}

export interface CarosBetConfig {
  enabled: boolean;
  amount: number; // Per hole 15-18
  startHole?: number; // Default 15
  endHole?: number; // Default 18
  participantIds?: string[];
  oneVsAll?: boolean;
  anchorPlayerId?: string;
}

export interface UnitsBetConfig {
  enabled: boolean;
  valuePerPoint: number;
  valuePerGenericUnit?: number;
  participantIds?: string[];
  oneVsAll?: boolean;
  anchorPlayerId?: string;
}

export interface ManchasBetConfig {
  enabled: boolean;
  valuePerPoint: number;
  valuePerGenericMancha?: number;
  participantIds?: string[];
  oneVsAll?: boolean;
  anchorPlayerId?: string;
}

export interface CumulativeBetConfig {
  enabled: boolean;
  valuePerOccurrence: number;
  tieBreakLoser?: string; // Manual override for who pays when tie on last hole
  participantIds?: string[]; // Player IDs that participate (empty/undefined = all)
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
  handicapConfig?: TeamHandicapConfig;
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
  zoologico: 'grupal', // NEW: Zoo bet
  skinsGrupal: 'grupal', // NEW: Group skins
  medalGeneral: 'grupal',
  puttsGeneral: 'grupal',
  girGeneral: 'grupal',
  stableford: 'grupal',
  rayas: 'individual', // Rayas is an aggregator of individual bets
  // Sprint 3
  wolf: 'parejas',
  sixes: 'parejas',
  vegas: 'parejas',
  nines: 'grupal',
};

// =====================================================
// WOLF BET (PAREJAS)
// =====================================================

export type WolfScoringMode = 'lowBall' | 'lowHighBall' | 'stroke';
export type WolfTiming = 'A' | 'B' | 'C';

export interface WolfConfig {
  roundId: string; amountPerHole: number; scoringMode: WolfScoringMode;
  useHandicap: boolean; timing: WolfTiming; carryover: boolean;
  playerOrder: string[];
  participantIds: string[];
  playerHandicaps?: { playerId: string; handicap: number }[];
}

export interface WolfHoleState {
  roundId: string; holeNumber: number; wolfPlayerId: string;
  partnerIds: string[]; wentSolo: boolean;
  result: 'won' | 'lost' | 'tied' | null;
  effectiveAmount: number | null; carryoverHoles: number;
}

export interface WolfHoleDetail {
  holeNumber: number; wolfPlayerId: string; wolfPlayerName: string;
  partnerIds: string[]; partnerNames: string[]; wentSolo: boolean;
  result: 'won' | 'lost' | 'tied' | null;
  effectiveAmount: number; carryoverHoles: number;
  scoresByPlayer: { playerId: string; playerName: string; gross: number; strokes: number; net: number; teamSide: 'wolf' | 'rival'; usedForScoring: boolean; }[];
  teamWolfScore: number | null; teamRivalScore: number | null;
  lowBallWinner: 'wolf' | 'rival' | 'tied' | null;
  highBallWinner: 'wolf' | 'rival' | 'tied' | null;
  pointsWolf: number; pointsRival: number;
}

export interface WolfSetupConfig {
  enabled: boolean; amountPerHole: number; scoringMode: WolfScoringMode;
  useHandicap: boolean; timing: WolfTiming; carryover: boolean;
  playerOrder?: string[]; // Custom rotation order (player IDs)
  hole18Redemption?: boolean; // Allow biggest loser to take wolf on H18, solo, ×3
  playerHandicaps?: { playerId: string; handicap: number }[];
  handicapConfig?: TeamHandicapConfig;
}

// =====================================================
// SIXES BET (PAREJAS)
// =====================================================

export type SixesScoringMode = 'lowBall' | 'lowHighBall' | 'stroke';
export type SixesCobro = 'per_hole' | 'per_set';

export interface SixesSetAssignment {
  setNumber: 1 | 2 | 3; team1: [string, string]; team2: [string, string];
}

export interface SixesConfig {
  roundId: string; scoringMode: SixesScoringMode; cobro: SixesCobro;
  amount: number; useHandicap: boolean; sets: SixesSetAssignment[];
  usePerSetAmounts?: boolean;
  set1Amount?: number;
  set2Amount?: number;
  set3Amount?: number;
  teamHandicaps?: Record<string, number>;
  handicapConfig?: TeamHandicapConfig;
}

export interface SixesHoleDetail {
  holeNumber: number;
  scoresByPlayer: { playerId: string; playerName: string; gross: number; strokes: number; net: number; teamSide: 'team1' | 'team2'; }[];
  team1Score: number | null; team2Score: number | null;
  lowBallWinner: 'team1' | 'team2' | 'tied' | null;
  highBallWinner: 'team1' | 'team2' | 'tied' | null;
  pointsTeam1: number; pointsTeam2: number;
  holeWinner: 'team1' | 'team2' | 'tied' | null;
}

export interface SixesSetResult {
  setNumber: 1 | 2 | 3; startHole: number; endHole: number;
  team1: [string, string]; team2: [string, string];
  holeDetails: SixesHoleDetail[];
  pointsTeam1: number; pointsTeam2: number;
  setWinner: 'team1' | 'team2' | 'tied' | null;
  amountTeam1: number; amountTeam2: number;
}

export interface SixesSetupConfig {
  enabled: boolean; scoringMode: SixesScoringMode;
  cobro: SixesCobro; amount: number; useHandicap: boolean;
  sets: SixesSetAssignment[];
}

// =====================================================
// LAS VEGAS BET (PAREJAS)
// =====================================================

export type VegasVariant = 'fixed' | 'rotating';

export interface VegasConfig {
  roundId: string; valuePerPoint: number; useHandicap: boolean;
  birdieMultiplier: boolean; variant: VegasVariant;
  playerAId: string; playerBId: string; playerCId: string; playerDId: string;
  useSegmentAmounts?: boolean;
  frontAmount?: number;
  backAmount?: number;
  set1Amount?: number;
  set2Amount?: number;
  set3Amount?: number;
  teamHandicaps?: Record<string, number>;
  handicapConfig?: TeamHandicapConfig;
}

export interface VegasHoleDetail {
  holeNumber: number; setNumber: 1 | 2 | 3 | null;
  team1: [string, string]; team2: [string, string];
  grossA: number; strokesA: number; netA: number;
  grossB: number; strokesB: number; netB: number;
  grossC: number; strokesC: number; netC: number;
  grossD: number; strokesD: number; netD: number;
  numberTeam1: number; numberTeam2: number;
  numberTeam1Effective: number; numberTeam2Effective: number;
  birdieTeam1: boolean; birdieTeam2: boolean;
  multiplierApplied: 'team1' | 'team2' | 'none';
  diff: number; amountThisHole: number;
  winner: 'team1' | 'team2' | 'tied';
}

export interface VegasSetResult {
  setNumber: 1 | 2 | 3 | null; startHole: number; endHole: number;
  team1: [string, string]; team2: [string, string];
  holeDetails: VegasHoleDetail[];
  totalDiff: number; totalAmount: number;
  winner: 'team1' | 'team2' | 'tied';
}

export interface VegasSetupConfig {
  enabled: boolean; valuePerPoint: number; useHandicap: boolean;
  birdieMultiplier: boolean; variant: VegasVariant;
  playerAId: string; playerBId: string; playerCId: string; playerDId: string;
}

// =====================================================
// NINES BET (GRUPAL)
// =====================================================

export interface NinesConfig {
  roundId: string; valuePerPoint: number; playerIds: string[];
  playerHandicaps?: Record<string, number>;
}

export interface NinesHoleDetail {
  holeNumber: number;
  playerScores: { playerId: string; playerName: string; gross: number; strokes: number; net: number; points: 1|2|3|4|5; position: 1|2|3; }[];
}

export interface NinesPlayerSummary {
  playerId: string; playerName: string;
  playerInitials: string; playerColor: string; totalPoints: number;
}

export interface NinesSetupConfig {
  enabled: boolean; valuePerPoint: number;
}

// =====================================================
// =====================================================

export interface SixesBetInstance {
  id: string;
  scoringMode: SixesScoringMode;
  cobro: SixesCobro;
  amount: number;
  usePerSetAmounts?: boolean;
  set1Amount?: number;
  set2Amount?: number;
  set3Amount?: number;
  useHandicap: boolean;
  sets: SixesSetAssignment[];
  teamHandicaps?: Record<string, number>;
  handicapConfig?: TeamHandicapConfig;
}

export interface VegasBetInstance {
  id: string;
  valuePerPoint: number;
  useSegmentAmounts?: boolean;
  frontAmount?: number;
  backAmount?: number;
  set1Amount?: number;
  set2Amount?: number;
  set3Amount?: number;
  useHandicap: boolean;
  birdieMultiplier: boolean;
  variant: VegasVariant;
  playerAId: string;
  playerBId: string;
  playerCId: string;
  playerDId: string;
  teamHandicaps?: Record<string, number>;
  handicapConfig?: TeamHandicapConfig;
}

export interface NinesBetInstance {
  id: string;
  valuePerPoint: number;
  playerIds: string[];
  playerHandicaps?: Record<string, number>;
}

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
