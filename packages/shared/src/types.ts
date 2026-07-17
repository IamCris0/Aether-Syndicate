import type { Vec3 } from './math/vec3.js';

/** Bits del bitmask de botones de un InputCommand. */
export const enum Buttons {
  Jump = 1 << 0,
  Sprint = 1 << 1,
  Crouch = 1 << 2,
  Fire = 1 << 3,
  Aim = 1 << 4,
  Reload = 1 << 5,
  Interact = 1 << 6,
  Melee = 1 << 7,
  Grenade = 1 << 8,
}

/**
 * Comando de input de un jugador para un paso fijo de simulación.
 * El cliente los genera a INPUT_RATE, los aplica localmente (predicción)
 * y los envía al servidor, que los aplica con autoridad.
 */
export interface InputCommand {
  /** Número de secuencia monótono por jugador. */
  seq: number;
  /** Movimiento lateral: -1 izquierda, +1 derecha. */
  moveX: number;
  /** Movimiento frontal: +1 adelante, -1 atrás. */
  moveY: number;
  yaw: number;
  pitch: number;
  buttons: number;
  /** Slot de arma solicitado (-1 = sin cambio). */
  weaponSlot: number;
}

/** Estado mínimo necesario para simular el movimiento de un jugador. */
export interface MoveState {
  pos: Vec3;
  vel: Vec3;
  onGround: boolean;
  crouching: boolean;
}

export type TeamId = 0 | 1 | 2; // 2 = sin equipo (FFA)

/** Estado replicado de un jugador dentro de un snapshot. */
export interface PlayerSnapshot {
  id: string;
  name: string;
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  crouching: boolean;
  onGround: boolean;
  alive: boolean;
  health: number;
  shield: number;
  team: TeamId;
  weaponId: string;
  kills: number;
  deaths: number;
  assists: number;
  ping: number;
  level: number;
}

/** Eventos discretos ocurridos entre snapshots (disparos, muertes...). */
export type GameEvent =
  | { type: 'shot'; shooterId: string; origin: Vec3; dir: Vec3; hit: boolean; endPoint: Vec3 }
  | { type: 'kill'; killerId: string; victimId: string; weaponId: string; headshot: boolean }
  | { type: 'damage'; targetId: string; attackerId: string; amount: number; headshot: boolean }
  | { type: 'explosion'; pos: Vec3; radius: number }
  | { type: 'gbounce'; pos: Vec3 }
  | { type: 'voteStart'; options: string[] }
  | { type: 'mapChange'; mapId: string }
  | { type: 'respawn'; playerId: string; pos: Vec3 }
  | { type: 'matchEnd'; winnerId: string | null; winnerTeam: TeamId | null };

/** Granada en vuelo, replicada para el render. */
export interface GrenadeSnapshot {
  id: number;
  pos: Vec3;
}

export interface Snapshot {
  tick: number;
  /** Último input procesado por el servidor para el cliente receptor. */
  ackSeq: number;
  serverTime: number;
  players: PlayerSnapshot[];
  grenades: GrenadeSnapshot[];
  events: GameEvent[];
  /** Estado privado del receptor (munición, recarga...). */
  self: SelfState | null;
  /** Marcador por equipos [team0, team1] o kills top en FFA. */
  scores: { team0: number; team1: number; timeRemaining: number; matchOver: boolean };
}

export interface SelfState {
  ammo: number;
  reserveAmmo: number;
  reloading: boolean;
  weaponId: string;
  grenades: number;
  respawnIn: number;
}

export type GameModeId =
  | 'ffa'
  | 'tdm'
  | 'domination'
  | 'hardpoint'
  | 'elimination'
  | 'gungame'
  | 'custom';

export interface RoomOptions {
  name: string;
  password?: string;
  maxPlayers: number;
  mode: GameModeId;
  mapId: string;
  timeLimitS: number;
  scoreLimit: number;
  bots: number;
  gravityScale: number;
}

export interface RoomInfo {
  code: string;
  name: string;
  mode: GameModeId;
  mapId: string;
  players: number;
  maxPlayers: number;
  hasPassword: boolean;
  inProgress: boolean;
}
