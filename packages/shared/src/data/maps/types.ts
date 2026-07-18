import type { Brush } from '../../sim/collision.js';
import type { GravityZone } from '../../sim/gravity.js';
import type { TeamId } from '../../types.js';
import type { Vec3 } from '../../math/vec3.js';

/**
 * Formato de mapa de Aether Syndicate.
 * Un mapa es un módulo de datos autocontenido: geometría de colisión
 * (brushes AABB con material para el render), zonas de gravedad, spawns
 * y metadatos. El cliente genera la malla visual a partir de los brushes;
 * el servidor solo usa la colisión.
 */

export type BrushMaterial =
  | 'hull' // casco metálico
  | 'floor' // suelo industrial
  | 'glass'
  | 'accent' // paneles emisivos teal
  | 'catwalk'
  | 'rock'
  | 'lab' // panel blanco de laboratorio
  | 'container' // contenedor de carga (naranja industrial)
  | 'molten' // metal fundido emisivo (letal por killY)
  | 'invisible'; // colisión sin render (barreras)

export interface MapBrush extends Brush {
  material: BrushMaterial;
}

export interface SpawnPoint {
  pos: Vec3;
  yaw: number;
  /** 2 = válido para cualquier equipo / FFA. */
  team: TeamId;
}

export interface LightDef {
  type: 'point' | 'directional' | 'ambient';
  color: number;
  intensity: number;
  pos?: Vec3;
}

export interface MapDef {
  id: string;
  name: string;
  description: string;
  brushes: MapBrush[];
  gravityZones: GravityZone[];
  spawns: SpawnPoint[];
  lights: LightDef[];
  /** Caer por debajo de esta Y mata al jugador (vacío espacial). */
  killY: number;
  /** Skybox equirrectangular opcional (ruta en /assets del cliente). */
  skyboxUrl?: string;
  skyColor: number;
  fogColor: number;
  fogDensity: number;
  recommendedPlayers: [number, number];
}
