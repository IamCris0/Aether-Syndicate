import type { Server, Socket } from 'socket.io';
import {
  Buttons,
  GRENADE_COOLDOWN_S,
  INPUT_RATE,
  MAPS,
  PLAYER_MAX_SHIELD,
  RESPAWN_DELAY_S,
  SERVER_TICK_RATE,
  SHIELD_REGEN_DELAY_S,
  SHIELD_REGEN_RATE,
  WEAPONS,
  XP_HEADSHOT_BONUS,
  XP_MATCH_COMPLETE,
  XP_MATCH_WIN,
  XP_PER_ASSIST,
  XP_PER_KILL,
  distance,
  getMap,
  getOperator,
  getWeapon,
  gravityAt,
  stepMovement,
  type ClientToServer,
  type GameEvent,
  type InputCommand,
  type MapDef,
  type MovementContext,
  type PlayerSnapshot,
  type RoomInfo,
  type RoomOptions,
  type ServerToClient,
  type Snapshot,
  type TeamId,
} from '@aether/shared';
import { PlayerEntity } from '../game/PlayerEntity.js';
import { BotController } from '../game/BotController.js';
import { grantMatchResult } from '../services/supabaseAdmin.js';
import { fireHitscan, fireMelee, mulberry32 } from '../game/combat.js';
import { GrenadeSystem } from '../game/GrenadeSystem.js';
import { createModeLogic, type GameModeLogic, type MatchState } from '../game/modes.js';

type GameSocket = Socket<ClientToServer, ServerToClient>;

const MAX_INPUTS_PER_TICK = Math.ceil(INPUT_RATE / SERVER_TICK_RATE) * 3;
const ASSIST_WINDOW_MS = 6000;
const MATCH_RESTART_DELAY_MS = 10000;
const PING_INTERVAL_MS = 2000;

interface Seat {
  entity: PlayerEntity;
  socket: GameSocket | null;
  bot: BotController | null;
}

/**
 * Una partida en curso: simulación autoritativa a SERVER_TICK_RATE.
 * Los clientes envían InputCommands; el servidor los aplica con la MISMA
 * simulación compartida que usa el cliente para predecir, y difunde
 * snapshots con el ack del último input procesado por jugador.
 */
export class GameRoom {
  readonly code: string;
  readonly options: RoomOptions;
  /** Mapa actual (puede cambiar entre partidas por votación). */
  map: MapDef;

  private readonly io: Server<ClientToServer, ServerToClient>;
  private readonly mode: GameModeLogic;
  private readonly seats = new Map<string, Seat>();
  private readonly moveCtx: MovementContext;
  private readonly grenadeSystem: GrenadeSystem;
  private readonly rng = mulberry32(Date.now() & 0xffffffff);
  /** attacker → time por víctima, para asistencias. */
  private readonly damagers = new Map<string, Map<string, number>>();

  private tick = 0;
  private events: GameEvent[] = [];
  private match: MatchState = { scoreTeam0: 0, scoreTeam1: 0, over: false, winnerId: null, winnerTeam: null };
  private matchEndsAt = 0;
  private restartAt = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private botCounter = 0;
  /** Votación de mapa: opciones ofrecidas y voto por jugador. */
  private voteOptions: string[] = [];
  private mapVotes = new Map<string, string>();

  onEmpty: (() => void) | null = null;

  constructor(io: Server<ClientToServer, ServerToClient>, code: string, options: RoomOptions) {
    this.io = io;
    this.code = code;
    this.options = options;
    this.map = getMap(options.mapId);
    this.mode = createModeLogic(options.mode);
    this.moveCtx = {
      brushes: this.map.brushes,
      gravityZones: this.map.gravityZones,
      gravityScale: options.gravityScale,
    };
    this.grenadeSystem = new GrenadeSystem(this.moveCtx);
    this.matchEndsAt = Date.now() + options.timeLimitS * 1000;

    for (let i = 0; i < options.bots; i++) this.addBot();

    this.interval = setInterval(() => this.step(), 1000 / SERVER_TICK_RATE);
    this.pingInterval = setInterval(() => this.measurePings(), PING_INTERVAL_MS);
  }

  get humanCount(): number {
    let n = 0;
    for (const s of this.seats.values()) if (!s.entity.isBot) n++;
    return n;
  }

  get playerCount(): number {
    return this.seats.size;
  }

  info(): RoomInfo {
    return {
      code: this.code,
      name: this.options.name,
      mode: this.options.mode,
      mapId: this.options.mapId,
      players: this.playerCount,
      maxPlayers: this.options.maxPlayers,
      hasPassword: !!this.options.password,
      inProgress: !this.match.over,
    };
  }

  isJoinable(): boolean {
    return this.playerCount < this.options.maxPlayers;
  }

  addPlayer(socket: GameSocket, name: string, loadout?: string[], level?: number, operatorId?: string): PlayerEntity {
    const entity = new PlayerEntity(socket.id, name);
    entity.team = this.mode.def.teams ? this.mode.assignTeam(this.entities()) : 2;
    entity.level = Math.max(1, Math.min(100, Math.floor(level ?? 1) || 1));
    entity.operatorId = getOperator(operatorId).id; // valida contra el registro
    // El modo manda (Gun Game); si no, se aplica el loadout de la armería validado.
    const forced = this.mode.loadoutFor(entity);
    if (forced) entity.equipLoadout(forced);
    else if (loadout) entity.equipLoadout(sanitizeLoadout(loadout));
    this.seats.set(entity.id, { entity, socket, bot: null });
    socket.join(this.code);
    socket.to(this.code).emit('playerJoined', entity.id, name);
    this.respawn(entity);
    return entity;
  }

  addBot(): void {
    const id = `bot-${this.code}-${++this.botCounter}`;
    const entity = new PlayerEntity(id, `AS-Unidad ${this.botCounter}`, true);
    entity.team = this.mode.def.teams ? this.mode.assignTeam(this.entities()) : 2;
    const forced = this.mode.loadoutFor(entity);
    if (forced) entity.equipLoadout(forced);
    this.seats.set(id, { entity, socket: null, bot: new BotController(entity) });
    this.respawn(entity);
  }

  removePlayer(id: string): void {
    const seat = this.seats.get(id);
    if (!seat) return;
    this.grantProgress(seat.entity, false); // XP parcial al abandonar
    this.seats.delete(id);
    this.damagers.delete(id);
    if (seat.socket) {
      seat.socket.leave(this.code);
      this.io.to(this.code).emit('playerLeft', id, seat.entity.name);
    }
    if (this.humanCount === 0) this.destroy();
  }

  queueInputs(id: string, commands: InputCommand[]): void {
    const seat = this.seats.get(id);
    if (!seat) return;
    const e = seat.entity;
    for (const cmd of commands) {
      if (!Number.isFinite(cmd.yaw) || !Number.isFinite(cmd.pitch)) continue;
      if (cmd.seq <= e.lastProcessedSeq) continue; // duplicado (redundancia de red)
      if (e.pendingInputs.length > MAX_INPUTS_PER_TICK * 4) break; // anti-flood
      cmd.moveX = Math.max(-1, Math.min(1, cmd.moveX));
      cmd.moveY = Math.max(-1, Math.min(1, cmd.moveY));
      cmd.pitch = Math.max(-1.55, Math.min(1.55, cmd.pitch));
      e.pendingInputs.push(cmd);
    }
  }

  chat(fromId: string, text: string): void {
    const seat = this.seats.get(fromId);
    if (!seat) return;
    this.io.to(this.code).emit('chat', seat.entity.name, text.slice(0, 200));
  }

  destroy(): void {
    if (this.interval) clearInterval(this.interval);
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.interval = null;
    this.pingInterval = null;
    this.onEmpty?.();
  }

  // ------------------------------------------------------------------ tick

  private entities(): PlayerEntity[] {
    return [...this.seats.values()].map((s) => s.entity);
  }

  private step(): void {
    const now = Date.now();
    this.tick++;
    const all = this.entities();

    // 1. Bots generan su input del tick.
    for (const seat of this.seats.values()) {
      if (seat.bot) seat.entity.pendingInputs.push(seat.bot.think(now, all, this.map));
    }

    // 2. Aplicar inputs pendientes (movimiento compartido + acciones de combate).
    for (const seat of this.seats.values()) {
      const e = seat.entity;
      const inputs = e.pendingInputs.splice(0, MAX_INPUTS_PER_TICK);
      for (const cmd of inputs) {
        e.lastProcessedSeq = Math.max(e.lastProcessedSeq, cmd.seq);
        if (!e.alive || this.match.over) continue;
        e.yaw = cmd.yaw;
        e.pitch = cmd.pitch;
        stepMovement(e.move, cmd, this.moveCtx);
        this.handleCombat(e, cmd, all, now);
      }
      e.recordHistory(now);
    }

    // 3. Granadas en vuelo: física con gravedad de zona y explosiones.
    const grenadeResult = this.grenadeSystem.update(now, all);
    this.events.push(...grenadeResult.events);
    for (const hit of grenadeResult.hits) {
      const attacker = this.seats.get(hit.attackerId)?.entity ?? hit.target;
      this.applyDamage(attacker, hit.target, hit.damage, 'grenade-frag', false, now);
    }

    // 4. Muerte por vacío, regeneración de escudo y respawns.
    for (const e of all) {
      if (e.alive && e.move.pos.y < this.map.killY) this.kill(null, e, 'void', now);
      if (e.alive && e.shield < PLAYER_MAX_SHIELD && now - e.lastDamageAt > SHIELD_REGEN_DELAY_S * 1000) {
        e.shield = Math.min(PLAYER_MAX_SHIELD, e.shield + SHIELD_REGEN_RATE / SERVER_TICK_RATE);
      }
      if (!e.alive && this.mode.def.respawns && !this.match.over && now >= e.respawnAt) {
        this.respawn(e);
      }
    }

    // 5. Tiempo y reinicio de partida.
    if (!this.match.over && now >= this.matchEndsAt) {
      this.mode.onTimeUp(all, this.match);
      this.emitMatchEnd(now);
    }
    if (this.match.over && this.restartAt > 0 && now >= this.restartAt) this.restartMatch(now);

    // 6. Difundir snapshots.
    this.broadcast(now);
    this.events = [];
  }

  private handleCombat(e: PlayerEntity, cmd: InputCommand, all: PlayerEntity[], now: number): void {
    const weapon = getWeapon(e.weaponId);

    if (cmd.weaponSlot >= 0) e.switchSlot(cmd.weaponSlot);

    if ((cmd.buttons & Buttons.Reload) !== 0 && e.reloadingUntil === 0 && weapon.magazineSize > 0 &&
        e.ammo < weapon.magazineSize && e.reserveAmmo > 0) {
      e.reloadingUntil = now + weapon.reloadTimeS * 1000;
    }
    if (e.reloadingUntil > 0 && now >= e.reloadingUntil) {
      const need = weapon.magazineSize - e.ammo;
      const take = Math.min(need, e.reserveAmmo);
      e.ammo += take;
      e.reserveAmmo -= take;
      e.reloadingUntil = 0;
    }

    // Granada: lanzamiento por flanco de subida (una por pulsación).
    const grenadePressed = (cmd.buttons & Buttons.Grenade) !== 0;
    if (grenadePressed && !e.grenadeHeld && e.grenades > 0 && now >= e.nextGrenadeAt) {
      e.grenades--;
      e.nextGrenadeAt = now + GRENADE_COOLDOWN_S * 1000;
      this.grenadeSystem.throwFrom(e, now);
    }
    e.grenadeHeld = grenadePressed;

    const aiming = (cmd.buttons & Buttons.Aim) !== 0;
    const firePressed = (cmd.buttons & Buttons.Fire) !== 0;
    const canTrigger = weapon.automatic || !e.firingHeld;
    if (firePressed && canTrigger && now >= e.nextFireAt && e.reloadingUntil === 0) {
      // En gravedad invertida el ojo está bajo el centro del jugador.
      const eyeSign = gravityAt(this.moveCtx.gravityZones, e.move.pos, this.moveCtx.gravityScale) > 0 ? -1 : 1;
      if (weapon.class === 'melee') {
        this.resolveShot(e, fireMelee(e, all, weapon, eyeSign), weapon.id, now);
        e.nextFireAt = now + 1000 / weapon.fireRate;
      } else if (e.ammo > 0) {
        e.ammo--;
        this.resolveShot(e, fireHitscan(e, all, this.map.brushes, weapon, now, this.rng, aiming, eyeSign), weapon.id, now);
        e.nextFireAt = now + 1000 / weapon.fireRate;
        if (e.ammo === 0 && e.reserveAmmo > 0) e.reloadingUntil = now + weapon.reloadTimeS * 1000;
      }
    }
    e.firingHeld = firePressed;
  }

  private resolveShot(shooter: PlayerEntity, result: ReturnType<typeof fireHitscan>, weaponId: string, now: number): void {
    this.events.push(...result.events);
    for (const hit of result.hits) {
      this.applyDamage(shooter, hit.target, hit.damage, weaponId, hit.headshot, now);
    }
  }

  /** Camino único de daño: escudo → salud → kill/asistencias. */
  private applyDamage(attacker: PlayerEntity, victim: PlayerEntity, amount: number, weaponId: string, headshot: boolean, now: number): void {
    if (!victim.alive) return;
    if (this.mode.def.teams && victim.team === attacker.team && victim.id !== attacker.id) return; // sin fuego amigo v0

    let remaining = amount;
    if (victim.shield > 0) {
      const absorbed = Math.min(victim.shield, remaining);
      victim.shield -= absorbed;
      remaining -= absorbed;
    }
    victim.health -= remaining;
    victim.lastDamageAt = now;

    if (victim.id !== attacker.id) {
      let dmg = this.damagers.get(victim.id);
      if (!dmg) this.damagers.set(victim.id, (dmg = new Map()));
      dmg.set(attacker.id, now);
    }

    this.events.push({ type: 'damage', targetId: victim.id, attackerId: attacker.id, amount: Math.round(amount), headshot });
    if (victim.health <= 0) this.kill(attacker.id === victim.id ? null : attacker, victim, weaponId, now, headshot);
  }

  private kill(killer: PlayerEntity | null, victim: PlayerEntity, weaponId: string, now: number, headshot = false): void {
    victim.alive = false;
    victim.deaths++;
    victim.respawnAt = now + RESPAWN_DELAY_S * 1000;

    if (killer && killer.id !== victim.id) {
      killer.kills++;
      if (headshot) killer.headshots++;
      this.mode.onKill(killer, victim, this.match, this.options.scoreLimit);
    }

    // Asistencias: quien dañó a la víctima recientemente y no la remató.
    const dmg = this.damagers.get(victim.id);
    if (dmg) {
      for (const [attackerId, time] of dmg) {
        if (attackerId !== killer?.id && now - time < ASSIST_WINDOW_MS) {
          const seat = this.seats.get(attackerId);
          if (seat) seat.entity.assists++;
        }
      }
      dmg.clear();
    }

    this.events.push({ type: 'kill', killerId: killer?.id ?? victim.id, victimId: victim.id, weaponId, headshot });
    if (this.match.over) this.emitMatchEnd(now);
  }

  private emitMatchEnd(now: number): void {
    if (this.restartAt > 0) return;
    this.restartAt = now + MATCH_RESTART_DELAY_MS;
    this.events.push({ type: 'matchEnd', winnerId: this.match.winnerId, winnerTeam: this.match.winnerTeam });

    // Votación de mapa: el actual contra otro aleatorio del registro.
    const others = Object.keys(MAPS).filter((id) => id !== this.map.id);
    const rival = others[Math.floor(this.rng() * others.length)];
    this.voteOptions = rival ? [this.map.id, rival] : [this.map.id];
    this.mapVotes.clear();
    this.events.push({ type: 'voteStart', options: [...this.voteOptions] });
  }

  castVote(playerId: string, mapId: string): void {
    if (!this.seats.has(playerId) || !this.voteOptions.includes(mapId) || this.restartAt === 0) return;
    this.mapVotes.set(playerId, mapId);
  }

  /** XP AUTORITATIVA: el servidor calcula y escribe el progreso en la nube. */
  private grantProgress(e: PlayerEntity, finished: boolean): void {
    if (!e.cloudUserId || e.isBot) return;
    const won = finished && (
      this.match.winnerId === e.id ||
      (this.match.winnerTeam !== null && this.match.winnerTeam === e.team)
    );
    const xp =
      e.kills * XP_PER_KILL +
      e.headshots * XP_HEADSHOT_BONUS +
      e.assists * XP_PER_ASSIST +
      (finished ? (won ? XP_MATCH_WIN : XP_MATCH_COMPLETE) : 0);
    if (xp <= 0 && e.deaths === 0) return;
    void grantMatchResult(e.cloudUserId, {
      xp, kills: e.kills, deaths: e.deaths, assists: e.assists, won, finished,
    });
  }

  private restartMatch(now: number): void {
    // Progresión autoritativa de la partida que termina.
    for (const e of this.entities()) this.grantProgress(e, true);

    // Resolver la votación de mapa (empate ⇒ se queda el actual).
    if (this.voteOptions.length > 1) {
      const tally = new Map<string, number>();
      for (const vote of this.mapVotes.values()) tally.set(vote, (tally.get(vote) ?? 0) + 1);
      let winner = this.map.id;
      let best = tally.get(this.map.id) ?? 0;
      for (const [mapId, count] of tally) {
        if (count > best) {
          best = count;
          winner = mapId;
        }
      }
      if (winner !== this.map.id) {
        this.map = getMap(winner);
        this.options.mapId = winner;
        this.moveCtx.brushes = this.map.brushes;
        this.moveCtx.gravityZones = this.map.gravityZones;
        this.events.push({ type: 'mapChange', mapId: winner });
        console.log(`[rooms] ${this.code}: votación → cambio a ${winner}`);
      }
      this.voteOptions = [];
      this.mapVotes.clear();
    }

    this.match = { scoreTeam0: 0, scoreTeam1: 0, over: false, winnerId: null, winnerTeam: null };
    this.restartAt = 0;
    this.matchEndsAt = now + this.options.timeLimitS * 1000;
    for (const e of this.entities()) {
      e.kills = 0;
      e.deaths = 0;
      e.assists = 0;
      e.score = 0;
      e.gungameIndex = 0;
      const forced = this.mode.loadoutFor(e);
      if (forced) e.equipLoadout(forced);
      this.respawn(e);
    }
  }

  private respawn(e: PlayerEntity): void {
    const enemies = this.entities().filter((p) => p.alive && p.id !== e.id && (e.team === 2 || p.team !== e.team));
    const candidates = this.map.spawns.filter((s) => s.team === 2 || s.team === e.team);
    let best = candidates[0] ?? this.map.spawns[0];
    let bestScore = -1;
    for (const s of candidates) {
      let minDist = Infinity;
      for (const enemy of enemies) minDist = Math.min(minDist, distance(s.pos, enemy.move.pos));
      const score = enemies.length === 0 ? Math.random() : minDist;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    e.spawn(best.pos, best.yaw);
    this.events.push({ type: 'respawn', playerId: e.id, pos: { ...best.pos } });
  }

  private broadcast(now: number): void {
    const players: PlayerSnapshot[] = this.entities().map((e) => e.toSnapshot());
    const grenades = this.grenadeSystem.snapshot();
    const timeRemaining = Math.max(0, Math.ceil((this.matchEndsAt - now) / 1000));

    for (const seat of this.seats.values()) {
      if (!seat.socket) continue;
      const e = seat.entity;
      const snap: Snapshot = {
        tick: this.tick,
        ackSeq: e.lastProcessedSeq,
        serverTime: now,
        players,
        grenades,
        events: this.events,
        self: {
          ammo: e.ammo,
          reserveAmmo: e.reserveAmmo,
          reloading: e.reloadingUntil > 0,
          weaponId: e.weaponId,
          grenades: e.grenades,
          respawnIn: e.alive ? 0 : Math.max(0, (e.respawnAt - now) / 1000),
        },
        scores: {
          team0: this.match.scoreTeam0,
          team1: this.match.scoreTeam1,
          timeRemaining,
          matchOver: this.match.over,
        },
      };
      seat.socket.volatile.emit('snapshot', snap);
    }
  }

  private measurePings(): void {
    for (const seat of this.seats.values()) {
      if (!seat.socket) continue;
      const start = Date.now();
      seat.socket.timeout(5000).emit('sping', (err: unknown) => {
        if (!err) seat.entity.ping = Date.now() - start;
      });
    }
  }
}

/**
 * Valida el loadout del cliente: primaria de slot 0 existente en WEAPONS;
 * secundaria y cuerpo a cuerpo fijas en v0. Nunca se confía en el cliente.
 */
function sanitizeLoadout(requested: string[]): string[] {
  const primary = requested.find((id) => {
    const w = WEAPONS[id];
    return w && w.slot === 0;
  });
  return [primary ?? 'ar-vanguard', 'pistol-nomad', 'knife-fang'];
}

export type { TeamId };
