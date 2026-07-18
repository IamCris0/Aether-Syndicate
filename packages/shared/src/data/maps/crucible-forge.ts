import { vec3 } from '../../math/vec3.js';
import type { MapBrush, MapDef, SpawnPoint } from './types.js';
import type { GravityZone } from '../../sim/gravity.js';

/**
 * CRUCIBLE FORGE — fundición orbital de Etherium.
 *
 * Un RÍO DE METAL FUNDIDO (letal) parte el mapa de norte a sur; se cruza
 * por tres puentes o por la espina superior. Dos naves de fundición
 * simétricas con crisoles gigantes como cobertura dura, un anillo de
 * pasarelas a y=8 al que se sube por ASCENSORES DE GRAVEDAD CERO, y el
 * CONDUCTO INVERTIDO de mantenimiento en el muro norte: caes al techo y
 * flanqueas boca abajo. Paleta cálida: naranjas de forja contra el teal.
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

const brushes: MapBrush[] = [];
const add = (b: MapBrush): void => { brushes.push(b); };
/** Añade el brush y su espejo en X (naves de fundición gemelas). */
const mirror = (
  x1: number, y1: number, z1: number, x2: number, y2: number, z2: number,
  material: MapBrush['material'] = 'hull',
): void => {
  add(B(x1, y1, z1, x2, y2, z2, material));
  add(B(-x1, y1, z1, -x2, y2, z2, material));
};

// ==== ESTRUCTURA (x -38..38, z -22..22) ====
// Suelo en dos mitades: el canal de lava x -3..3 queda abierto.
add(B(-38, -1, -22, -3, 0, 22, 'floor'));
add(B(3, -1, -22, 38, 0, 22, 'floor'));
// Río de metal fundido (visual, bajo el killY)
add(B(-3, -6, -22, 3, -5.4, 22, 'molten'));
// Perímetro y techo
add(B(-38, 0, -23, 38, 14, -22, 'hull'));
add(B(-38, 0, 22, 38, 14, 23, 'hull'));
add(B(-39, 0, -23, -38, 14, 23, 'hull'));
add(B(38, 0, -23, 39, 14, 23, 'hull'));
add(B(-38, 14, -22, 38, 15, 22, 'hull'));

// ==== PUENTES sobre la lava (norte, centro, sur) ====
add(B(-3, -1, -13.5, 3, 0, -10.5, 'catwalk'));
add(B(-3, -1, -1.5, 3, 0, 1.5, 'catwalk'));
add(B(-3, -1, 10.5, 3, 0, 13.5, 'catwalk'));

// ==== NAVES DE FUNDICIÓN (crisoles y cobertura, espejadas) ====
// Crisoles gigantes (torres de 9 con borde transitable)
mirror(-30, 0, -14, -22, 9, -6, 'container');
mirror(-30, 0, 6, -22, 9, 14, 'container');
// Canaletas de colada desde los crisoles hacia el río (rampas visuales bajas)
mirror(-22, 0.8, -11.5, -8, 1.4, -8.5, 'accent');
mirror(-22, 0.8, 8.5, -8, 1.4, 11.5, 'accent');
// Cobertura de suelo: bloques de escoria y contenedores
mirror(-16, 0, -3, -12, 1.8, 3, 'rock');
mirror(-9, 0, -18, -5, 1.5, -15, 'container');
mirror(-9, 0, 15, -5, 1.5, 18, 'container');
mirror(-34, 0, -2, -32, 2.2, 2, 'rock');
// Pilares estructurales
mirror(-19, 0, -19, -17, 8, -17, 'hull');
mirror(-19, 0, 17, -17, 8, 19, 'hull');

// ==== ANILLO SUPERIOR (y=8) ====
mirror(-36, 8, -18, -33, 8.6, 18, 'catwalk'); // laterales oeste/este
add(B(-33, 8, -18, 33, 8.6, -15, 'catwalk')); // norte
add(B(-33, 8, 15, 33, 8.6, 18, 'catwalk')); // sur
// Espina central sobre la lava (cruce alto, muy expuesto)
add(B(-1, 8, -15, 1, 8.6, 15, 'catwalk'));
// Conectores del anillo a las cimas de los crisoles
mirror(-27, 8, -6, -25, 8.6, 6, 'catwalk');

// ==== CONDUCTO INVERTIDO (muro norte, y techo como suelo) ====
// Franja de acceso señalizada en el suelo (entrar = caer al techo)
add(B(-14, 0, -21.9, 14, 0.05, -19.5, 'accent'));

const gravityZones: GravityZone[] = [
  // Ascensores de gravedad cero (esquinas NO y SE) → anillo superior.
  { id: 'lift-nw', kind: 'zero', min: vec3(-37, 0, -21), max: vec3(-33.5, 9.5, -18), priority: 10 },
  { id: 'lift-se', kind: 'zero', min: vec3(33.5, 0, 18), max: vec3(37, 9.5, 21), priority: 10 },
  // El río: gravedad baja sobre la lava — saltos flotados, caída dramática.
  { id: 'molten-river', kind: 'low', min: vec3(-3.5, -4, -22), max: vec3(3.5, 5, 22), priority: 5 },
  // CONDUCTO INVERTIDO: flanqueo boca abajo pegado al muro norte.
  { id: 'inverted-duct', kind: 'inverted', min: vec3(-14, 0, -22), max: vec3(14, 14, -19.5), priority: 8 },
];

const S = (x: number, y: number, z: number, yaw: number, team: 0 | 1 | 2): SpawnPoint => ({
  pos: vec3(x, y, z),
  yaw,
  team,
});

const spawns: SpawnPoint[] = [
  // Equipo 0 — nave oeste
  S(-34, 1.5, -10, -Math.PI / 2, 0),
  S(-34, 1.5, 10, -Math.PI / 2, 0),
  S(-35, 1.5, 0, -Math.PI / 2, 0),
  S(-34.5, 9.7, 0, -Math.PI / 2, 0), // anillo
  // Equipo 1 — nave este
  S(34, 1.5, 10, Math.PI / 2, 1),
  S(34, 1.5, -10, Math.PI / 2, 1),
  S(35, 1.5, 0, Math.PI / 2, 1),
  S(34.5, 9.7, 0, Math.PI / 2, 1),
  // Neutrales (FFA)
  S(0, 1.5, -18, Math.PI, 2),
  S(0, 1.5, 18, 0, 2),
  S(-26, 10.2, -10, 0, 2), // cima crisol NO
  S(26, 10.2, 10, Math.PI, 2), // cima crisol SE
  S(0, 9.7, 0, 0, 2), // espina central
  S(-14, 1.5, 0, -Math.PI / 2, 2),
  S(14, 1.5, 0, Math.PI / 2, 2),
  S(0, 1.5, 0, 0, 2), // puente central
];

export const CRUCIBLE_FORGE: MapDef = {
  id: 'crucible-forge',
  name: 'Crucible Forge',
  description:
    'Fundición orbital de Etherium. Un río de metal fundido letal parte el mapa en dos; crisoles gigantes, un anillo alto al que se sube en ascensores de gravedad cero y un conducto invertido para flanquear caminando por el techo.',
  brushes,
  gravityZones,
  spawns,
  lights: [
    { type: 'ambient', color: 0x2c201a, intensity: 1.0 },
    { type: 'directional', color: 0xffd9b0, intensity: 1.1, pos: vec3(15, 40, 10) },
    { type: 'point', color: 0xff7733, intensity: 320, pos: vec3(0, 3, 0) }, // lava centro
    { type: 'point', color: 0xff7733, intensity: 200, pos: vec3(0, 3, -14) },
    { type: 'point', color: 0xff7733, intensity: 200, pos: vec3(0, 3, 14) },
    { type: 'point', color: 0xffa640, intensity: 130, pos: vec3(-26, 11, 0) },
    { type: 'point', color: 0xffa640, intensity: 130, pos: vec3(26, 11, 0) },
    { type: 'point', color: 0x38e0c8, intensity: 120, pos: vec3(0, 12, -18) }, // conducto
  ],
  killY: -4,
  skyColor: 0x0a0604,
  fogColor: 0x160c05,
  fogDensity: 0.011,
  recommendedPlayers: [4, 16],
};
