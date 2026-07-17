import { vec3 } from '../../math/vec3.js';
import type { MapBrush, MapDef, SpawnPoint } from './types.js';
import type { GravityZone } from '../../sim/gravity.js';

/**
 * REFINERÍA KESSLER — segundo mapa oficial.
 *
 * Refinería de Etherium fundido. Temática cálida (naranjas) que contrasta
 * con el teal corporativo. Tres niveles de juego:
 *  - SUELO: naves industriales con cajas y torres de procesado como cobertura.
 *  - FOSO central (gravedad BAJA): canal de metal fundido que cruza el mapa;
 *    caer al fondo es letal, pero los puentes y saltos flotados lo cruzan.
 *  - PASARELAS (y=9): anillos norte/sur conectados a las cimas de las torres;
 *    se sube por ASCENSORES DE GRAVEDAD CERO en las esquinas.
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
  // ---- Suelo (dos mitades; el foso queda abierto entre z=-3..3) ----
  B(-38, -1, -22, 38, 0, -3, 'floor'),
  B(-38, -1, 3, 38, 0, 22, 'floor'),
  B(-38, -1, -3, -30, 0, 3, 'floor'), // extremos del foso cerrados
  B(30, -1, -3, 38, 0, 3, 'floor'),

  // ---- Puentes sobre el foso ----
  B(-18, -1, -3, -14, 0, 3, 'catwalk'),
  B(-2, -1, -3, 2, 0, 3, 'catwalk'),
  B(14, -1, -3, 18, 0, 3, 'catwalk'),

  // ---- Metal fundido (visual, bajo el killY) ----
  B(-30, -7, -3, 30, -6.5, 3, 'accent'),

  // ---- Perímetro y techo ----
  B(-38, 0, -23, 38, 14, -22, 'hull'),
  B(-38, 0, 22, 38, 14, 23, 'hull'),
  B(-39, 0, -23, -38, 14, 23, 'hull'),
  B(38, 0, -23, 39, 14, 23, 'hull'),
  B(-38, 14, -22, 38, 15, 22, 'hull'),

  // ---- Torres de procesado (cimas transitables a y=9) ----
  B(-24, 0, -14, -16, 9, -6, 'accent'), // Torre A (noroeste)
  B(-4, 0, 6, 4, 9, 14, 'accent'), // Torre B (sur centro)
  B(16, 0, -14, 24, 9, -6, 'accent'), // Torre C (noreste)

  // ---- Pasarelas superiores (y=9..9.5) ----
  B(-32, 9, -19, 32, 9.5, -16, 'catwalk'), // anillo norte
  B(-32, 9, 16, 32, 9.5, 19, 'catwalk'), // anillo sur
  B(-21, 9, -16, -19, 9.5, -14, 'catwalk'), // conector anillo→Torre A
  B(19, 9, -16, 21, 9.5, -14, 'catwalk'), // conector anillo→Torre C
  B(-1, 9, 14, 1, 9.5, 16, 'catwalk'), // conector anillo→Torre B
  B(-16, 9, -10.75, 16, 9.5, -9.25, 'catwalk'), // espina A↔C
  B(-0.75, 9, -9.25, 0.75, 9.5, 6, 'catwalk'), // puente alto sobre el foso (expuesto)

  // ---- Cobertura a ras de suelo ----
  B(-12, 0, -16, -9, 1.6, -13, 'hull'),
  B(8, 0, 10, 11, 1.4, 13, 'hull'),
  B(-10, 0, 8, -7, 2, 11, 'accent'),
  B(24, 0, 4, 27, 1.6, 7, 'hull'),
  B(-28, 0, 4, -25, 1.8, 7, 'accent'),
  B(10, 0, -20, 13, 1.5, -17, 'hull'),

  // ---- Tuberías decorativas (dan cobertura parcial junto a los muros) ----
  B(-30, 2.5, -21.9, 30, 3.3, -21.2, 'accent'),
  B(-30, 2.5, 21.2, 30, 3.3, 21.9, 'accent'),
];

const gravityZones: GravityZone[] = [
  // Ascensores de gravedad cero: transporte vertical a las pasarelas.
  { id: 'lift-west', kind: 'zero', min: vec3(-35, 0, -19), max: vec3(-31, 10.5, -16), priority: 10 },
  { id: 'lift-east', kind: 'zero', min: vec3(31, 0, 16), max: vec3(35, 10.5, 19), priority: 10 },
  // El foso: gravedad baja — saltos flotados para cruzarlo, caída lenta y dramática.
  { id: 'molten-trench', kind: 'low', min: vec3(-30, -5, -3), max: vec3(30, 4, 3), priority: 5 },
  // EL CANAL INVERTIDO: corredor sur donde la gravedad se invierte — caes al
  // techo y avanzas boca abajo. Ruta de flanqueo experimental del diferenciador.
  { id: 'inverted-canal', kind: 'inverted', min: vec3(-14, 0, 19.5), max: vec3(14, 14, 22), priority: 8 },
];

const S = (x: number, y: number, z: number, yaw: number, team: 0 | 1 | 2): SpawnPoint => ({
  pos: vec3(x, y, z),
  yaw,
  team,
});

const spawns: SpawnPoint[] = [
  // Equipo 0 — oeste
  S(-34, 1.5, -10, -Math.PI / 2, 0),
  S(-34, 1.5, 10, -Math.PI / 2, 0),
  S(-33, 1.5, 0, -Math.PI / 2, 0),
  S(-28, 10.7, -17.5, -Math.PI / 2, 0),
  // Equipo 1 — este
  S(34, 1.5, 10, Math.PI / 2, 1),
  S(34, 1.5, -10, Math.PI / 2, 1),
  S(33, 1.5, 0, Math.PI / 2, 1),
  S(28, 10.7, 17.5, Math.PI / 2, 1),
  // Neutrales (FFA)
  S(0, 1.5, 18, 0, 2),
  S(0, 1.5, -18, Math.PI, 2),
  S(-20, 10.2, -10, 0, 2), // cima Torre A
  S(20, 10.2, -10, 0, 2), // cima Torre C
  S(0, 10.2, 10, Math.PI, 2), // cima Torre B
  S(0, 10.7, -10, Math.PI, 2), // espina central
  S(0, 1.5, 0, 0, 2), // puente central del foso
  S(-24, 1.5, 16, -Math.PI / 2, 2),
  S(24, 1.5, -16, Math.PI / 2, 2),
];

export const KESSLER_REFINERY: MapDef = {
  id: 'kessler-refinery',
  name: 'Refinería Kessler',
  description:
    'Refinería de Etherium fundido. Un foso letal de gravedad baja parte el mapa en dos; las pasarelas altas se alcanzan por ascensores de gravedad cero. Controla las torres o muere en el canal.',
  brushes,
  gravityZones,
  spawns,
  lights: [
    { type: 'ambient', color: 0x2a1e18, intensity: 0.95 },
    { type: 'directional', color: 0xffd9b0, intensity: 1.2, pos: vec3(20, 40, 10) },
    { type: 'point', color: 0xff7733, intensity: 280, pos: vec3(0, 2, 0) },
    { type: 'point', color: 0xff7733, intensity: 160, pos: vec3(-24, 1, 0) },
    { type: 'point', color: 0xff7733, intensity: 160, pos: vec3(24, 1, 0) },
    { type: 'point', color: 0x38e0c8, intensity: 130, pos: vec3(-20, 11.5, -10) },
    { type: 'point', color: 0x38e0c8, intensity: 130, pos: vec3(20, 11.5, -10) },
    { type: 'point', color: 0x38e0c8, intensity: 130, pos: vec3(0, 11.5, 10) },
  ],
  killY: -5,
  skyColor: 0x0a0604,
  fogColor: 0x140b06,
  fogDensity: 0.012,
  recommendedPlayers: [4, 16],
};
