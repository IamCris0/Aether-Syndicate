import type { MapDef } from './types.js';
import { ORBITAL_ONE } from './orbital-one.js';

/**
 * Registro de mapas. Añadir un mapa nuevo = crear su módulo y registrarlo aquí.
 */
export const MAPS: Record<string, MapDef> = {
  [ORBITAL_ONE.id]: ORBITAL_ONE,
};

export const DEFAULT_MAP_ID = ORBITAL_ONE.id;

export const getMap = (id: string): MapDef => MAPS[id] ?? ORBITAL_ONE;

export * from './types.js';
export { ORBITAL_ONE };
