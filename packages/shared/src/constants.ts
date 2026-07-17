/**
 * Constantes globales de la simulación.
 * Cliente y servidor DEBEN usar los mismos valores para que la
 * predicción del cliente coincida con la autoridad del servidor.
 */

/** Ticks de simulación por segundo en el servidor. */
export const SERVER_TICK_RATE = 30;

/** Pasos de input/predicción por segundo en el cliente. */
export const INPUT_RATE = 60;

/** Delta fijo de cada comando de input (segundos). */
export const INPUT_DT = 1 / INPUT_RATE;

/** Retraso de interpolación para entidades remotas (ms). */
export const INTERPOLATION_DELAY_MS = 100;

/** Ventana máxima de compensación de lag en el servidor (ms). */
export const LAG_COMPENSATION_MAX_MS = 250;

/** Dimensiones del jugador (AABB). */
export const PLAYER_HALF_WIDTH = 0.4;
export const PLAYER_HALF_HEIGHT = 0.92;
export const PLAYER_EYE_HEIGHT = 0.72; // desde el centro del AABB
export const PLAYER_CROUCH_HALF_HEIGHT = 0.62;

/** Movimiento. */
export const MOVE_GROUND_SPEED = 6.2;
export const MOVE_SPRINT_MULTIPLIER = 1.45;
export const MOVE_CROUCH_MULTIPLIER = 0.5;
export const MOVE_GROUND_ACCEL = 60;
export const MOVE_AIR_ACCEL = 14;
export const MOVE_GROUND_FRICTION = 9;
export const MOVE_JUMP_VELOCITY = 7.4;
export const MOVE_ZERO_G_THRUST = 16;
export const MOVE_ZERO_G_DAMPING = 0.6; // fricción exponencial por segundo
export const MOVE_MAX_VELOCITY = 60;

/** Multiplicador de velocidad al apuntar (ADS). */
export const MOVE_ADS_MULTIPLIER = 0.6;
/** Fricción durante el slide (vs MOVE_GROUND_FRICTION normal). */
export const SLIDE_FRICTION = 1.6;
/** Velocidad mínima para entrar/mantener el slide. */
export const SLIDE_MIN_SPEED = 6.8;

/** Gravedad base del mundo (m/s^2, hacia -Y). */
export const GRAVITY_BASE = 22;

/** Granadas — proyectiles físicos afectados por la gravedad de zona. */
export const GRENADE_FUSE_S = 2.2;
export const GRENADE_RADIUS = 6;
export const GRENADE_MAX_DAMAGE = 110;
export const GRENADE_THROW_SPEED = 18;
export const GRENADE_THROW_UP = 3;
export const GRENADE_RESTITUTION = 0.45;
export const GRENADE_HALF_EXTENT = 0.12;
export const GRENADES_PER_LIFE = 2;
export const GRENADE_COOLDOWN_S = 0.8;
export const GRENADE_KNOCKBACK = 12;

/** Salud. */
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_MAX_SHIELD = 50;
export const SHIELD_REGEN_DELAY_S = 4;
export const SHIELD_REGEN_RATE = 25; // por segundo
export const RESPAWN_DELAY_S = 3;

/** Límites de sala. */
export const MAX_ROOM_PLAYERS = 64;
export const DEFAULT_ROOM_PLAYERS = 12;
export const ROOM_CODE_LENGTH = 6;

/** Versión de protocolo: rechaza clientes incompatibles. */
export const PROTOCOL_VERSION = 3;
