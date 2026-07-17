import type { MapDef } from './types.js';
import { ORBITAL_ONE } from './orbital-one.js';
import { KESSLER_REFINERY } from './kessler-refinery.js';

/**
 * Registro de mapas. Añadir un mapa nuevo = crear su módulo y registrarlo aquí.
 */
export const MAPS: Record<string, MapDef> = {
  [ORBITAL_ONE.id]: ORBITAL_ONE,
  [KESSLER_REFINERY.id]: KESSLER_REFINERY,
};

export const DEFAULT_MAP_ID = ORBITAL_ONE.id;

export const getMap = (id: string): MapDef => MAPS[id] ?? ORBITAL_ONE;

export * from './types.js';
export { ORBITAL_ONE, KESSLER_REFINERY };
