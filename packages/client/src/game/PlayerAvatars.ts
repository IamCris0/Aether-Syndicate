import * as THREE from 'three';
import { INTERPOLATION_DELAY_MS, gravityKindAt, type GravityZone, type PlayerSnapshot } from '@aether/shared';

/**
 * Renderiza y anima a los jugadores remotos.
 * Cada jugador se dibuja INTERPOLADO entre dos snapshots con un retraso fijo
 * (INTERPOLATION_DELAY_MS): movimiento suave a costa de ver el pasado reciente.
 */

interface Sample {
  time: number;
  x: number; y: number; z: number;
  yaw: number;
  crouching: boolean;
  alive: boolean;
}

interface Avatar {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  buffer: Sample[];
}

const TEAM_COLORS: Record<number, number> = { 0: 0x38e0c8, 1: 0xff4d5e, 2: 0xffa640 };

export class PlayerAvatars {
  readonly group = new THREE.Group();
  private avatars = new Map<string, Avatar>();
  /** Zonas de gravedad del mapa: los avatares en zona invertida se voltean. */
  gravityZones: GravityZone[] = [];

  update(players: PlayerSnapshot[], selfId: string, now: number): void {
    const seen = new Set<string>();

    for (const p of players) {
      if (p.id === selfId) continue;
      seen.add(p.id);
      let avatar = this.avatars.get(p.id);
      if (!avatar) {
        avatar = this.createAvatar(TEAM_COLORS[p.team] ?? 0xffa640);
        this.avatars.set(p.id, avatar);
        this.group.add(avatar.group);
      }
      avatar.buffer.push({
        time: now,
        x: p.pos.x, y: p.pos.y, z: p.pos.z,
        yaw: p.yaw,
        crouching: p.crouching,
        alive: p.alive,
      });
      // Conservar ~1 segundo de historia.
      while (avatar.buffer.length > 40) avatar.buffer.shift();
    }

    for (const [id, avatar] of this.avatars) {
      if (!seen.has(id)) {
        this.group.remove(avatar.group);
        this.avatars.delete(id);
      }
    }
  }

  /** Llamar cada frame de render. */
  interpolate(now: number): void {
    const renderTime = now - INTERPOLATION_DELAY_MS;
    for (const avatar of this.avatars.values()) {
      const buf = avatar.buffer;
      if (buf.length === 0) continue;

      let a = buf[0];
      let b = buf[buf.length - 1];
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i].time <= renderTime && buf[i + 1].time >= renderTime) {
          a = buf[i];
          b = buf[i + 1];
          break;
        }
      }
      const span = Math.max(b.time - a.time, 1);
      const t = Math.max(0, Math.min(1, (renderTime - a.time) / span));

      avatar.group.visible = b.alive;
      avatar.group.position.set(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t,
      );
      avatar.group.rotation.y = lerpAngle(a.yaw, b.yaw, t);
      const crouch = b.crouching ? 0.7 : 1;
      avatar.body.scale.y = crouch;
      avatar.head.position.y = b.crouching ? 0.55 : 0.95;

      // Gravedad invertida: el avatar camina boca abajo por el techo.
      const inverted = gravityKindAt(this.gravityZones, avatar.group.position) === 'inverted';
      const targetFlip = inverted ? Math.PI : 0;
      avatar.group.rotation.z += (targetFlip - avatar.group.rotation.z) * 0.12;
    }
  }

  positionOf(id: string): THREE.Vector3 | null {
    const avatar = this.avatars.get(id);
    return avatar && avatar.group.visible ? avatar.group.position.clone() : null;
  }

  private createAvatar(color: number): Avatar {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c3a52, roughness: 0.6, metalness: 0.5 });
    const accent = new THREE.MeshStandardMaterial({
      color, roughness: 0.4, metalness: 0.3, emissive: color, emissiveIntensity: 0.5,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.45), mat);
    body.position.y = 0.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.42), accent);
    head.position.y = 0.95;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.1), accent);
    visor.position.set(0, 0.98, -0.2);

    // Arma en las manos (silueta genérica apuntando hacia delante).
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.5, metalness: 0.8 });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.55), gunMat);
    gun.position.set(0.24, 0.42, -0.35);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), gunMat);
    barrel.position.set(0.24, 0.45, -0.7);

    group.add(body, head, visor, gun, barrel);
    return { group, body, head, buffer: [] };
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
