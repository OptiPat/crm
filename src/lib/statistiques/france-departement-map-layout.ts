import deptsRaw from "./france-depts-centroids.json";
import metroPathsRaw from "./france-metro-departments-paths.json";

type DeptCentroidRaw = {
  numero: string;
  lat: number;
  lng: number;
};

export type DeptMapPoint = {
  code: string;
  lat: number;
  lng: number;
  x: number;
  y: number;
};

export type FranceMetroDepartmentPath = {
  code: string;
  nom: string;
  d: string;
};

const METRO_BOUNDS = {
  minLat: 41.3,
  maxLat: 51.15,
  minLng: -5.2,
  maxLng: 9.65,
};

const DOM_BOUNDS = {
  minLat: -21.5,
  maxLat: 16.5,
  minLng: -61.8,
  maxLng: 55.9,
};

/** Départements d'outre-mer affichés dans l'encart DOM-TOM (aligné sur TERRITORY_TO_DEPT). */
export const FRANCE_DOM_DEPT_CODES = [
  "971",
  "972",
  "973",
  "974",
  "975",
  "976",
  "977",
  "978",
  "986",
  "987",
  "988",
] as const;

/** Positions fixes dans l'encart DOM — évite le chevauchement 971/972 (proche en projection geo). */
const DOM_ENCART_POSITIONS: Record<string, { x: number; y: number }> = {
  "971": { x: 22, y: 18 },
  "972": { x: 22, y: 48 },
  "973": { x: 22, y: 78 },
  "976": { x: 62, y: 18 },
  "975": { x: 62, y: 48 },
  "988": { x: 62, y: 78 },
  "987": { x: 102, y: 18 },
  "986": { x: 102, y: 48 },
  "978": { x: 158, y: 18 },
  "974": { x: 140, y: 102 },
  "977": { x: 102, y: 78 },
};

/** Rayon minimal de zone cliquable pour les bulles DOM (viewBox 200×115). */
export const DOM_BUBBLE_MIN_HIT_RADIUS = 14;

export const FRANCE_METRO_DEPARTMENT_PATHS: FranceMetroDepartmentPath[] =
  metroPathsRaw as FranceMetroDepartmentPath[];

const METRO_PATH_BY_CODE = new Map(
  FRANCE_METRO_DEPARTMENT_PATHS.map((feature) => [feature.code, feature])
);

function padDeptCode(numero: string): string {
  if (numero === "2A" || numero === "2B") return numero;
  if (numero.length >= 3) return numero;
  return numero.padStart(2, "0");
}

function projectMetro(lat: number, lng: number): { x: number; y: number } {
  const { minLat, maxLat, minLng, maxLng } = METRO_BOUNDS;
  const x = ((lng - minLng) / (maxLng - minLng)) * 520 + 20;
  const y = ((maxLat - lat) / (maxLat - minLat)) * 460 + 20;
  return { x, y };
}

function projectDom(lat: number, lng: number): { x: number; y: number } {
  const { minLat, maxLat, minLng, maxLng } = DOM_BOUNDS;
  const width = 150;
  const height = 88;
  const offsetX = 20;
  const offsetY = 12;
  const x = ((lng - minLng) / (maxLng - minLng)) * width + offsetX;
  const y = ((maxLat - lat) / (maxLat - minLat)) * height + offsetY;
  return { x, y };
}

const DEPT_MAP_POINTS: DeptMapPoint[] = (deptsRaw as DeptCentroidRaw[]).map((dept) => {
  const code = padDeptCode(dept.numero);
  const isDom = code.length === 3 && Number.parseInt(code, 10) >= 971;
  const projected = isDom ? projectDom(dept.lat, dept.lng) : projectMetro(dept.lat, dept.lng);
  return {
    code,
    lat: dept.lat,
    lng: dept.lng,
    x: projected.x,
    y: projected.y,
  };
});

const DEPT_POINT_BY_CODE = new Map(DEPT_MAP_POINTS.map((point) => [point.code, point]));

export function getDeptMapPoint(code: string): DeptMapPoint | undefined {
  return DEPT_POINT_BY_CODE.get(code);
}

/** Point d'affichage / interaction dans l'encart outre-mer (positions étalées). */
export function getDomEncartMapPoint(code: string): DeptMapPoint | undefined {
  const encart = DOM_ENCART_POSITIONS[code];
  if (!encart) return undefined;
  const base = DEPT_POINT_BY_CODE.get(code);
  if (base) {
    return { ...base, x: encart.x, y: encart.y };
  }
  return { code, lat: 0, lng: 0, x: encart.x, y: encart.y };
}

export function getMetroDepartmentPath(code: string): FranceMetroDepartmentPath | undefined {
  return METRO_PATH_BY_CODE.get(code);
}

export function isDomDeptCode(code: string): boolean {
  return (FRANCE_DOM_DEPT_CODES as readonly string[]).includes(code);
}

export function isMetroDeptCode(code: string): boolean {
  return Boolean(getMetroDepartmentPath(code));
}

/** Départements sans contact — bleu très pâle (inchangé). */
export const HEAT_MAP_EMPTY_COLOR = "#e8eef5";

/** Palette présence : vert → ambre → orange → rouge (intensité croissante). */
const PRESENCE_COLOR_STOPS: { t: number; r: number; g: number; b: number }[] = [
  { t: 0, r: 110, g: 231, b: 183 },
  { t: 0.35, r: 250, g: 204, b: 21 },
  { t: 0.65, r: 251, g: 146, b: 60 },
  { t: 1, r: 220, g: 38, b: 38 },
];

function interpolatePresenceColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  let upper = PRESENCE_COLOR_STOPS[PRESENCE_COLOR_STOPS.length - 1];
  let lower = PRESENCE_COLOR_STOPS[0];

  for (let i = 1; i < PRESENCE_COLOR_STOPS.length; i++) {
    if (clamped <= PRESENCE_COLOR_STOPS[i].t) {
      upper = PRESENCE_COLOR_STOPS[i];
      lower = PRESENCE_COLOR_STOPS[i - 1];
      break;
    }
  }

  const span = upper.t - lower.t || 1;
  const localT = (clamped - lower.t) / span;
  const r = Math.round(lower.r + (upper.r - lower.r) * localT);
  const g = Math.round(lower.g + (upper.g - lower.g) * localT);
  const b = Math.round(lower.b + (upper.b - lower.b) * localT);
  return `rgb(${r} ${g} ${b})`;
}

export function heatColorForCount(count: number, max: number): string {
  if (count <= 0) return HEAT_MAP_EMPTY_COLOR;
  const safeMax = Math.max(max, 1);
  return interpolatePresenceColor(count / safeMax);
}

/** Couleurs repères pour la légende (présence faible / moyenne / forte). */
export function heatLegendPresenceColors(max: number): {
  low: string;
  mid: string;
  high: string;
} {
  const safeMax = Math.max(max, 1);
  return {
    low: heatColorForCount(1, safeMax),
    mid: heatColorForCount(Math.max(1, Math.ceil(safeMax / 2)), safeMax),
    high: heatColorForCount(safeMax, safeMax),
  };
}

export function bubbleRadiusForCount(count: number, max: number): number {
  if (count <= 0) return 5;
  const t = Math.sqrt(count / Math.max(max, 1));
  return 6 + t * 12;
}
