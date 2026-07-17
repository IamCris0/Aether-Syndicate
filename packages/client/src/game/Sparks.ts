import * as THREE from 'three';

/**
 * Chispas de impacto de bala — POOL fijo de partículas (cero allocations
 * por disparo). Un único THREE.Points para todo el sistema: 1 draw call.
 */

const MAX_PARTICLES = 240;
const PER_BURST = 8;
const LIFE_S = 0.28;
const GRAVITY = 14;

export class Sparks {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private velocities: Float32Array;
  private lives: Float32Array;
  private cursor = 0;
  private material: THREE.PointsMaterial;

  constructor() {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.lives = new Float32Array(MAX_PARTICLES); // 0 = inactiva
    this.positions.fill(99999); // fuera de cámara

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.PointsMaterial({
      color: 0xffc27d,
      size: 0.055,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  /** Ráfaga de chispas en un punto de impacto. */
  burst(x: number, y: number, z: number): void {
    for (let i = 0; i < PER_BURST; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      this.positions[idx * 3] = x;
      this.positions[idx * 3 + 1] = y;
      this.positions[idx * 3 + 2] = z;
      // Dirección aleatoria con sesgo hacia arriba (rebote de metralla).
      this.velocities[idx * 3] = (Math.random() - 0.5) * 7;
      this.velocities[idx * 3 + 1] = Math.random() * 5 + 1;
      this.velocities[idx * 3 + 2] = (Math.random() - 0.5) * 7;
      this.lives[idx] = LIFE_S;
    }
  }

  update(dt: number): void {
    let alive = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.lives[i] <= 0) continue;
      alive = true;
      this.lives[i] -= dt;
      if (this.lives[i] <= 0) {
        this.positions[i * 3] = 99999;
        continue;
      }
      this.velocities[i * 3 + 1] -= GRAVITY * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }
    if (alive) {
      (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}
