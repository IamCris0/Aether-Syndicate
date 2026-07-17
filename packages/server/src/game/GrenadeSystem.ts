import {
  GRENADE_FUSE_S,
  GRENADE_HALF_EXTENT,
  GRENADE_KNOCKBACK,
  GRENADE_MAX_DAMAGE,
  GRENADE_RADIUS,
  GRENADE_RESTITUTION,
  GRENADE_THROW_SPEED,
  GRENADE_THROW_UP,
  PLAYER_EYE_HEIGHT,
  SERVER_TICK_RATE,
  clone,
  gravityAt,
  moveAABB,
  raycastBrushes,
  vec3,
  viewDirection,
  type GameEvent,
  type GrenadeSnapshot,
  type MovementContext,
  type Vec3,
} from '@aether/shared';
import type { PlayerEntity } from './PlayerEntity.js';

interface Grenade {
  id: number;
  ownerId: string;
  pos: Vec3;
  vel: Vec3;
  explodeAt: number;
}

export interface ExplosionHit {
  attackerId: string;
  target: PlayerEntity;
  damage: number;
}

const HALF = vec3(GRENADE_HALF_EXTENT, GRENADE_HALF_EXTENT, GRENADE_HALF_EXTENT);
const DT = 1 / SERVER_TICK_RATE;

/**
 * Granadas de fragmentación: proyectiles físicos AUTORITATIVOS del servidor.
 * La integración usa `gravityAt`, así que la granada hereda la gravedad de la
 * zona que atraviesa: flota en el pozo zero-g, cae lenta en la pasarela de
 * gravedad baja y rebota con la geometría del mapa (el diferenciador en acción).
 */
export class GrenadeSystem {
  private grenades: Grenade[] = [];
  private nextId = 1;

  constructor(private readonly ctx: MovementContext) {}

  throwFrom(player: PlayerEntity, now: number): void {
    const dir = viewDirection(vec3(), player.yaw, player.pitch);
    const pos = clone(player.move.pos);
    pos.y += PLAYER_EYE_HEIGHT * 0.8;

    const vel = vec3(
      dir.x * GRENADE_THROW_SPEED + player.move.vel.x * 0.5,
      dir.y * GRENADE_THROW_SPEED + player.move.vel.y * 0.5 + GRENADE_THROW_UP,
      dir.z * GRENADE_THROW_SPEED + player.move.vel.z * 0.5,
    );

    this.grenades.push({ id: this.nextId++, ownerId: player.id, pos, vel, explodeAt: now + GRENADE_FUSE_S * 1000 });
  }

  /** Integra la física un tick y devuelve las explosiones producidas. */
  update(now: number, players: PlayerEntity[]): { events: GameEvent[]; hits: ExplosionHit[] } {
    const events: GameEvent[] = [];
    const hits: ExplosionHit[] = [];

    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];

      // Física: gravedad de la zona actual + rebote contra los brushes.
      g.vel.y += gravityAt(this.ctx.gravityZones, g.pos, this.ctx.gravityScale) * DT;
      const delta = vec3(g.vel.x * DT, g.vel.y * DT, g.vel.z * DT);
      const res = moveAABB(g.pos, HALF, delta, this.ctx.brushes);
      if (res.hitY) {
        // Rebote audible solo si llega con velocidad apreciable.
        if (Math.abs(g.vel.y) > 3) events.push({ type: 'gbounce', pos: clone(g.pos) });
        g.vel.y = -g.vel.y * GRENADE_RESTITUTION;
        g.vel.x *= 0.8;
        g.vel.z *= 0.8;
      }
      if (res.hitX) g.vel.x = -g.vel.x * GRENADE_RESTITUTION;
      if (res.hitZ) g.vel.z = -g.vel.z * GRENADE_RESTITUTION;

      if (now >= g.explodeAt) {
        this.explode(g, players, events, hits);
        this.grenades.splice(i, 1);
      } else if (g.pos.y < -100) {
        this.grenades.splice(i, 1); // cayó al vacío
      }
    }

    return { events, hits };
  }

  private explode(g: Grenade, players: PlayerEntity[], events: GameEvent[], hits: ExplosionHit[]): void {
    events.push({ type: 'explosion', pos: clone(g.pos), radius: GRENADE_RADIUS });

    for (const p of players) {
      if (!p.alive) continue;
      const dx = p.move.pos.x - g.pos.x;
      const dy = p.move.pos.y - g.pos.y;
      const dz = p.move.pos.z - g.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > GRENADE_RADIUS) continue;

      // Línea de visión: las paredes bloquean la explosión.
      if (dist > 0.5) {
        const dir = vec3(dx / dist, dy / dist, dz / dist);
        const wallT = raycastBrushes(g.pos, dir, this.ctx.brushes, dist);
        if (wallT < dist - 0.4) continue;
      }

      const falloff = 1 - dist / GRENADE_RADIUS;
      hits.push({ attackerId: g.ownerId, target: p, damage: GRENADE_MAX_DAMAGE * falloff });

      // Empuje: en gravedad cero el knockback es una herramienta de movilidad.
      const push = (GRENADE_KNOCKBACK * falloff) / Math.max(dist, 1);
      p.move.vel.x += dx * push;
      p.move.vel.y += dy * push + 2 * falloff;
      p.move.vel.z += dz * push;
    }
  }

  snapshot(): GrenadeSnapshot[] {
    return this.grenades.map((g) => ({ id: g.id, pos: clone(g.pos) }));
  }
}
