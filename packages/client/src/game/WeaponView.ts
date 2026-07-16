import * as THREE from 'three';
import { getWeapon } from '@aether/shared';

/**
 * Viewmodel del arma (primera persona): bob al caminar, retroceso al
 * disparar, fogonazo y trazadoras. Todo procedural, sin assets externos.
 */
export class WeaponView {
  readonly group = new THREE.Group();
  private muzzleFlash: THREE.PointLight;
  private flashPlane: THREE.Mesh;
  private recoilKick = 0;
  private bobPhase = 0;
  /** 0 = cadera, 1 = apuntando (ADS). */
  private ads = 0;
  private adsTarget = 0;
  private currentWeaponId = '';
  private gunBody: THREE.Mesh;
  private gunBarrel: THREE.Mesh;

  private tracers: Array<{ line: THREE.Line; life: number }> = [];
  readonly tracerGroup = new THREE.Group();

  constructor(camera: THREE.Camera) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x232d40, roughness: 0.4, metalness: 0.85 });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x38e0c8, emissive: 0x38e0c8, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.5,
    });

    this.gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.45), mat);
    this.gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), mat);
    this.gunBarrel.position.set(0, 0.045, -0.32);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.2), accent);
    stripe.position.set(0, 0.02, -0.05);

    this.muzzleFlash = new THREE.PointLight(0xffc866, 0, 4, 2);
    this.muzzleFlash.position.set(0, 0.045, -0.55);

    this.flashPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.flashPlane.position.set(0, 0.045, -0.56);

    this.group.add(this.gunBody, this.gunBarrel, stripe, this.muzzleFlash, this.flashPlane);
    this.group.position.set(0.28, -0.26, -0.45);
    camera.add(this.group);
  }

  setWeapon(weaponId: string): void {
    if (weaponId === this.currentWeaponId) return;
    this.currentWeaponId = weaponId;
    const def = getWeapon(weaponId);
    // Silueta según clase: longitud/grosor del cuerpo y cañón.
    const scaleZ = { ar: 1, smg: 0.7, shotgun: 1.1, sniper: 1.5, lmg: 1.2, pistol: 0.5, melee: 0.35, grenade: 0.4 }[def.class] ?? 1;
    this.gunBody.scale.set(1, 1, scaleZ);
    this.gunBarrel.visible = def.class !== 'melee';
    this.gunBarrel.scale.z = scaleZ;
    this.gunBarrel.position.z = -0.32 * scaleZ;
    this.muzzleFlash.position.z = -0.55 * scaleZ;
    this.flashPlane.position.z = -0.56 * scaleZ;
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
    const mat = new THREE.LineBasicMaterial({
      color: hit ? 0xffe08a : 0x9adfff, transparent: true, opacity: 0.85,
    });
    const line = new THREE.Line(geo, mat);
    this.tracerGroup.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  update(dt: number, speed: number, onGround: boolean): void {
    // Recuperación del retroceso.
    this.recoilKick = Math.max(0, this.recoilKick - dt * 0.6);
    this.muzzleFlash.intensity = Math.max(0, this.muzzleFlash.intensity - dt * 400);
    const fp = this.flashPlane.material as THREE.MeshBasicMaterial;
    fp.opacity = Math.max(0, fp.opacity - dt * 12);

    // Head/weapon bob.
    if (onGround && speed > 0.5) {
      this.bobPhase += dt * Math.min(speed, 10) * 1.6;
    }
    // ADS: el arma se centra y se acerca a la vista.
    this.ads += (this.adsTarget - this.ads) * Math.min(dt * 12, 1);
    const adsK = 1 - this.ads;

    const bobX = Math.sin(this.bobPhase) * 0.008 * adsK;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.006 * adsK;

    const hipX = 0.28, hipY = -0.26, hipZ = -0.45;
    const adsX = 0, adsY = -0.16, adsZ = -0.32;
    this.group.position.set(
      hipX + (adsX - hipX) * this.ads + bobX,
      hipY + (adsY - hipY) * this.ads + bobY + this.recoilKick * 0.4,
      hipZ + (adsZ - hipZ) * this.ads + this.recoilKick,
    );
    this.group.rotation.x = this.recoilKick * 1.6;

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
