import {
  INTERPOLATION_DELAY_MS,
  LAG_COMPENSATION_MAX_MS,
  PLAYER_CROUCH_HALF_HEIGHT,
  PLAYER_EYE_HEIGHT,
  PLAYER_HALF_HEIGHT,
  PLAYER_HALF_WIDTH,
  addScaled,
  clone,
  getWeapon,
  raycastBrushes,
  rayVsAABB,
  vec3,
  viewDirection,
  type Brush,
  type GameEvent,
  type Vec3,
  type WeaponDef,
} from '@aether/shared';
import type { PlayerEntity } from './PlayerEntity.js';

/**
 * Resolución de disparos con autoridad del servidor y compensación de lag:
 * los objetivos se "rebobinan" a la posición que el tirador veía en su
 * pantalla (retraso de interpolación + medio RTT) antes de trazar el rayo.
 */

export interface ShotResult {
  events: GameEvent[];
  /** Daño aplicado por víctima (para kills/asistencias en GameRoom). */
  hits: Array<{ target: PlayerEntity; damage: number; headshot: boolean }>;
}

/** PRNG mulberry32 — dispersión reproducible para depurar desyncs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fireHitscan(
  shooter: PlayerEntity,
  targets: PlayerEntity[],
  brushes: Brush[],
  weapon: WeaponDef,
  now: number,
  rng: () => number,
  aiming = false,
  eyeSign = 1,
): ShotResult {
  const events: GameEvent[] = [];
  const hits: ShotResult['hits'] = [];

  const rewindMs = Math.min(INTERPOLATION_DELAY_MS + shooter.ping / 2, LAG_COMPENSATION_MAX_MS);
  const rewindTime = now - rewindMs;

  const eye = clone(shooter.move.pos);
  eye.y += (shooter.move.crouching ? PLAYER_EYE_HEIGHT * 0.6 : PLAYER_EYE_HEIGHT) * eyeSign;

  const spread = aiming ? weapon.spreadAds : weapon.spread;
  for (let p = 0; p < weapon.pellets; p++) {
    const dir = vec3();
    viewDirection(dir, shooter.yaw, shooter.pitch);
    // Dispersión cónica simétrica (reducida al apuntar).
    if (spread > 0) {
      dir.x += (rng() * 2 - 1) * spread;
      dir.y += (rng() * 2 - 1) * spread;
      dir.z += (rng() * 2 - 1) * spread;
      const len = Math.hypot(dir.x, dir.y, dir.z);
      dir.x /= len;
      dir.y /= len;
      dir.z /= len;
    }

    const wallT = raycastBrushes(eye, dir, brushes, weapon.maxRange);

    let bestT = wallT;
    let bestTarget: PlayerEntity | null = null;
    let bestHeadshot = false;

    for (const target of targets) {
      if (target.id === shooter.id || !target.alive) continue;
      const past = target.positionAt(rewindTime);
      if (!past || !past.alive) continue;

      const halfY = past.crouching ? PLAYER_CROUCH_HALF_HEIGHT : PLAYER_HALF_HEIGHT;
      const min = vec3(past.pos.x - PLAYER_HALF_WIDTH, past.pos.y - halfY, past.pos.z - PLAYER_HALF_WIDTH);
      const max = vec3(past.pos.x + PLAYER_HALF_WIDTH, past.pos.y + halfY, past.pos.z + PLAYER_HALF_WIDTH);
      const t = rayVsAABB(eye, dir, min, max, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        bestTarget = target;
        // Cabeza: cuarto superior del AABB.
        const hitY = eye.y + dir.y * t;
        bestHeadshot = hitY > past.pos.y + halfY * 0.5;
      }
    }

    const endPoint = addScaled(vec3(), eye, dir, bestT);
    events.push({ type: 'shot', shooterId: shooter.id, origin: clone(eye), dir: clone(dir), hit: bestTarget !== null, endPoint });

    if (bestTarget) {
      const damage = computeDamage(weapon, bestT, bestHeadshot);
      hits.push({ target: bestTarget, damage, headshot: bestHeadshot });
    }
  }

  return { events, hits };
}

/** Daño con caída lineal entre `range` y `maxRange`. */
export function computeDamage(weapon: WeaponDef, distance: number, headshot: boolean): number {
  let dmg = weapon.damage;
  if (distance > weapon.range) {
    const t = Math.min((distance - weapon.range) / Math.max(weapon.maxRange - weapon.range, 1), 1);
    dmg *= 1 - t * (1 - weapon.falloff);
  }
  if (headshot) dmg *= weapon.headshotMultiplier;
  return dmg;
}

/** Ataque cuerpo a cuerpo: cono corto delante del jugador, sin rewind. */
export function fireMelee(
  shooter: PlayerEntity,
  targets: PlayerEntity[],
  weapon: WeaponDef,
  eyeSign = 1,
): ShotResult {
  const events: GameEvent[] = [];
  const hits: ShotResult['hits'] = [];
  const dir = viewDirection(vec3(), shooter.yaw, shooter.pitch);
  const eye = clone(shooter.move.pos);
  eye.y += PLAYER_EYE_HEIGHT * eyeSign;

  for (const target of targets) {
    if (target.id === shooter.id || !target.alive) continue;
    const to = vec3(target.move.pos.x - eye.x, target.move.pos.y - eye.y, target.move.pos.z - eye.z);
    const dist = Math.hypot(to.x, to.y, to.z);
    if (dist > weapon.range) continue;
    const dot = (to.x * dir.x + to.y * dir.y + to.z * dir.z) / Math.max(dist, 1e-6);
    if (dot < 0.5) continue; // fuera del cono de ~60º
    hits.push({ target, damage: weapon.damage, headshot: false });
    break; // solo un objetivo por tajo
  }

  const endPoint = addScaled(vec3(), eye, dir, weapon.range);
  events.push({ type: 'shot', shooterId: shooter.id, origin: eye, dir, hit: hits.length > 0, endPoint });
  return { events, hits };
}

export const weaponOf = (p: PlayerEntity) => getWeapon(p.weaponId);

export type { Vec3 };
