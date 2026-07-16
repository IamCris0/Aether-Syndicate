import {
  Buttons,
  distance,
  raycastBrushes,
  sub,
  vec3,
  type InputCommand,
  type MapDef,
} from '@aether/shared';
import type { PlayerEntity } from './PlayerEntity.js';

/**
 * IA mínima para rellenar partidas y hacer pruebas.
 * No es un objetivo del juego: deambula entre puntos del mapa y dispara
 * a enemigos con línea de visión, con puntería deliberadamente imperfecta.
 */
export class BotController {
  private target = vec3();
  private repathAt = 0;
  private seq = 0;

  constructor(private readonly bot: PlayerEntity) {}

  think(now: number, players: PlayerEntity[], map: MapDef): InputCommand {
    const bot = this.bot;
    const cmd: InputCommand = {
      seq: ++this.seq,
      moveX: 0,
      moveY: 0,
      yaw: bot.yaw,
      pitch: 0,
      buttons: 0,
      weaponSlot: -1,
    };
    if (!bot.alive) return cmd;

    // Buscar enemigo visible más cercano.
    let enemy: PlayerEntity | null = null;
    let bestDist = 60;
    for (const p of players) {
      if (p.id === bot.id || !p.alive) continue;
      if (bot.team !== 2 && p.team === bot.team) continue;
      const d = distance(p.move.pos, bot.move.pos);
      if (d >= bestDist) continue;
      const dir = sub(vec3(), p.move.pos, bot.move.pos);
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      dir.x /= len;
      dir.y /= len;
      dir.z /= len;
      const wallT = raycastBrushes(bot.move.pos, dir, map.brushes, d);
      if (wallT >= d - 0.5) {
        enemy = p;
        bestDist = d;
      }
    }

    if (enemy) {
      const dx = enemy.move.pos.x - bot.move.pos.x;
      const dy = enemy.move.pos.y - bot.move.pos.y;
      const dz = enemy.move.pos.z - bot.move.pos.z;
      const horiz = Math.hypot(dx, dz) || 1;
      // Puntería con error (bot "humano").
      const err = 0.06;
      cmd.yaw = Math.atan2(-dx, -dz) + (Math.random() * 2 - 1) * err;
      cmd.pitch = Math.atan2(dy, horiz) + (Math.random() * 2 - 1) * err;
      cmd.buttons |= Buttons.Fire;
      if (bestDist > 12) cmd.moveY = 1;
      else if (bestDist < 6) cmd.moveX = Math.sin(now / 400) > 0 ? 1 : -1; // strafe
    } else {
      // Deambular hacia un spawn aleatorio.
      if (now >= this.repathAt || distance(bot.move.pos, this.target) < 2) {
        const s = map.spawns[Math.floor(Math.random() * map.spawns.length)];
        this.target = vec3(s.pos.x, s.pos.y, s.pos.z);
        this.repathAt = now + 8000;
      }
      const dx = this.target.x - bot.move.pos.x;
      const dz = this.target.z - bot.move.pos.z;
      cmd.yaw = Math.atan2(-dx, -dz);
      cmd.moveY = 1;
      if (bot.move.onGround && Math.random() < 0.01) cmd.buttons |= Buttons.Jump;
    }

    return cmd;
  }
}
