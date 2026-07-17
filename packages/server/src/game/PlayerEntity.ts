import {
  DEFAULT_LOADOUT,
  GRENADES_PER_LIFE,
  PLAYER_MAX_HEALTH,
  PLAYER_MAX_SHIELD,
  clone,
  getWeapon,
  vec3,
  type InputCommand,
  type MoveState,
  type PlayerSnapshot,
  type TeamId,
  type Vec3,
} from '@aether/shared';

/** Muestra histórica de posición para compensación de lag. */
interface PositionSample {
  time: number;
  pos: Vec3;
  crouching: boolean;
  alive: boolean;
}

const HISTORY_MAX_SAMPLES = 32;

/**
 * Estado autoritativo de un jugador (o bot) dentro de una sala.
 * No conoce sockets ni Three.js: es puro estado + helpers.
 */
export class PlayerEntity {
  readonly id: string;
  readonly name: string;
  readonly isBot: boolean;
  team: TeamId = 2;

  move: MoveState = { pos: vec3(), vel: vec3(), onGround: false, crouching: false };
  yaw = 0;
  pitch = 0;

  alive = false;
  health = PLAYER_MAX_HEALTH;
  shield = PLAYER_MAX_SHIELD;
  lastDamageAt = 0;
  respawnAt = 0;

  /** Loadout por slots; el índice activo cambia con weaponSlot. */
  loadout: string[] = [...DEFAULT_LOADOUT];
  weaponIndex = 0;
  ammo = 0;
  reserveAmmo = 0;
  reloadingUntil = 0;
  nextFireAt = 0;
  firingHeld = false;
  gungameIndex = 0;
  grenades = GRENADES_PER_LIFE;
  grenadeHeld = false;
  nextGrenadeAt = 0;

  kills = 0;
  deaths = 0;
  assists = 0;
  score = 0;
  ping = 0;
  level = 1;
  operatorId = 'op-cipher';

  /** Inputs pendientes de aplicar y último aplicado (para el ack). */
  pendingInputs: InputCommand[] = [];
  lastProcessedSeq = 0;

  private history: PositionSample[] = [];

  constructor(id: string, name: string, isBot = false) {
    this.id = id;
    this.name = name;
    this.isBot = isBot;
  }

  get weaponId(): string {
    return this.loadout[this.weaponIndex] ?? this.loadout[0];
  }

  equipLoadout(loadout: string[]): void {
    this.loadout = [...loadout];
    this.weaponIndex = 0;
    this.refillWeapon();
  }

  refillWeapon(): void {
    const def = getWeapon(this.weaponId);
    this.ammo = def.magazineSize;
    this.reserveAmmo = def.reserveAmmo;
    this.reloadingUntil = 0;
  }

  switchSlot(slot: number): void {
    if (slot < 0 || slot >= this.loadout.length || slot === this.weaponIndex) return;
    this.weaponIndex = slot;
    this.refillWeapon(); // simplificación v0: munición por arma, no persistida al cambiar
  }

  spawn(pos: Vec3, yaw: number): void {
    this.move.pos = clone(pos);
    this.move.vel = vec3();
    this.move.onGround = false;
    this.move.crouching = false;
    this.yaw = yaw;
    this.pitch = 0;
    this.alive = true;
    this.health = PLAYER_MAX_HEALTH;
    this.shield = PLAYER_MAX_SHIELD;
    this.grenades = GRENADES_PER_LIFE;
    this.refillWeapon();
    this.pendingInputs.length = 0;
    this.history.length = 0;
  }

  recordHistory(time: number): void {
    this.history.push({ time, pos: clone(this.move.pos), crouching: this.move.crouching, alive: this.alive });
    if (this.history.length > HISTORY_MAX_SAMPLES) this.history.shift();
  }

  /** Posición interpolada en un instante pasado (compensación de lag). */
  positionAt(time: number): PositionSample | null {
    if (this.history.length === 0) return null;
    if (time <= this.history[0].time) return this.history[0];
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].time <= time) return this.history[i];
    }
    return this.history[this.history.length - 1];
  }

  toSnapshot(): PlayerSnapshot {
    return {
      id: this.id,
      name: this.name,
      pos: clone(this.move.pos),
      vel: clone(this.move.vel),
      yaw: this.yaw,
      pitch: this.pitch,
      crouching: this.move.crouching,
      onGround: this.move.onGround,
      alive: this.alive,
      health: Math.ceil(this.health),
      shield: Math.ceil(this.shield),
      team: this.team,
      weaponId: this.weaponId,
      operatorId: this.operatorId,
      kills: this.kills,
      deaths: this.deaths,
      assists: this.assists,
      ping: Math.round(this.ping),
      level: this.level,
    };
  }
}
