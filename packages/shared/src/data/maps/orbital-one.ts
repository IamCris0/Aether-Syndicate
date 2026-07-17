import { vec3 } from '../../math/vec3.js';
import type { MapBrush, MapDef, SpawnPoint } from './types.js';
import type { GravityZone } from '../../sim/gravity.js';

/**
 * ORBITAL ONE — mapa de lanzamiento.
 *
 * Estación orbital con tres áreas conectadas:
 *  - HANGAR OESTE (spawn equipo 0): gravedad normal, contenedores como cobertura.
 *  - NÚCLEO DEL REACTOR (centro): pozo vertical en GRAVEDAD CERO que conecta
 *    dos niveles; la ruta rápida y arriesgada del mapa.
 *  - HANGAR ESTE (spawn equipo 1): espejo del oeste.
 *  - PASARELA EXTERIOR (norte): gravedad reducida, sin techo, expuesta.
 *  - CONDUCTOS (sur): túneles estrechos, ruta de flanqueo.
 */

const B = (
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  material: MapBrush['material'] = 'hull',
): MapBrush => ({
  min: vec3(Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2)),
  max: vec3(Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)),
  material,
});

const brushes: MapBrush[] = [
  // ---- Suelo general de la estación (nivel inferior, y=0 superficie) ----
  B(-46, -1, -22, 46, 0, 22, 'floor'),

  // ---- Perímetro (muros exteriores, altura 10) ----
  B(-47, 0, -23, 47, 10, -22, 'hull'), // norte interior (la pasarela exterior está más al norte)
  B(-47, 0, 22, 47, 10, 23, 'hull'), // sur
  B(-47, 0, -23, -46, 10, 23, 'hull'), // oeste
  B(46, 0, -23, 47, 10, 23, 'hull'), // este

  // ---- Techo general salvo el pozo del reactor y la pasarela exterior ----
  B(-46, 10, -22, -8, 11, 22, 'hull'),
  B(8, 10, -22, 46, 11, 22, 'hull'),
  B(-8, 10, -22, 8, 11, -8, 'hull'),
  B(-8, 10, 8, 8, 11, 22, 'hull'),
  // El hueco central (-8..8, -8..8) es el pozo de gravedad cero, techo alto:
  B(-8, 24, -8, 8, 25, 8, 'accent'),

  // ---- HANGAR OESTE ----
  // Contenedores
  B(-40, 0, -12, -34, 3, -8, 'accent'),
  B(-38, 0, 4, -32, 2.4, 10, 'hull'),
  B(-30, 0, -4, -26, 2, 2, 'accent'),
  // Plataforma elevada con rampa (rampa aproximada con escalones)
  B(-44, 0, 12, -30, 4, 20, 'catwalk'),
  B(-30, 0, 14, -28, 1, 20, 'catwalk'),
  B(-28, 0, 14, -26, 2, 20, 'catwalk'),
  B(-26, 0, 14, -24, 3, 20, 'catwalk'),

  // ---- HANGAR ESTE (espejo) ----
  B(34, 0, 8, 40, 3, 12, 'accent'),
  B(32, 0, -10, 38, 2.4, -4, 'hull'),
  B(26, 0, -2, 30, 2, 4, 'accent'),
  B(30, 0, -20, 44, 4, -12, 'catwalk'),
  B(28, 0, -20, 30, 1, -14, 'catwalk'),
  B(26, 0, -20, 28, 2, -14, 'catwalk'),
  B(24, 0, -20, 26, 3, -14, 'catwalk'),

  // ---- LABORATORIOS (pasillos centrales que rodean el reactor) ----
  // Paredes interiores que forman el anillo alrededor del pozo
  B(-14, 0, -14, -10, 6, -2, 'glass'),
  B(-14, 0, 2, -10, 6, 14, 'glass'),
  B(10, 0, -14, 14, 6, -2, 'glass'),
  B(10, 0, 2, 14, 6, 14, 'glass'),
  // Mesas/cobertura de laboratorio
  B(-20, 0, -6, -16, 1.2, 6, 'accent'),
  B(16, 0, -6, 20, 1.2, 6, 'accent'),

  // ---- NÚCLEO DEL REACTOR (pozo zero-G) ----
  // Suelo del pozo más bajo que el resto
  B(-8, -7, -8, 8, -6, 8, 'accent'),
  // Columna del reactor en el centro
  B(-1.6, -6, -1.6, 1.6, 22, 1.6, 'accent'),
  // Plataformas flotantes dentro del pozo
  B(-6, 4, -6, -3, 4.6, -3, 'catwalk'),
  B(3, 8, 3, 6, 8.6, 6, 'catwalk'),
  B(-6, 13, 3, -3, 13.6, 6, 'catwalk'),
  B(3, 17, -6, 6, 17.6, -3, 'catwalk'),
  // Balcón superior alrededor del pozo (nivel 2, y=10 piso)
  B(-12, 10, -12, 12, 10.6, -8, 'catwalk'),
  B(-12, 10, 8, 12, 10.6, 12, 'catwalk'),
  B(-12, 10, -8, -8, 10.6, 8, 'catwalk'),
  B(8, 10, -8, 12, 10.6, 8, 'catwalk'),
  // Muros del nivel superior alrededor del balcón
  B(-13, 10.6, -13, 13, 20, -12, 'hull'),
  B(-13, 10.6, 12, 13, 20, 13, 'hull'),
  B(-13, 10.6, -12, -12, 20, 12, 'hull'),
  B(12, 10.6, -12, 13, 20, 12, 'hull'),

  // ---- PASARELA EXTERIOR (norte, gravedad baja, sin techo) ----
  B(-30, -1, -34, 30, 0, -24, 'catwalk'),
  // Conexiones con el interior (huecos en el muro norte)
  B(-24, 0, -24, -18, 0.01, -22, 'floor'),
  B(18, 0, -24, 24, 0.01, -22, 'floor'),
  // Cobertura en la pasarela
  B(-12, 0, -31, -6, 2, -28, 'rock'),
  B(6, 0, -31, 12, 2, -28, 'rock'),
  // Barandillas bajas
  B(-30, 0, -35, 30, 1.2, -34, 'hull'),
  B(-31, 0, -35, -30, 1.2, -24, 'hull'),
  B(30, 0, -35, 31, 1.2, -24, 'hull'),

  // ---- CONDUCTOS (sur, túnel de flanqueo) ----
  B(-26, 0, 24, 26, 0.01, 30, 'floor'), // suelo del conducto (fuera del muro sur)
  B(-26, 3, 24, 26, 4, 30, 'hull'), // techo bajo
  B(-27, 0, 24, -26, 3, 30, 'hull'),
  B(26, 0, 24, 27, 3, 30, 'hull'),
  B(-26, 0, 30, 26, 3, 31, 'hull'),
  // Entradas al conducto (huecos en el muro sur ya cubiertos por brushes separados):
  // se accede por los extremos oeste/este a través de puertas.
];

// Aberturas: en lugar de restar geometría, el muro norte y sur se definieron
// completos arriba; sustituimos por segmentos con huecos reales.
// Muro norte con dos puertas (x -24..-18 y 18..24):
brushes[1] = B(-47, 0, -23, -24, 10, -22, 'hull');
brushes.push(B(-18, 0, -23, 18, 10, -22, 'hull'));
brushes.push(B(24, 0, -23, 47, 10, -22, 'hull'));
brushes.push(B(-24, 3.2, -23, -18, 10, -22, 'hull')); // dintel puerta oeste
brushes.push(B(18, 3.2, -23, 24, 10, -22, 'hull')); // dintel puerta este
// ---- v2: pack de cobertura ----
brushes.push(B(-30, 0, -16, -28, 6, -14, 'hull')); // pilar hangar oeste
brushes.push(B(28, 0, 14, 30, 6, 16, 'hull')); // pilar hangar este
brushes.push(B(-8, 0, 16, -5, 1.6, 19, 'accent')); // cajas corredor sur
brushes.push(B(5, 0, -19, 8, 1.4, -16, 'accent')); // cajas corredor norte
brushes.push(B(-8, 10.6, -8.3, -2, 11.3, -8, 'catwalk')); // barandilla balcón NO
brushes.push(B(2, 10.6, 8, 8, 11.3, 8.3, 'catwalk')); // barandilla balcón SE

// Muro sur con dos puertas (x -26..-20 y 20..26):
brushes[2] = B(-47, 0, 22, -26, 10, 23, 'hull');
brushes.push(B(-20, 0, 22, 20, 10, 23, 'hull'));
brushes.push(B(26, 0, 22, 47, 10, 23, 'hull'));
brushes.push(B(-26, 3, 22, -20, 10, 23, 'hull'));
brushes.push(B(20, 3, 22, 26, 10, 23, 'hull'));

const gravityZones: GravityZone[] = [
  {
    id: 'reactor-shaft',
    kind: 'zero',
    min: vec3(-8, -6, -8),
    max: vec3(8, 24, 8),
    priority: 10,
  },
  {
    id: 'exterior-walkway',
    kind: 'low',
    min: vec3(-31, -1, -35),
    max: vec3(31, 14, -23),
    priority: 5,
  },
];

const S = (x: number, y: number, z: number, yaw: number, team: 0 | 1 | 2): SpawnPoint => ({
  pos: vec3(x, y, z),
  yaw,
  team,
});

const spawns: SpawnPoint[] = [
  // Equipo 0 — Hangar oeste
  S(-40, 1.5, 0, -Math.PI / 2, 0),
  S(-36, 1.5, -16, -Math.PI / 2, 0),
  S(-40, 5.5, 16, -Math.PI / 2, 0),
  S(-36, 5.5, 16, -Math.PI / 2, 0),
  // Equipo 1 — Hangar este
  S(40, 1.5, 0, Math.PI / 2, 1),
  S(36, 1.5, 16, Math.PI / 2, 1),
  S(40, 5.5, -16, Math.PI / 2, 1),
  S(36, 5.5, -16, Math.PI / 2, 1),
  // Neutrales (FFA) — repartidos
  S(0, 1.5, 18, Math.PI, 2),
  S(0, 1.5, -18, 0, 2),
  S(-22, 1.5, -28, 0, 2),
  S(22, 1.5, -28, 0, 2),
  S(0, 12, 10, Math.PI, 2),
  S(-18, 1.5, 0, -Math.PI / 2, 2),
  S(18, 1.5, 0, Math.PI / 2, 2),
  S(0, 1.5, 27, Math.PI / 2, 2),
];

export const ORBITAL_ONE: MapDef = {
  id: 'orbital-one',
  name: 'Orbital One',
  description:
    'Estación de refinado de Etherium en órbita baja. Hangares gemelos, laboratorios y un pozo de reactor en gravedad cero que domina el centro del mapa.',
  brushes,
  gravityZones,
  spawns,
  lights: [
    { type: 'ambient', color: 0x223044, intensity: 0.9 },
    { type: 'directional', color: 0xbfd9ff, intensity: 1.4, pos: vec3(30, 60, -40) },
    { type: 'point', color: 0x38e0c8, intensity: 220, pos: vec3(0, 8, 0) },
    { type: 'point', color: 0xffa640, intensity: 120, pos: vec3(-36, 6, 0) },
    { type: 'point', color: 0x5f8cff, intensity: 120, pos: vec3(36, 6, 0) },
  ],
  killY: -40,
  skyboxUrl: '/assets/skyboxes/nebula-01.jpg',
  skyColor: 0x04070f,
  fogColor: 0x0a1220,
  fogDensity: 0.008,
  recommendedPlayers: [4, 16],
};
