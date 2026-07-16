import type { Vec3 } from '../math/vec3.js';

/**
 * Colisiones AABB de la simulación compartida.
 * La geometría de colisión de los mapas se describe como cajas alineadas
 * a los ejes ("brushes"), independiente de la malla visual del cliente.
 */

export interface Brush {
  min: Vec3;
  max: Vec3;
}

export interface RayHit {
  t: number;
  point: Vec3;
}

const EPS = 1e-4;

/**
 * Mueve un AABB (centro + medias dimensiones) eje por eje resolviendo
 * penetraciones contra los brushes. Devuelve qué ejes chocaron para que
 * el movimiento anule la velocidad correspondiente.
 */
export function moveAABB(
  center: Vec3,
  half: Vec3,
  delta: Vec3,
  brushes: Brush[],
): { hitX: boolean; hitY: boolean; hitZ: boolean; groundNormalY: number } {
  const result = { hitX: false, hitY: false, hitZ: false, groundNormalY: 0 };

  // Eje Y primero (suelo/techo), luego X y Z.
  center.y += delta.y;
  for (const b of brushes) {
    if (!overlaps(center, half, b)) continue;
    if (delta.y < 0) {
      center.y = b.max.y + half.y + EPS;
      result.groundNormalY = 1;
    } else {
      center.y = b.min.y - half.y - EPS;
      result.groundNormalY = -1;
    }
    result.hitY = true;
  }

  center.x += delta.x;
  for (const b of brushes) {
    if (!overlaps(center, half, b)) continue;
    center.x = delta.x > 0 ? b.min.x - half.x - EPS : b.max.x + half.x + EPS;
    result.hitX = true;
  }

  center.z += delta.z;
  for (const b of brushes) {
    if (!overlaps(center, half, b)) continue;
    center.z = delta.z > 0 ? b.min.z - half.z - EPS : b.max.z + half.z + EPS;
    result.hitZ = true;
  }

  return result;
}

export function overlaps(center: Vec3, half: Vec3, b: Brush): boolean {
  return (
    center.x + half.x > b.min.x && center.x - half.x < b.max.x &&
    center.y + half.y > b.min.y && center.y - half.y < b.max.y &&
    center.z + half.z > b.min.z && center.z - half.z < b.max.z
  );
}

/** Intersección rayo-AABB (slab method). Devuelve t o null. */
export function rayVsAABB(origin: Vec3, dir: Vec3, min: Vec3, max: Vec3, maxT: number): number | null {
  let tMin = 0;
  let tMax = maxT;

  const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
  for (const a of axes) {
    const d = dir[a];
    const o = origin[a];
    if (Math.abs(d) < 1e-9) {
      if (o < min[a] || o > max[a]) return null;
    } else {
      let t1 = (min[a] - o) / d;
      let t2 = (max[a] - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }
  return tMin;
}

/** Primer impacto de un rayo contra la geometría del mapa. */
export function raycastBrushes(origin: Vec3, dir: Vec3, brushes: Brush[], maxT: number): number {
  let best = maxT;
  for (const b of brushes) {
    const t = rayVsAABB(origin, dir, b.min, b.max, best);
    if (t !== null && t < best) best = t;
  }
  return best;
}
