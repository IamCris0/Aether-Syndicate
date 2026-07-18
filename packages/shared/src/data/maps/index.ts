import type { MapDef } from './types.js';
import { VANTA_STATION } from './vanta-station.js';
import { CRUCIBLE_FORGE } from './crucible-forge.js';

/**
 * Registro de mapas. Añadir un mapa nuevo = crear su módulo y registrarlo aquí.
 * (v0.4: Orbital One y Refinería Kessler fueron retirados y sustituidos por
 * Vanta Station y Crucible Forge, sus sucesores directos.)
 */
export const MAPS: Record<string, MapDef> = {
  [VANTA_STATION.id]: VANTA_STATION,
  [CRUCIBLE_FORGE.id]: CRUCIBLE_FORGE,
};

export const DEFAULT_MAP_ID = VANTA_STATION.id;

export const getMap = (id: string): MapDef => MAPS[id] ?? VANTA_STATION;

export * from './types.js';
export { VANTA_STATION, CRUCIBLE_FORGE };
