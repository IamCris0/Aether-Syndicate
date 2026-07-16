import { GRAVITY_BASE } from '../constants.js';
import type { Vec3 } from '../math/vec3.js';

/**
 * Sistema de gravedad dinámica — el diferenciador de Aether Syndicate.
 * Cada mapa define volúmenes (AABB) con un tipo de gravedad. La simulación
 * consulta la gravedad en la posición del jugador/proyectil cada paso.
 */

export type GravityKind = 'normal' | 'low' | 'zero' | 'inverted';

export interface GravityZone {
  /** Identificador legible para debug/editor. */
  id: string;
  kind: GravityKind;
  min: Vec3;
  max: Vec3;
  /** Prioridad: si dos zonas solapan gana la mayor. */
  priority: number;
}

export const GRAVITY_SCALES: Record<GravityKind, number> = {
  normal: 1,
  low: 0.35,
  zero: 0,
  inverted: -1,
};

const inZone = (z: GravityZone, p: Vec3): boolean =>
  p.x >= z.min.x && p.x <= z.max.x &&
  p.y >= z.min.y && p.y <= z.max.y &&
  p.z >= z.min.z && p.z <= z.max.z;

/**
 * Devuelve la aceleración vertical (m/s^2, negativa = hacia abajo) en un punto.
 * `globalScale` permite salas personalizadas con gravedad alterada.
 */
export function gravityAt(zones: GravityZone[], p: Vec3, globalScale = 1): number {
  let best: GravityZone | null = null;
  for (const z of zones) {
    if (inZone(z, p) && (best === null || z.priority > best.priority)) best = z;
  }
  const scale = best ? GRAVITY_SCALES[best.kind] : 1;
  return -GRAVITY_BASE * scale * globalScale;
}

/** Tipo de gravedad efectivo en un punto (para HUD, audio y VFX). */
export function gravityKindAt(zones: GravityZone[], p: Vec3): GravityKind {
  let best: GravityZone | null = null;
  for (const z of zones) {
    if (inZone(z, p) && (best === null || z.priority > best.priority)) best = z;
  }
  return best ? best.kind : 'normal';
}
