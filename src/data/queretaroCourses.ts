import { GolfCourse, HoleInfo } from '@/types/golf';

// Generate default hole info for 18 holes
const generateDefaultHoles = (pars: number[]): HoleInfo[] => {
  return pars.map((par, index) => ({
    number: index + 1,
    par,
    handicapIndex: index + 1, // Default handicap index
  }));
};

// Standard par configurations for courses
const standardPar72 = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const standardPar71 = [4, 4, 3, 5, 4, 4, 3, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

export const queretaroCourses: GolfCourse[] = [
  {
    id: 'campestre-queretaro',
    name: 'Club Campestre de Querétaro',
    location: 'Santiago de Querétaro',
    holes: generateDefaultHoles(standardPar72),
  },
  {
    id: 'el-campanario',
    name: 'Club Campestre El Campanario',
    location: 'Santiago de Querétaro',
    holes: generateDefaultHoles(standardPar72),
  },
  {
    id: 'golf-juriquilla',
    name: 'Golf Juriquilla (Provincia Juriquilla)',
    location: 'Juriquilla',
    holes: generateDefaultHoles(standardPar72),
  },
  {
    id: 'zibata-golf',
    name: 'Zibatá Golf',
    location: 'Zibatá',
    holes: generateDefaultHoles(standardPar72),
  },
  {
    id: 'balvanera',
    name: 'Balvanera Polo & Country Club',
    location: 'El Pueblito, Corregidora',
    holes: generateDefaultHoles(standardPar72),
  },
  {
    id: 'san-gil',
    name: 'Club de Golf San Gil',
    location: 'San Juan del Río',
    holes: generateDefaultHoles(standardPar72),
  },
  {
    id: 'tequisquiapan',
    name: 'Club de Golf Tequisquiapan',
    location: 'Tequisquiapan',
    holes: generateDefaultHoles(standardPar71),
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
