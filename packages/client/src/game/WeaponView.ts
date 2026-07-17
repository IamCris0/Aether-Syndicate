import * as THREE from 'three';
import { getWeapon, type WeaponDef } from '@aether/shared';

/**
 * Viewmodel del arma en primera persona — Armas 2.0.
 *  - Modelo procedural POR ARMA (cuerpo, cañón, cargador, culata, miras…).
 *  - MANOS/BRAZOS del operador sujetando el arma.
 *  - Animaciones procedurales: recarga, cambio de arma y tajo de cuchillo.
 *  - SKINS (camuflajes) del pase de batalla: cambian los materiales.
 *  - Bob, sway, retroceso, ADS, fogonazo y trazadoras.
 */

interface ViewCfg {
  bodyL: number;
  bodyH: number;
  bodyW: number;
  barrelL: number;
  barrelR: number;
  mag: 'straight' | 'drum' | 'none';
  stock: boolean;
  sight: 'none' | 'iron' | 'holo' | 'sniper';
  pump: boolean;
  blade: boolean;
  grip: boolean;
}

const BASE: ViewCfg = {
  bodyL: 0.45, bodyH: 0.13, bodyW: 0.08,
  barrelL: 0.3, barrelR: 0.02,
  mag: 'straight', stock: true, sight: 'iron', pump: false, blade: false, grip: true,
};

const VIEW_CONFIGS: Record<string, Partial<ViewCfg>> = {
  'ar-vanguard': { bodyL: 0.5, barrelL: 0.34, sight: 'holo' },
  'smg-wisp': { bodyL: 0.32, bodyH: 0.11, barrelL: 0.16, stock: false, sight: 'iron' },
  'shotgun-breaker': { bodyL: 0.5, bodyH: 0.14, barrelL: 0.42, barrelR: 0.03, mag: 'none', pump: true },
  'sniper-longshot': { bodyL: 0.62, bodyH: 0.12, barrelL: 0.58, barrelR: 0.016, sight: 'sniper' },
  'lmg-bulwark': { bodyL: 0.56, bodyH: 0.17, bodyW: 0.1, barrelL: 0.46, barrelR: 0.026, mag: 'drum' },
  'pistol-nomad': { bodyL: 0.22, bodyH: 0.1, bodyW: 0.06, barrelL: 0.1, stock: false, mag: 'none', sight: 'iron' },
  'knife-fang': { blade: true, mag: 'none', stock: false, sight: 'none', barrelL: 0, grip: false },
};

/** Skins/camuflajes desbloqueables en el pase de batalla. */
export interface WeaponSkin {
  name: string;
  body: number;
  glow: number;
}

export const WEAPON_SKINS: Record<string, WeaponSkin> = {
  default: { name: 'Estándar', body: 0x232d40, glow: 0x38e0c8 },
  'skin-ember': { name: 'Camuflaje Ámbar', body: 0x3a2418, glow: 0xff7733 },
  'skin-crimson': { name: 'Camuflaje Carmesí', body: 0x3a1520, glow: 0xff4d5e },
  'skin-gold': { name: 'Camuflaje Dorado', body: 0x3a3014, glow: 0xffd24a },
  'skin-violet': { name: 'Camuflaje Violeta', body: 0x241538, glow: 0xa97fff },
  'skin-arctic': { name: 'Camuflaje Ártico', body: 0x9fb2c8, glow: 0xffffff },
};

interface Mats {
  body: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  blade: THREE.MeshStandardMaterial;
  armor: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
}

function makeMats(skin: WeaponSkin): Mats {
  return {
    body: new THREE.MeshStandardMaterial({ color: skin.body, roughness: 0.4, metalness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.55, metalness: 0.7 }),
    glow: new THREE.MeshStandardMaterial({
      color: skin.glow, emissive: skin.glow, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.5,
    }),
    blade: new THREE.MeshStandardMaterial({ color: 0xb9c6d8, roughness: 0.25, metalness: 1 }),
    armor: new THREE.MeshStandardMaterial({ color: 0x2c3a52, roughness: 0.55, metalness: 0.6 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.8, metalness: 0.2 }),
  };
}

export class WeaponView {
  readonly group = new THREE.Group();
  readonly tracerGroup = new THREE.Group();

  private model = new THREE.Group();
  private muzzleFlash: THREE.PointLight;
  private flashPlane: THREE.Mesh;
  private recoilKick = 0;
  private bobPhase = 0;
  private ads = 0;
  private adsTarget = 0;
  private currentWeaponId = '';
  private skinId = 'default';
  private tracers: Array<{ line: THREE.Line; life: number }> = [];
  private swayX = 0;
  private swayY = 0;

  // Animaciones procedurales (0 = reposo).
  private reloadAnim = 0;
  private reloadTarget = 0;
  private switchAnim = 0;
  private meleeSwing = 0;

  constructor(camera: THREE.Camera) {
    this.muzzleFlash = new THREE.PointLight(0xffc866, 0, 4, 2);
    this.flashPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.group.add(this.model, this.muzzleFlash, this.flashPlane);
    this.group.position.set(0.28, -0.26, -0.45);
    camera.add(this.group);
  }

  setWeapon(weaponId: string): void {
    if (weaponId === this.currentWeaponId) return;
    const isFirst = this.currentWeaponId === '';
    this.currentWeaponId = weaponId;
    this.rebuild();
    if (!isFirst) this.switchAnim = 1; // animación de desenfundado
  }

  /** Aplica una skin del pase de batalla y reconstruye el modelo. */
  setSkin(skinId: string | null): void {
    const id = skinId && WEAPON_SKINS[skinId] ? skinId : 'default';
    if (id === this.skinId) return;
    this.skinId = id;
    if (this.currentWeaponId) this.rebuild();
  }

  private rebuild(): void {
    this.group.remove(this.model);
    this.model = buildWeaponModel(getWeapon(this.currentWeaponId), WEAPON_SKINS[this.skinId]);
    this.group.add(this.model);

    const cfg = { ...BASE, ...VIEW_CONFIGS[this.currentWeaponId] };
    const muzzleZ = -(cfg.bodyL / 2 + cfg.barrelL + 0.02);
    this.muzzleFlash.position.set(0, 0.02, muzzleZ);
    this.flashPlane.position.set(0, 0.02, muzzleZ - 0.01);
  }

  setAds(aiming: boolean): void {
    this.adsTarget = aiming ? 1 : 0;
  }

  get adsAmount(): number {
    return this.ads;
  }

  setReloading(reloading: boolean): void {
    this.reloadTarget = reloading ? 1 : 0;
  }

  onShotFired(): void {
    const def = getWeapon(this.currentWeaponId);
    if (def.class === 'melee') {
      this.meleeSwing = 1;
      return;
    }
    this.recoilKick = Math.min(this.recoilKick + 0.045 + def.recoil.vertical * 2, 0.13);
    this.muzzleFlash.intensity = 30;
    (this.flashPlane.material as THREE.MeshBasicMaterial).opacity = 0.9;
    this.flashPlane.rotation.z = Math.random() * Math.PI;
  }

  addTracer(from: THREE.Vector3, to: THREE.Vector3, hit: boolean): void {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: hit ? 0xffe08a : 0x9adfff, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    this.tracerGroup.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  update(dt: number, speed: number, onGround: boolean, lookDX = 0, lookDY = 0): void {
    // Sway: el arma "persigue" la vista con retardo (peso percibido).
    const swayK = 1 - this.ads * 0.85;
    this.swayX += (THREE.MathUtils.clamp(-lookDX * 2.2, -0.05, 0.05) * swayK - this.swayX) * Math.min(dt * 10, 1);
    this.swayY += (THREE.MathUtils.clamp(lookDY * 2.2, -0.04, 0.04) * swayK - this.swayY) * Math.min(dt * 10, 1);

    this.recoilKick = Math.max(0, this.recoilKick - dt * 0.6);
    this.muzzleFlash.intensity = Math.max(0, this.muzzleFlash.intensity - dt * 400);
    const fp = this.flashPlane.material as THREE.MeshBasicMaterial;
    fp.opacity = Math.max(0, fp.opacity - dt * 12);

    this.ads += (this.adsTarget - this.ads) * Math.min(dt * 12, 1);
    const adsK = 1 - this.ads;

    if (onGround && speed > 0.5) this.bobPhase += dt * Math.min(speed, 10) * 1.6;
    const bobX = Math.sin(this.bobPhase) * 0.008 * adsK;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.006 * adsK;

    const hipX = 0.28, hipY = -0.26, hipZ = -0.45;
    const adsX = 0, adsY = -0.16, adsZ = -0.32;
    this.group.position.set(
      hipX + (adsX - hipX) * this.ads + bobX + this.swayX,
      hipY + (adsY - hipY) * this.ads + bobY + this.recoilKick * 0.4 + this.swayY,
      hipZ + (adsZ - hipZ) * this.ads + this.recoilKick,
    );
    this.group.rotation.x = this.recoilKick * 1.6 + this.swayY * 2;
    this.group.rotation.z = this.swayX * 1.5;

    // ---- Animaciones procedurales sobre el modelo interno ----
    this.reloadAnim += (this.reloadTarget - this.reloadAnim) * Math.min(dt * 6, 1);
    this.switchAnim = Math.max(0, this.switchAnim - dt * 3.2);
    this.meleeSwing = Math.max(0, this.meleeSwing - dt * 4.5);

    // Recarga: el arma baja, se inclina y "trastea" (wobble).
    const reloadWobble = Math.sin(performance.now() / 90) * 0.03 * this.reloadAnim;
    // Cambio de arma: sube desde abajo.
    const switchDrop = this.switchAnim * this.switchAnim;
    // Tajo de cuchillo: arco rápido con pico a mitad de recorrido.
    const swingArc = Math.sin((1 - this.meleeSwing) * Math.PI) * (this.meleeSwing > 0 ? 1 : 0);

    this.model.position.set(
      0,
      -this.reloadAnim * 0.09 - switchDrop * 0.26,
      -swingArc * 0.26,
    );
    this.model.rotation.set(
      this.reloadAnim * 0.7 + switchDrop * 0.9 - swingArc * 0.9 + reloadWobble,
      0,
      reloadWobble * 1.5 - swingArc * 0.35,
    );

    // Trazadoras.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.life / 0.09) * 0.85;
      if (t.life <= 0) {
        this.tracerGroup.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}

/** Construye el modelo 3D de un arma (con manos del operador) según su ficha. */
function buildWeaponModel(def: WeaponDef, skin: WeaponSkin): THREE.Group {
  const cfg = { ...BASE, ...VIEW_CONFIGS[def.id] };
  const m = makeMats(skin);
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.rotation.z = rz;
    g.add(mesh);
    return mesh;
  };

  if (cfg.blade) {
    add(new THREE.BoxGeometry(0.012, 0.045, 0.26), m.blade, 0, 0.02, -0.2);
    add(new THREE.BoxGeometry(0.05, 0.06, 0.02), m.dark, 0, 0, -0.07);
    add(new THREE.BoxGeometry(0.035, 0.05, 0.12), m.body, 0, -0.01, 0);
    addArm(g, m, 'right', 0.02, -0.06, 0.1);
    return g;
  }

  add(new THREE.BoxGeometry(cfg.bodyW, cfg.bodyH, cfg.bodyL), m.body, 0, 0, 0);
  add(new THREE.BoxGeometry(cfg.bodyW + 0.004, 0.014, cfg.bodyL * 0.4), m.glow, 0, 0.01, -cfg.bodyL * 0.1);

  if (cfg.barrelL > 0) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(cfg.barrelR, cfg.barrelR, cfg.barrelL, 10), m.dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -(cfg.bodyL / 2 + cfg.barrelL / 2));
    g.add(barrel);
  }

  if (cfg.grip) add(new THREE.BoxGeometry(0.035, 0.11, 0.05), m.dark, 0, -cfg.bodyH / 2 - 0.045, cfg.bodyL * 0.18);

  if (cfg.mag === 'straight') {
    add(new THREE.BoxGeometry(0.035, 0.14, 0.06), m.dark, 0, -cfg.bodyH / 2 - 0.06, -cfg.bodyL * 0.1, 0.15);
  } else if (cfg.mag === 'drum') {
    add(new THREE.BoxGeometry(0.09, 0.12, 0.12), m.dark, 0, -cfg.bodyH / 2 - 0.06, -cfg.bodyL * 0.05);
  }

  if (cfg.stock) add(new THREE.BoxGeometry(cfg.bodyW * 0.8, cfg.bodyH * 0.75, 0.16), m.dark, 0, -0.01, cfg.bodyL / 2 + 0.08);

  if (cfg.sight === 'iron') {
    add(new THREE.BoxGeometry(0.008, 0.025, 0.008), m.dark, 0, cfg.bodyH / 2 + 0.012, -cfg.bodyL * 0.42);
    add(new THREE.BoxGeometry(0.02, 0.02, 0.008), m.dark, 0, cfg.bodyH / 2 + 0.01, cfg.bodyL * 0.35);
  } else if (cfg.sight === 'holo') {
    add(new THREE.BoxGeometry(0.04, 0.035, 0.05), m.dark, 0, cfg.bodyH / 2 + 0.025, -cfg.bodyL * 0.1);
    add(new THREE.BoxGeometry(0.028, 0.022, 0.004), m.glow, 0, cfg.bodyH / 2 + 0.028, -cfg.bodyL * 0.1 - 0.024);
  } else if (cfg.sight === 'sniper') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 12), m.dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, cfg.bodyH / 2 + 0.04, -cfg.bodyL * 0.08);
    g.add(scope);
    add(new THREE.BoxGeometry(0.012, 0.03, 0.012), m.body, 0, cfg.bodyH / 2 + 0.015, -cfg.bodyL * 0.08);
  }

  if (cfg.pump) add(new THREE.BoxGeometry(0.05, 0.045, 0.14), m.body, 0, -0.03, -(cfg.bodyL / 2 + cfg.barrelL * 0.45));

  // Manos: derecha en la empuñadura, izquierda en el guardamanos/bombeo.
  addArm(g, m, 'right', 0.015, -cfg.bodyH / 2 - 0.05, cfg.bodyL * 0.2);
  addArm(g, m, 'left', -0.02, -cfg.bodyH / 2 - 0.03, cfg.pump ? -(cfg.bodyL / 2 + cfg.barrelL * 0.45) : -cfg.bodyL * 0.28);

  return g;
}

/** Antebrazo + guante del operador, orientado desde fuera de cámara al agarre. */
function addArm(g: THREE.Group, m: Mats, side: 'left' | 'right', x: number, y: number, z: number): void {
  const s = side === 'right' ? 1 : -1;
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.07), m.glove);
  hand.position.set(x, y, z);
  const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.24), m.armor);
  forearm.position.set(x + s * 0.07, y - 0.08, z + 0.16);
  forearm.rotation.set(-0.5, s * 0.35, 0);
  g.add(hand, forearm);
}
