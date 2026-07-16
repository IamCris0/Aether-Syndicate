/**
 * Vector 3D mutable y ligero, sin dependencias.
 * Se usa en la simulación compartida (cliente y servidor) para mantener
 * el mismo comportamiento numérico en ambos lados.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const copy = (out: Vec3, a: Vec3): Vec3 => {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
};

export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });

export const add = (out: Vec3, a: Vec3, b: Vec3): Vec3 => {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
};

export const addScaled = (out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 => {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  out.z = a.z + b.z * s;
  return out;
};

export const sub = (out: Vec3, a: Vec3, b: Vec3): Vec3 => {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
};

export const scale = (out: Vec3, a: Vec3, s: number): Vec3 => {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
};

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const lengthSq = (a: Vec3): number => dot(a, a);

export const length = (a: Vec3): number => Math.sqrt(lengthSq(a));

export const distance = (a: Vec3, b: Vec3): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const normalize = (out: Vec3, a: Vec3): Vec3 => {
  const len = length(a);
  if (len < 1e-8) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  return scale(out, a, 1 / len);
};

export const lerp = (out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 => {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
};

/** Dirección de vista a partir de yaw/pitch (radianes). Convención: -Z es "adelante" con yaw 0. */
export const viewDirection = (out: Vec3, yaw: number, pitch: number): Vec3 => {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
};
