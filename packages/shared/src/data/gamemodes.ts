import type { GameModeId } from '../types.js';

/**
 * Definición declarativa de los modos de juego.
 * La lógica común (kills, tiempos, equipos) vive en el servidor y se
 * parametriza aquí; los modos con reglas propias (dominación, hardpoint...)
 * implementan hooks adicionales en el servidor (ver server/game/modes).
 */

export interface GameModeDef {
  id: GameModeId;
  name: string;
  description: string;
  teams: boolean;
  defaultScoreLimit: number;
  defaultTimeLimitS: number;
  /** Una vida por ronda (eliminación). */
  roundBased: boolean;
  respawns: boolean;
  /** El arma la dicta el modo (gun game). */
  forcedWeaponProgression: boolean;
  implemented: boolean;
}

export const GAME_MODES: Record<GameModeId, GameModeDef> = {
  ffa: {
    id: 'ffa',
    name: 'Todos contra todos',
    description: 'Sin aliados. Gana quien alcance primero el límite de bajas.',
    teams: false,
    defaultScoreLimit: 30,
    defaultTimeLimitS: 600,
    roundBased: false,
    respawns: true,
    forcedWeaponProgression: false,
    implemented: true,
  },
  tdm: {
    id: 'tdm',
    name: 'Duelo por equipos',
    description: 'Dos corporaciones. Victoria por bajas totales del equipo.',
    teams: true,
    defaultScoreLimit: 75,
    defaultTimeLimitS: 600,
    roundBased: false,
    respawns: true,
    forcedWeaponProgression: false,
    implemented: true,
  },
  gungame: {
    id: 'gungame',
    name: 'Gun Game',
    description: 'Cada baja cambia tu arma. Gana quien complete la rotación.',
    teams: false,
    defaultScoreLimit: 7,
    defaultTimeLimitS: 600,
    roundBased: false,
    respawns: true,
    forcedWeaponProgression: true,
    implemented: true,
  },
  domination: {
    id: 'domination',
    name: 'Dominación',
    description: 'Captura y retén las zonas A, B y C para puntuar.',
    teams: true,
    defaultScoreLimit: 200,
    defaultTimeLimitS: 600,
    roundBased: false,
    respawns: true,
    forcedWeaponProgression: false,
    implemented: false,
  },
  hardpoint: {
    id: 'hardpoint',
    name: 'Hardpoint',
    description: 'Una zona de control que rota por el mapa.',
    teams: true,
    defaultScoreLimit: 250,
    defaultTimeLimitS: 600,
    roundBased: false,
    respawns: true,
    forcedWeaponProgression: false,
    implemented: false,
  },
  elimination: {
    id: 'elimination',
    name: 'Eliminación',
    description: 'Una vida por ronda. Gana el equipo que sobreviva.',
    teams: true,
    defaultScoreLimit: 6,
    defaultTimeLimitS: 90,
    roundBased: true,
    respawns: false,
    forcedWeaponProgression: false,
    implemented: false,
  },
  custom: {
    id: 'custom',
    name: 'Personalizada',
    description: 'Reglas definidas por el creador de la sala.',
    teams: false,
    defaultScoreLimit: 30,
    defaultTimeLimitS: 600,
    roundBased: false,
    respawns: true,
    forcedWeaponProgression: false,
    implemented: true,
  },
};

export const getGameMode = (id: GameModeId): GameModeDef => GAME_MODES[id] ?? GAME_MODES.ffa;
