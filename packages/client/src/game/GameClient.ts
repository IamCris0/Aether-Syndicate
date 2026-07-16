import * as THREE from 'three';
import {
  Buttons,
  INPUT_DT,
  PLAYER_EYE_HEIGHT,
  getGameMode,
  getMap,
  getWeapon,
  gravityKindAt,
  stepMovement,
  vec3,
  type GameModeId,
  type InputCommand,
  type MovementContext,
  type MoveState,
  type PlayerSnapshot,
  type Snapshot,
} from '@aether/shared';
import type { Connection } from '../net/Connection.js';
import type { Input } from '../core/Input.js';
import { World } from './World.js';
import { PlayerAvatars } from './PlayerAvatars.js';
import { WeaponView } from './WeaponView.js';
import { AudioManager } from '../audio/AudioManager.js';
import { Hud } from '../ui/hud.js';

/**
 * Orquestador de una partida en curso.
 *
 * Red (modelo estándar de FPS competitivo):
 *  - PREDICCIÓN: cada paso de input (60 Hz) se aplica localmente con la
 *    simulación compartida y se envía al servidor.
 *  - RECONCILIACIÓN: al llegar un snapshot, el estado local se resetea al
 *    del servidor y se re-aplican los inputs aún no confirmados (ackSeq).
 *  - INTERPOLACIÓN: los demás jugadores se dibujan ~100 ms en el pasado,
 *    interpolados entre snapshots.
 */
export class GameClient {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private avatars = new PlayerAvatars();
  private weaponView: WeaponView;
  private audio: AudioManager;
  private hud = new Hud();
  private moveCtx: MovementContext;
  private modeDef;

  // Estado de predicción local.
  private predicted: MoveState = { pos: vec3(), vel: vec3(), onGround: false, crouching: false };
  private seq = 0;
  private accumulator = 0;
  private lastTime = 0;
  private alive = true;
  private lastSnapshot: Snapshot | null = null;
  private me: PlayerSnapshot | null = null;

  private frames = 0;
  private fpsTime = 0;
  private running = false;
  private baseFov = 90;
  private baseSensitivity = 1;

  // Predicción local de disparo (efectos instantáneos; el daño sigue siendo del servidor).
  private predAmmo = 0;
  private predNextFireAt = 0;
  private predFireHeld = false;
  private predGrenadeHeld = false;
  private predGrenades = 0;
  private aiming = false;

  // Granadas y explosiones.
  private grenadeMeshes = new Map<number, THREE.Mesh>();
  private grenadeGeo = new THREE.SphereGeometry(0.14, 10, 10);
  private grenadeMat = new THREE.MeshStandardMaterial({
    color: 0x222a38, roughness: 0.4, metalness: 0.7, emissive: 0xff5533, emissiveIntensity: 0.9,
  });
  private explosions: Array<{ mesh: THREE.Mesh; light: THREE.PointLight; life: number }> = [];
  private shake = 0;

  private matchEnded = false;

  onLeave: (() => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly connection: Connection,
    private readonly input: Input,
    mapId: string,
    mode: GameModeId,
    settings: { fov: number; sensitivity: number; volume: number },
    audio?: AudioManager,
  ) {
    this.baseFov = settings.fov;
    this.baseSensitivity = settings.sensitivity;
    this.input.sensitivity = settings.sensitivity;
    this.audio = audio ?? new AudioManager();
    this.audio.setVolume(settings.volume);
    this.modeDef = getGameMode(mode);

    const map = getMap(mapId);
    this.moveCtx = { brushes: map.brushes, gravityZones: map.gravityZones, gravityScale: 1 };

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 1200);
    this.scene.add(this.camera);

    this.scene.background = new THREE.Color(map.skyColor);
    this.scene.fog = new THREE.FogExp2(map.fogColor, map.fogDensity);

    this.world = new World(map);
    this.weaponView = new WeaponView(this.camera);
    this.scene.add(this.world.group, this.avatars.group, this.weaponView.tracerGroup);

    window.addEventListener('resize', this.onResize);
    this.connection.onSnapshot = (snap) => this.onSnapshot(snap);
    this.input.onToggleScoreboard = (show) => {
      this.hud.toggleScoreboard(show);
      if (show && this.lastSnapshot) this.hud.updateScoreboard(this.lastSnapshot.players, this.connection.playerId);
    };
    // Puntero liberado (ESC) = menú de pausa, salvo en la pantalla de fin.
    this.input.onPointerLockChange = (locked) => {
      this.hud.setPause(!locked && this.running && !this.matchEnded);
    };
  }

  /** Aplicar ajustes en caliente desde el modal (sin reiniciar la partida). */
  applySettings(s: { fov: number; sensitivity: number }): void {
    this.baseFov = s.fov;
    this.baseSensitivity = s.sensitivity;
  }

  start(): void {
    this.running = true;
    this.hud.show();
    this.hud.setHint(true);
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    this.hud.hide();
    this.input.release();
    this.connection.onSnapshot = null;
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private loop = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // ---- Pasos fijos de input + predicción (60 Hz) ----
    this.accumulator += dt;
    while (this.accumulator >= INPUT_DT) {
      this.accumulator -= INPUT_DT;
      this.stepInput();
    }

    // ---- Interpolación de remotos y render ----
    this.avatars.interpolate(Date.now());
    this.updateExplosions(dt);
    this.updateCamera(dt);
    this.weaponView.update(dt, Math.hypot(this.predicted.vel.x, this.predicted.vel.z), this.predicted.onGround);
    this.renderer.render(this.scene, this.camera);

    // ---- FPS ----
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.hud.setFps(Math.round(this.frames / this.fpsTime));
      this.frames = 0;
      this.fpsTime = 0;
    }

    requestAnimationFrame(this.loop);
  };

  private stepInput(): void {
    if (!this.input.isLocked || !this.alive) return;
    const sampled = this.input.sample();

    // ADS: sensibilidad reducida y viewmodel centrado.
    this.aiming = (sampled.buttons & Buttons.Aim) !== 0;
    this.input.sensitivity = this.baseSensitivity * (this.aiming ? 0.55 : 1);
    this.weaponView.setAds(this.aiming);

    // Predicción de disparo ANTES de construir el comando: el retroceso
    // modifica yaw/pitch y así el servidor dispara hacia donde tú ya miras.
    this.predictFire(sampled.buttons);

    const cmd: InputCommand = {
      seq: ++this.seq,
      moveX: sampled.moveX,
      moveY: sampled.moveY,
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      buttons: sampled.buttons,
      weaponSlot: sampled.weaponSlot,
    };
    stepMovement(this.predicted, cmd, this.moveCtx);
    this.connection.sendInput(cmd);
  }

  /**
   * Efectos de disparo instantáneos (sonido, fogonazo, retroceso de cámara).
   * El servidor sigue siendo la única autoridad sobre impactos y munición;
   * esto solo elimina la latencia percibida del gatillo.
   */
  private predictFire(buttons: number): void {
    const now = performance.now();
    const weapon = getWeapon(this.lastSnapshot?.self?.weaponId ?? '');
    const reloading = this.lastSnapshot?.self?.reloading ?? false;

    const firePressed = (buttons & Buttons.Fire) !== 0;
    const canTrigger = weapon.automatic || !this.predFireHeld;
    if (firePressed && canTrigger && now >= this.predNextFireAt && !reloading &&
        (weapon.class === 'melee' || this.predAmmo > 0)) {
      this.predNextFireAt = now + 1000 / weapon.fireRate;
      if (weapon.class !== 'melee') this.predAmmo--;

      this.weaponView.onShotFired();
      this.audio.playShot(0, weapon.class === 'sniper' || weapon.class === 'shotgun');

      // Retroceso: patrón por arma aplicado a la puntería real (reducido en ADS).
      const adsK = this.aiming ? 0.55 : 1;
      this.input.pitch = Math.min(1.55, this.input.pitch + weapon.recoil.vertical * 2.2 * adsK);
      this.input.yaw += (Math.random() * 2 - 1) * weapon.recoil.horizontal * 1.6 * adsK;
    }
    this.predFireHeld = firePressed;

    // Granada: sonido de lanzamiento inmediato.
    const grenadePressed = (buttons & Buttons.Grenade) !== 0;
    if (grenadePressed && !this.predGrenadeHeld && this.predGrenades > 0) {
      this.predGrenades--;
      this.audio.playThrow();
    }
    this.predGrenadeHeld = grenadePressed;
  }

  private onSnapshot(snap: Snapshot): void {
    const selfId = this.connection.playerId;
    const prevMe = this.me;
    this.lastSnapshot = snap;
    this.me = snap.players.find((p) => p.id === selfId) ?? null;

    // ---- Reconciliación del jugador local ----
    if (this.me) {
      const wasAlive = this.alive;
      this.alive = this.me.alive;

      this.predicted.pos = vec3(this.me.pos.x, this.me.pos.y, this.me.pos.z);
      this.predicted.vel = vec3(this.me.vel.x, this.me.vel.y, this.me.vel.z);
      this.predicted.onGround = this.me.onGround;
      this.predicted.crouching = this.me.crouching;
      for (const cmd of this.connection.pendingInputs) {
        stepMovement(this.predicted, cmd, this.moveCtx);
      }

      // Al reaparecer, orientar la cámara según el spawn.
      if (!wasAlive && this.me.alive) {
        this.input.yaw = this.me.yaw;
        this.input.pitch = 0;
        this.hud.hideMatchEnd();
      }

      if (snap.self) {
        this.weaponView.setWeapon(snap.self.weaponId);
        this.hud.updateSelf(this.me, snap.self, getWeapon(snap.self.weaponId).name);
        // Resincronizar la predicción de disparo con la autoridad.
        this.predAmmo = snap.self.ammo;
        this.predGrenades = snap.self.grenades;
      }
      this.hud.updateMatch(snap, this.modeDef.teams, selfId);
      this.hud.setGravity(gravityKindAt(this.moveCtx.gravityZones, this.predicted.pos));

      // Detectar daño recibido comparando snapshots (además del evento).
      if (prevMe && this.me.health < prevMe.health) {
        this.hud.flashDamage();
        this.audio.playDamage();
      }
    }

    // ---- Fin/reinicio de partida ----
    if (this.matchEnded && !snap.scores.matchOver) {
      this.matchEnded = false;
      this.hud.hideMatchEnd();
      this.hud.toggleScoreboard(false);
    }

    // ---- Remotos ----
    this.avatars.update(snap.players, selfId, Date.now());

    // ---- Granadas en vuelo ----
    this.syncGrenades(snap);

    // ---- Eventos ----
    for (const ev of snap.events) {
      this.handleEvent(ev, snap, selfId);
    }
  }

  private syncGrenades(snap: Snapshot): void {
    const seen = new Set<number>();
    for (const g of snap.grenades) {
      seen.add(g.id);
      let mesh = this.grenadeMeshes.get(g.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
        this.grenadeMeshes.set(g.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(g.pos.x, g.pos.y, g.pos.z);
    }
    for (const [id, mesh] of this.grenadeMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.grenadeMeshes.delete(id);
      }
    }
  }

  private spawnExplosion(x: number, y: number, z: number, radius: number): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffa640, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.4);
    const light = new THREE.PointLight(0xffa640, 500, radius * 5, 1.6);
    light.position.set(x, y, z);
    this.scene.add(mesh, light);
    this.explosions.push({ mesh, light, life: 0.4 });

    // Sonido y sacudida de cámara según la distancia.
    const dist = Math.hypot(x - this.predicted.pos.x, y - this.predicted.pos.y, z - this.predicted.pos.z);
    this.audio.playExplosion(dist);
    this.shake = Math.max(this.shake, Math.min(0.6, 3 / Math.max(dist, 2)));
  }

  private updateExplosions(dt: number): void {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.life -= dt;
      const t = 1 - Math.max(e.life, 0) / 0.4;
      e.mesh.scale.setScalar(0.4 + t * 5.6);
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
      e.light.intensity = 500 * (1 - t);
      if (e.life <= 0) {
        this.scene.remove(e.mesh, e.light);
        e.mesh.geometry.dispose();
        (e.mesh.material as THREE.Material).dispose();
        this.explosions.splice(i, 1);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  private handleEvent(ev: Snapshot['events'][number], snap: Snapshot, selfId: string): void {
    switch (ev.type) {
      case 'shot': {
        const from = new THREE.Vector3(ev.origin.x, ev.origin.y, ev.origin.z);
        const to = new THREE.Vector3(ev.endPoint.x, ev.endPoint.y, ev.endPoint.z);
        if (ev.shooterId === selfId) {
          // El sonido y el retroceso ya se predijeron localmente: aquí solo
          // llega la CONFIRMACIÓN del servidor (impactos).
          if (ev.hit) {
            this.hud.flashHitmarker('normal');
            this.audio.playHit();
          }
        } else {
          const dist = this.me ? from.distanceTo(new THREE.Vector3(this.me.pos.x, this.me.pos.y, this.me.pos.z)) : 30;
          this.audio.playShot(dist);
        }
        this.weaponView.addTracer(from, to, ev.hit);
        break;
      }
      case 'damage': {
        if (ev.attackerId === selfId && ev.headshot) this.hud.flashHitmarker('head');
        break;
      }
      case 'explosion': {
        this.spawnExplosion(ev.pos.x, ev.pos.y, ev.pos.z, ev.radius);
        break;
      }
      case 'kill': {
        const killer = snap.players.find((p) => p.id === ev.killerId);
        const victim = snap.players.find((p) => p.id === ev.victimId);
        const involvesMe = ev.killerId === selfId || ev.victimId === selfId;
        this.hud.addKillfeed(
          killer?.name ?? '???',
          victim?.name ?? '???',
          getWeapon(ev.weaponId).name + (ev.headshot ? ' ☠' : ''),
          involvesMe,
        );
        if (ev.killerId === selfId && ev.victimId !== selfId) {
          this.hud.flashHitmarker('kill');
          this.audio.playKill();
        }
        break;
      }
      case 'matchEnd': {
        let text = 'Empate';
        if (ev.winnerTeam !== null) {
          text = ev.winnerTeam === (this.me?.team ?? -1) ? '¡VICTORIA DE TU EQUIPO!' : 'Derrota…';
        } else if (ev.winnerId) {
          const winner = snap.players.find((p) => p.id === ev.winnerId);
          text = ev.winnerId === selfId ? '¡VICTORIA!' : `Ganador: ${winner?.name ?? '???'}`;
        }
        this.matchEnded = true;
        this.input.release();
        this.hud.setPause(false);
        this.hud.showMatchEnd(text);
        this.hud.toggleScoreboard(true);
        this.hud.updateScoreboard(snap.players, selfId);
        break;
      }
      default:
        break;
    }
  }

  private updateCamera(dt: number): void {
    const eyeY = this.predicted.crouching ? PLAYER_EYE_HEIGHT * 0.6 : PLAYER_EYE_HEIGHT;
    this.camera.position.set(this.predicted.pos.x, this.predicted.pos.y + eyeY, this.predicted.pos.z);

    // Sacudida por explosiones cercanas.
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
    }

    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.input.yaw);
    this.camera.rotateX(this.input.pitch);

    // FOV: zoom al apuntar (francotirador con más aumento) + dinámico con velocidad.
    const weapon = getWeapon(this.lastSnapshot?.self?.weaponId ?? '');
    const adsZoom = weapon.class === 'sniper' ? 0.28 : 0.74;
    const speed = Math.hypot(this.predicted.vel.x, this.predicted.vel.z);
    const speedKick = this.aiming ? 0 : Math.min(speed * 0.55, 8);
    const targetFov = this.baseFov * (this.aiming ? adsZoom : 1) + speedKick;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(dt * 12, 1);
    this.camera.updateProjectionMatrix();
  }
}
