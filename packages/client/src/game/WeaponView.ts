import * as THREE from 'three';
import { getWeapon, type WeaponDef } from '@aether/shared';

/**
 * Viewmodel del arma en primera persona — Armas 2.0.
 * Cada arma tiene su PROPIO modelo procedural (no por clase): cuerpo, cañón,
 * cargador, culata, mira, bombeo o tambor según su ficha. Todo data-driven:
 * añadir un arma nueva = añadir su entrada en VIEW_CONFIGS (o hereda la de
 * su clase). Bob, retroceso, ADS, fogonazo y trazadoras incluidos.
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

const MAT = {
  body: new THREE.MeshStandardMaterial({ color: 0x232d40, roughness: 0.4, metalness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.55, metalness: 0.7 }),
  glow: new THREE.MeshStandardMaterial({
    color: 0x38e0c8, emissive: 0x38e0c8, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.5,
  }),
  blade: new THREE.MeshStandardMaterial({ color: 0xb9c6d8, roughness: 0.25, metalness: 1 }),
};

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
  private tracers: Array<{ line: THREE.Line; life: number }> = [];
  private swayX = 0;
  private swayY = 0;

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
    this.currentWeaponId = weaponId;
    this.group.remove(this.model);
    this.model = buildWeaponModel(getWeapon(weaponId));
    this.group.add(this.model);

    const cfg = { ...BASE, ...VIEW_CONFIGS[weaponId] };
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

  onShotFired(): void {
    const def = getWeapon(this.currentWeaponId);
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

/** Construye el modelo 3D de un arma a partir de su configuración. */
function buildWeaponModel(def: WeaponDef): THREE.Group {
  const cfg = { ...BASE, ...VIEW_CONFIGS[def.id] };
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
    return m;
  };

  if (cfg.blade) {
    // Cuchillo: hoja + guarda + mango.
    add(new THREE.BoxGeometry(0.012, 0.045, 0.26), MAT.blade, 0, 0.02, -0.2);
    add(new THREE.BoxGeometry(0.05, 0.06, 0.02), MAT.dark, 0, 0, -0.07);
    add(new THREE.BoxGeometry(0.035, 0.05, 0.12), MAT.body, 0, -0.01, 0);
    return g;
  }

  // Cuerpo y franja emisiva de la corporación.
  add(new THREE.BoxGeometry(cfg.bodyW, cfg.bodyH, cfg.bodyL), MAT.body, 0, 0, 0);
  add(new THREE.BoxGeometry(cfg.bodyW + 0.004, 0.014, cfg.bodyL * 0.4), MAT.glow, 0, 0.01, -cfg.bodyL * 0.1);

  // Cañón.
  if (cfg.barrelL > 0) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(cfg.barrelR, cfg.barrelR, cfg.barrelL, 10),
      MAT.dark,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -(cfg.bodyL / 2 + cfg.barrelL / 2));
    g.add(barrel);
  }

  // Empuñadura y gatillo.
  if (cfg.grip) add(new THREE.BoxGeometry(0.035, 0.11, 0.05), MAT.dark, 0, -cfg.bodyH / 2 - 0.045, cfg.bodyL * 0.18);

  // Cargador.
  if (cfg.mag === 'straight') {
    const mag = add(new THREE.BoxGeometry(0.035, 0.14, 0.06), MAT.dark, 0, -cfg.bodyH / 2 - 0.06, -cfg.bodyL * 0.1);
    mag.rotation.x = 0.15;
  } else if (cfg.mag === 'drum') {
    add(new THREE.BoxGeometry(0.09, 0.12, 0.12), MAT.dark, 0, -cfg.bodyH / 2 - 0.06, -cfg.bodyL * 0.05);
  }

  // Culata.
  if (cfg.stock) add(new THREE.BoxGeometry(cfg.bodyW * 0.8, cfg.bodyH * 0.75, 0.16), MAT.dark, 0, -0.01, cfg.bodyL / 2 + 0.08);

  // Miras.
  if (cfg.sight === 'iron') {
    add(new THREE.BoxGeometry(0.008, 0.025, 0.008), MAT.dark, 0, cfg.bodyH / 2 + 0.012, -cfg.bodyL * 0.42);
    add(new THREE.BoxGeometry(0.02, 0.02, 0.008), MAT.dark, 0, cfg.bodyH / 2 + 0.01, cfg.bodyL * 0.35);
  } else if (cfg.sight === 'holo') {
    add(new THREE.BoxGeometry(0.04, 0.035, 0.05), MAT.dark, 0, cfg.bodyH / 2 + 0.025, -cfg.bodyL * 0.1);
    add(new THREE.BoxGeometry(0.028, 0.022, 0.004), MAT.glow, 0, cfg.bodyH / 2 + 0.028, -cfg.bodyL * 0.1 - 0.024);
  } else if (cfg.sight === 'sniper') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 12), MAT.dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, cfg.bodyH / 2 + 0.04, -cfg.bodyL * 0.08);
    g.add(scope);
    add(new THREE.BoxGeometry(0.012, 0.03, 0.012), MAT.body, 0, cfg.bodyH / 2 + 0.015, -cfg.bodyL * 0.08);
  }

  // Bombeo (escopeta).
  if (cfg.pump) add(new THREE.BoxGeometry(0.05, 0.045, 0.14), MAT.body, 0, -0.03, -(cfg.bodyL / 2 + cfg.barrelL * 0.45));

  return g;
}
