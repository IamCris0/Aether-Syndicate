import * as THREE from 'three';
import {
  Buttons,
  INPUT_DT,
  PLAYER_EYE_HEIGHT,
  XP_HEADSHOT_BONUS,
  XP_MATCH_COMPLETE,
  XP_MATCH_WIN,
  XP_PER_ASSIST,
  XP_PER_KILL,
  getGameMode,
  getMap,
  getWeapon,
  gravityKindAt,
  raycastBrushes,
  stepMovement,
  vec3,
  viewDirection,
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
import { Sparks } from './Sparks.js';
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
const pixelRatioFor = (quality: 'low' | 'medium' | 'high'): number =>
  quality === 'low' ? 0.75 : quality === 'medium' ? 1 : Math.min(window.devicePixelRatio, 2);

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

  // Recoil por patrón (estilo CoD): sube con la ráfaga y recupera al soltar.
  private recoilShotIndex = 0;
  private recoilAccum = 0;
  private lastShotAt = 0;

  // Cámara: roll al strafear, dip al aterrizar.
  private viewRoll = 0;
  private landDip = 0;
  private airMinVelY = 0;
  private prevOnGround = true;
  private lastFrameYaw = 0;
  private lastFramePitch = 0;

  // Gravedad invertida: 0 = normal, 1 = invertida (interpolado para el roll).
  private gravityFlip = 0;

  // Sonidos de movimiento y arma.
  private stepDistance = 0;
  private prevReloading = false;
  private prevWeaponId = '';

  // Death cam: mirar al asesino mientras esperas el respawn.
  private killerId: string | null = null;
  private sessionHeadshots = 0;
  private sessionGrenadeKills = 0;

  // Granadas y explosiones.
  private grenadeMeshes = new Map<number, THREE.Mesh>();
  private grenadeGeo = new THREE.SphereGeometry(0.14, 10, 10);
  private grenadeMat = new THREE.MeshStandardMaterial({
    color: 0x222a38, roughness: 0.4, metalness: 0.7, emissive: 0xff5533, emissiveIntensity: 0.9,
  });
  private explosions: Array<{ mesh: THREE.Mesh; light: THREE.PointLight; life: number }> = [];
  private shake = 0;
  private sparks = new Sparks();
  private worldTime = 0;
  private quality: 'low' | 'medium' | 'high' = 'high';

  private matchEnded = false;

  // Progresión: XP y estadísticas de la sesión, pendientes de "bancar".
  private sessionXp = 0;
  private sessionKills = 0;
  private sessionDeaths = 0;
  private sessionAssists = 0;
  private lastAssists = 0;

  onLeave: (() => void) | null = null;
  /** Se dispara al terminar la partida o al salir, con lo ganado en la sesión. */
  onXpBanked: ((result: { xp: number; kills: number; deaths: number; assists: number; headshots: number; grenadeKills: number; won: boolean; finished: boolean }) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly connection: Connection,
    private readonly input: Input,
    mapId: string,
    mode: GameModeId,
    settings: { fov: number; sensitivity: number; volume: number; quality?: 'low' | 'medium' | 'high' },
    audio?: AudioManager,
    cosmetics?: { skinId: string | null },
  ) {
    this.baseFov = settings.fov;
    this.baseSensitivity = settings.sensitivity;
    this.input.sensitivity = settings.sensitivity;
    this.audio = audio ?? new AudioManager();
    this.audio.setVolume(settings.volume);
    this.modeDef = getGameMode(mode);

    const map = getMap(mapId);
    this.moveCtx = { brushes: map.brushes, gravityZones: map.gravityZones, gravityScale: 1 };

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(pixelRatioFor(settings.quality ?? 'high'));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 1200);
    this.scene.add(this.camera);

    this.scene.background = new THREE.Color(map.skyColor);
    this.scene.fog = new THREE.FogExp2(map.fogColor, map.fogDensity);

    // Skybox de nebulosa (asset generado); si falta, se conserva el color plano.
    new THREE.TextureLoader().load('/assets/skyboxes/nebula-01.jpg', (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = tex;
      this.scene.backgroundIntensity = 0.55; // que no compita con el combate
    });

    this.quality = settings.quality ?? 'high';
    this.world = new World(map, this.quality);
    this.avatars.gravityZones = map.gravityZones;
    this.applySkybox(map);
    this.weaponView = new WeaponView(this.camera);
    this.weaponView.setSkin(cosmetics?.skinId ?? null);
    this.scene.add(this.world.group, this.avatars.group, this.weaponView.tracerGroup, this.sparks.points);

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

    // Chat en partida: T abre, Enter envía, Esc cierra. Mientras el chat
    // está abierto el teclado NO mueve al jugador (input.enabled).
    this.hud.onChatSend = (text) => this.connection.chat(text);
    this.hud.onChatToggle = (open) => {
      this.input.enabled = !open;
    };
    this.connection.onChat = (from, text) => this.hud.addChatMessage(from, text);
    this.chatKeyListener = (e: KeyboardEvent) => {
      if (e.code === 'KeyT' && this.input.isLocked && !this.hud.isChatOpen && this.alive) {
        e.preventDefault();
        this.hud.openChat();
      }
    };
    document.addEventListener('keydown', this.chatKeyListener);
  }

  private chatKeyListener: ((e: KeyboardEvent) => void) | null = null;

  /** Aplicar ajustes en caliente desde el modal (sin reiniciar la partida). */
  applySettings(s: { fov: number; sensitivity: number; quality?: 'low' | 'medium' | 'high' }): void {
    this.baseFov = s.fov;
    this.baseSensitivity = s.sensitivity;
    if (s.quality) this.renderer.setPixelRatio(pixelRatioFor(s.quality));
  }

  start(): void {
    this.running = true;
    this.hud.show();
    this.hud.setHint(true);
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.bankSession(false, false); // XP parcial si se abandona a mitad
    this.running = false;
    if (this.chatKeyListener) document.removeEventListener('keydown', this.chatKeyListener);
    this.input.enabled = true;
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
    this.sparks.update(dt);

    // Pulso del reactor: los paneles emisivos "respiran"; la lava fluye.
    this.worldTime += dt;
    this.world.accentMaterial.emissiveIntensity = 0.18 + Math.sin(this.worldTime * 1.8) * 0.08;
    this.world.moltenMaterial.emissiveIntensity = 0.9 + Math.sin(this.worldTime * 2.6) * 0.25;
    if (this.world.moltenMaterial.map) {
      this.world.moltenMaterial.map.offset.y = this.worldTime * 0.015;
    }
    this.recoverRecoil(dt);
    this.updateCamera(dt);

    // Sway del viewmodel según el movimiento de la vista de este frame.
    const lookDX = this.input.yaw - this.lastFrameYaw;
    const lookDY = this.input.pitch - this.lastFramePitch;
    this.lastFrameYaw = this.input.yaw;
    this.lastFramePitch = this.input.pitch;
    this.weaponView.update(dt, Math.hypot(this.predicted.vel.x, this.predicted.vel.z), this.predicted.onGround, lookDX, lookDY);

    // Crosshair dinámico: respira con el spread real (movimiento, aire, ráfaga, ADS).
    this.hud.setCrosshairGap(this.computeCrosshairGap());
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
    // Gravedad invertida: el strafe se invierte para que coincida con la pantalla.
    if (this.gravityFlip > 0.5) cmd.moveX = -cmd.moveX;

    stepMovement(this.predicted, cmd, this.moveCtx);
    this.connection.sendInput(cmd);

    // Pasos: cada ~2.3 m recorridos en el suelo suena una pisada.
    const speed = Math.hypot(this.predicted.vel.x, this.predicted.vel.z);
    if (this.predicted.onGround && speed > 1.5) {
      this.stepDistance += speed * INPUT_DT;
      if (this.stepDistance > 2.3) {
        this.stepDistance = 0;
        this.audio.playFootstep();
      }
    }
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
      this.audio.playShot(weapon.class, 0);

      // Trazadora + chispas PREDICHAS: el disparo se ve al instante aunque
      // el servidor esté lejos (el impacto real lo confirma el snapshot).
      if (weapon.class !== 'melee') {
        const eyeSign = 1 - 2 * this.gravityFlip;
        const eye = vec3(
          this.predicted.pos.x,
          this.predicted.pos.y + PLAYER_EYE_HEIGHT * (this.predicted.crouching ? 0.6 : 1) * eyeSign,
          this.predicted.pos.z,
        );
        const dir = viewDirection(vec3(), this.input.yaw, this.input.pitch);
        const t = raycastBrushes(eye, dir, this.moveCtx.brushes, weapon.maxRange);
        this.weaponView.addTracer(
          new THREE.Vector3(eye.x, eye.y - 0.06, eye.z),
          new THREE.Vector3(eye.x + dir.x * t, eye.y + dir.y * t, eye.z + dir.z * t),
          false,
        );
        this.sparks.burst(eye.x + dir.x * t, eye.y + dir.y * t, eye.z + dir.z * t);
      }

      // Retroceso por PATRÓN: los primeros disparos suben más, el drift
      // horizontal alterna de forma predecible (aprendible) y ADS lo reduce.
      const adsK = this.aiming ? 0.55 : 1;
      const climb = 1 + Math.min(this.recoilShotIndex, 8) * 0.14;
      const vKick = weapon.recoil.vertical * 2.4 * climb * adsK;
      const hKick = (Math.sin(this.recoilShotIndex * 1.7) + (Math.random() * 0.5 - 0.25)) *
        weapon.recoil.horizontal * 1.8 * adsK;
      this.input.pitch = Math.min(1.55, this.input.pitch + vKick);
      this.input.yaw += hKick;
      this.recoilAccum += vKick;
      this.recoilShotIndex++;
      this.lastShotAt = now;
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
        this.killerId = null;
        this.hud.hideMatchEnd();
      }

      if (snap.self) {
        this.weaponView.setWeapon(snap.self.weaponId);
        this.hud.updateSelf(this.me, snap.self, getWeapon(snap.self.weaponId).name);
        // Resincronizar la predicción de disparo con la autoridad.
        this.predAmmo = snap.self.ammo;
        this.predGrenades = snap.self.grenades;

        // Sonido + animación de recarga (flanco) y cambio de arma.
        if (snap.self.reloading && !this.prevReloading) this.audio.playReload();
        this.prevReloading = snap.self.reloading;
        this.weaponView.setReloading(snap.self.reloading);
        if (snap.self.weaponId !== this.prevWeaponId) {
          if (this.prevWeaponId) this.audio.playSwitch();
          this.prevWeaponId = snap.self.weaponId;
        }
      }
      this.hud.updateMatch(snap, this.modeDef.teams, selfId);
      this.hud.setGravity(gravityKindAt(this.moveCtx.gravityZones, this.predicted.pos));

      // Detectar daño recibido comparando snapshots (además del evento).
      if (prevMe && this.me.health < prevMe.health) {
        this.hud.flashDamage();
        this.audio.playDamage();
      }

      // Asistencias nuevas → XP (se detectan por diferencia entre snapshots).
      if (this.me.assists > this.lastAssists) {
        const gained = this.me.assists - this.lastAssists;
        this.sessionAssists += gained;
        this.awardXp(gained * XP_PER_ASSIST, 'ASISTENCIA');
      }
      this.lastAssists = this.me.assists;
    }

    // ---- Fin/reinicio de partida ----
    if (this.matchEnded && !snap.scores.matchOver) {
      this.matchEnded = false;
      this.lastAssists = 0;
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

  /** Cambio de mapa en caliente tras la votación: reconstruye el mundo. */
  private rebuildWorld(mapId: string): void {
    const map = getMap(mapId);
    this.scene.remove(this.world.group);
    this.world = new World(map, this.quality);
    this.scene.add(this.world.group);
    this.moveCtx.brushes = map.brushes;
    this.moveCtx.gravityZones = map.gravityZones;
    this.avatars.gravityZones = map.gravityZones;
    this.scene.fog = new THREE.FogExp2(map.fogColor, map.fogDensity);
    this.applySkybox(map);
  }

  /** Fondo: skybox equirrectangular si el mapa lo define; color plano si no. */
  private applySkybox(map: ReturnType<typeof getMap>): void {
    this.scene.background = new THREE.Color(map.skyColor);
    if (!map.skyboxUrl) return;
    new THREE.TextureLoader().load(map.skyboxUrl, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      if (this.world.map.id === map.id) this.scene.background = tex;
    });
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
          // Sonido, retroceso, trazadora y chispas ya se predijeron: aquí
          // solo llega la CONFIRMACIÓN de impacto del servidor.
          if (ev.hit) {
            this.hud.flashHitmarker('normal');
            this.audio.playHit();
          }
        } else {
          const dist = this.me ? from.distanceTo(new THREE.Vector3(this.me.pos.x, this.me.pos.y, this.me.pos.z)) : 30;
          const shooter = snap.players.find((p) => p.id === ev.shooterId);
          this.audio.playShot(getWeapon(shooter?.weaponId ?? '').class, dist);
          this.weaponView.addTracer(from, to, ev.hit);
          this.sparks.burst(to.x, to.y, to.z);
        }
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
          const victim = snap.players.find((p) => p.id === ev.victimId);
          this.hud.showKillBanner(victim?.name ?? '???', ev.headshot);
          this.sessionKills++;
          this.awardXp(XP_PER_KILL, 'BAJA');
          if (ev.headshot) {
            this.sessionHeadshots++;
            this.awardXp(XP_HEADSHOT_BONUS, 'TIRO A LA CABEZA');
          }
          if (ev.weaponId === 'grenade-frag') this.sessionGrenadeKills++;
        }
        if (ev.victimId === selfId) {
          this.sessionDeaths++;
          // "Eliminado por X" + death cam hacia el asesino.
          this.killerId = ev.killerId !== selfId ? ev.killerId : null;
          const killer = snap.players.find((p) => p.id === ev.killerId);
          this.hud.setDeathInfo(
            killer && ev.killerId !== selfId ? killer.name : null,
            getWeapon(ev.weaponId).name,
            ev.headshot,
          );
        }
        break;
      }
      case 'voteStart': {
        this.hud.showMapVote(
          ev.options.map((id) => ({ id, name: getMap(id).name })),
          (mapId) => this.connection.voteMap(mapId),
        );
        break;
      }
      case 'mapChange': {
        this.rebuildWorld(ev.mapId);
        break;
      }
      case 'gbounce': {
        const dist = Math.hypot(
          ev.pos.x - this.predicted.pos.x, ev.pos.y - this.predicted.pos.y, ev.pos.z - this.predicted.pos.z,
        );
        this.audio.playBounce(dist);
        break;
      }
      case 'matchEnd': {
        let text = 'Empate';
        let won = false;
        if (ev.winnerTeam !== null) {
          won = ev.winnerTeam === (this.me?.team ?? -1);
          text = won ? '¡VICTORIA DE TU EQUIPO!' : 'Derrota…';
        } else if (ev.winnerId) {
          const winner = snap.players.find((p) => p.id === ev.winnerId);
          won = ev.winnerId === selfId;
          text = won ? '¡VICTORIA!' : `Ganador: ${winner?.name ?? '???'}`;
        }
        this.sessionXp += won ? XP_MATCH_WIN : XP_MATCH_COMPLETE;
        text += `  ·  +${this.sessionXp} XP`;
        this.bankSession(won, true);

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

  private awardXp(amount: number, label: string): void {
    this.sessionXp += amount;
    this.hud.showXpPopup(`+${amount} XP · ${label}`);
  }

  /** Entrega la XP/estadísticas de la sesión al perfil (una sola vez). */
  private bankSession(won: boolean, finished: boolean): void {
    if (this.sessionXp === 0 && this.sessionKills === 0 && this.sessionDeaths === 0 && this.sessionAssists === 0) return;
    this.onXpBanked?.({
      xp: this.sessionXp,
      kills: this.sessionKills,
      deaths: this.sessionDeaths,
      assists: this.sessionAssists,
      headshots: this.sessionHeadshots,
      grenadeKills: this.sessionGrenadeKills,
      won,
      finished,
    });
    this.sessionXp = 0;
    this.sessionKills = 0;
    this.sessionDeaths = 0;
    this.sessionAssists = 0;
    this.sessionHeadshots = 0;
    this.sessionGrenadeKills = 0;
  }

  /** La mira vuelve sola tras la ráfaga (recuperación parcial, aprendible). */
  private recoverRecoil(dt: number): void {
    const now = performance.now();
    if (this.recoilAccum > 0.0001 && now - this.lastShotAt > 160) {
      const weapon = getWeapon(this.lastSnapshot?.self?.weaponId ?? '');
      const rate = 0.06 + weapon.recoil.recovery * 0.02;
      const r = Math.min(this.recoilAccum, rate * dt * 10);
      this.input.pitch -= r;
      this.recoilAccum -= r;
      if (this.recoilAccum <= 0.0001) {
        this.recoilAccum = 0;
        this.recoilShotIndex = 0;
      }
    } else if (now - this.lastShotAt > 450) {
      this.recoilShotIndex = 0;
    }
  }

  private computeCrosshairGap(): number {
    const weapon = getWeapon(this.lastSnapshot?.self?.weaponId ?? '');
    const spread = this.aiming ? weapon.spreadAds : weapon.spread;
    const speed = Math.hypot(this.predicted.vel.x, this.predicted.vel.z);
    let factor = spread * 550 + speed * 0.55 + this.recoilAccum * 320;
    if (!this.predicted.onGround) factor += 6;
    if (this.aiming) factor *= 0.45;
    return Math.max(3, Math.min(3 + factor, 26));
  }

  private updateCamera(dt: number): void {
    // Gravedad invertida: la cámara rueda 180º, el ojo pasa a estar "debajo"
    // del centro y el ratón se invierte para que la pantalla siga siendo natural.
    const gravityKind = gravityKindAt(this.moveCtx.gravityZones, this.predicted.pos);
    const inverted = gravityKind === 'inverted';
    this.gravityFlip += ((inverted ? 1 : 0) - this.gravityFlip) * Math.min(dt * 5, 1);
    this.input.invertLook = this.gravityFlip > 0.5;
    this.audio.setZeroG(gravityKind === 'zero' && this.alive);

    const eyeSign = 1 - 2 * this.gravityFlip;
    const eyeY = (this.predicted.crouching ? PLAYER_EYE_HEIGHT * 0.6 : PLAYER_EYE_HEIGHT) * eyeSign;
    this.camera.position.set(this.predicted.pos.x, this.predicted.pos.y + eyeY, this.predicted.pos.z);

    // Dip de aterrizaje: la cámara se hunde según la velocidad de caída.
    if (!this.predicted.onGround) {
      this.airMinVelY = Math.min(this.airMinVelY, this.predicted.vel.y);
    } else if (!this.prevOnGround && this.airMinVelY < -7) {
      this.landDip = Math.min(0.34, -this.airMinVelY * 0.018);
      this.audio.playLand(Math.min(1, -this.airMinVelY / 18));
    }
    if (this.predicted.onGround) this.airMinVelY = 0;
    this.prevOnGround = this.predicted.onGround;
    this.landDip = Math.max(0, this.landDip - dt * 1.6);
    this.camera.position.y -= this.landDip * (this.landDip / 0.34);

    // Sacudida por explosiones cercanas.
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
    }

    // Roll sutil al strafear (velocidad lateral relativa a la vista).
    const rightX = Math.cos(this.input.yaw);
    const rightZ = -Math.sin(this.input.yaw);
    const lateral = this.predicted.vel.x * rightX + this.predicted.vel.z * rightZ;
    const targetRoll = Math.max(-0.022, Math.min(0.022, -lateral * 0.0032));
    this.viewRoll += (targetRoll - this.viewRoll) * Math.min(dt * 8, 1);

    // Death cam: mientras esperas el respawn, la cámara sigue a tu asesino.
    if (!this.alive && this.killerId) {
      const killerPos = this.avatars.positionOf(this.killerId);
      if (killerPos) {
        this.camera.position.y += 0.6;
        this.camera.lookAt(killerPos);
        return;
      }
    }

    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.input.yaw);
    this.camera.rotateX(this.input.pitch);
    this.camera.rotateZ(this.viewRoll + Math.PI * this.gravityFlip);

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
