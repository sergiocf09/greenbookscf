import { GolfCourse, HoleInfo } from '@/types/golf';

// Generate default hole info for 18 holes
const generateDefaultHoles = (pars: number[], strokeIndices?: number[]): HoleInfo[] => {
  return pars.map((par, index) => ({
    number: index + 1,
    par,
    handicapIndex: strokeIndices?.[index] || index + 1, // Default handicap index
  }));
};

// Standard par configurations for courses
const standardPar72 = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const standardPar71 = [4, 4, 3, 5, 4, 4, 3, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

// Standard stroke index (handicap index) for par 72 courses
const standardStrokeIndex = [7, 11, 15, 1, 9, 5, 17, 3, 13, 8, 12, 16, 2, 10, 6, 18, 4, 14];

export const queretaroCourses: GolfCourse[] = [
  // Querétaro courses
  {
    id: 'campestre-queretaro',
    name: 'Club Campestre de Querétaro',
    location: 'Santiago de Querétaro',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'el-campanario',
    name: 'Club Campestre El Campanario',
    location: 'Santiago de Querétaro',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'golf-juriquilla',
    name: 'Golf Juriquilla (Provincia Juriquilla)',
    location: 'Juriquilla',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'zibata-golf',
    name: 'Zibatá Golf',
    location: 'Zibatá',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'balvanera',
    name: 'Balvanera Polo & Country Club',
    location: 'El Pueblito, Corregidora',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'san-gil',
    name: 'Club de Golf San Gil',
    location: 'San Juan del Río',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'tequisquiapan',
    name: 'Club de Golf Tequisquiapan',
    location: 'Tequisquiapan',
    holes: generateDefaultHoles(standardPar71, standardStrokeIndex),
  },
  // New courses requested
  {
    id: 'vallescondido',
    name: 'Club de Golf Vallescondido',
    location: 'Ciudad de México',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'el-jaguar-merida',
    name: 'El Jaguar Golf & Country Club',
    location: 'Mérida, Yucatán',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'madeiras',
    name: 'Madeiras Country Club',
    location: 'Estado de México',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'san-lucas-country-club',
    name: 'San Lucas Country Club',
    location: 'Estado de México',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'querencia',
    name: 'Querencia Golf Club',
    location: 'Los Cabos, BCS',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'cabo-real',
    name: 'Cabo Real Golf Club',
    location: 'Los Cabos, BCS',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
  {
    id: 'campestre-san-jose',
    name: 'Club Campestre San José',
    location: 'San José del Cabo, BCS',
    holes: generateDefaultHoles(standardPar72, standardStrokeIndex),
  },
];

export const getCourseById = (id: string): GolfCourse | undefined => {
  return queretaroCourses.find(course => course.id === id);
};

export const getTotalPar = (course: GolfCourse): number => {
  return course.holes.reduce((sum, hole) => sum + hole.par, 0);
};

export const getFrontNinePar = (course: GolfCourse): number => {
  return course.holes.slice(0, 9).reduce((sum, hole) => sum + hole.par, 0);
};

export const getBackNinePar = (course: GolfCourse): number => {
  return course.holes.slice(9, 18).reduce((sum, hole) => sum + hole.par, 0);
};