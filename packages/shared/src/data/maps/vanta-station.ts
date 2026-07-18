import { vec3 } from '../../math/vec3.js';
import type { MapBrush, MapDef, SpawnPoint } from './types.js';
import type { GravityZone } from '../../sim/gravity.js';

/**
 * VANTA STATION — buque insignia de los mapas v2.
 *
 * Estación de investigación con estructura de TRES CARRILES (oeste↔este):
 *  - HANGAR (norte): nave de carga con contenedores, combate a media
 *    distancia con mucha cobertura.
 *  - NÚCLEO (centro): laboratorios blancos alrededor del reactor en
 *    GRAVEDAD CERO con plataformas flotantes; entrepiso a y=6 que domina
 *    el carril (control de la altura = control del mapa).
 *  - CUBIERTA (sur): paseo exterior SIN TECHO en gravedad baja, con vistas
 *    a la nebulosa; saltos largos y flanqueos aéreos, rocas como cobertura.
 * Simetría especular en X para equilibrio competitivo 1:1.
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
/** Añade el brush y su espejo en X (mapa simétrico). */
const mirror = (
  x1: number, y1: number, z1: number, x2: number, y2: number, z2: number,
  material: MapBrush['material'] = 'hull',
): void => {
  add(B(x1, y1, z1, x2, y2, z2, material));
  add(B(-x1, y1, z1, -x2, y2, z2, material));
};

// ==== ESTRUCTURA GENERAL (x -42..42, z -24..24) ====
add(B(-42, -1, -24, 42, 0, 24, 'floor')); // suelo completo
add(B(-43, 0, -25, 43, 12, -24, 'hull')); // muro norte
add(B(-43, 0, 24, 43, 12, 25, 'hull')); // muro sur (baranda alta exterior)
add(B(-43, 0, -25, -42, 12, 25, 'hull')); // muro oeste
add(B(42, 0, -25, 43, 12, 25, 'hull')); // muro este
// Techo: cubre hangar y núcleo; la CUBIERTA (z 14..24) queda a cielo abierto.
add(B(-42, 12, -24, 42, 13, 14, 'hull'));

// ==== SEPARADORES DE CARRIL (con 3 puertas cada uno) ====
// Muro hangar/núcleo en z=-8 — puertas en x ±21 y centro.
mirror(-42, 0, -8.5, -25, 8, -8, 'lab');
mirror(-17, 0, -8.5, -4, 8, -8, 'lab');
add(B(-4, 3.4, -8.5, 4, 8, -8, 'lab')); // dintel puerta central
mirror(-25, 3.4, -8.5, -17, 8, -8, 'lab'); // dinteles laterales
// Muro núcleo/cubierta en z=8 — mismas puertas.
mirror(-42, 0, 8, -25, 8, 8.5, 'lab');
mirror(-17, 0, 8, -4, 8, 8.5, 'lab');
add(B(-4, 3.4, 8, 4, 8, 8.5, 'lab'));
mirror(-25, 3.4, 8, -17, 8, 8.5, 'lab');

// ==== HANGAR (z -24..-8) ====
// Contenedores apilados (cobertura media, algunos escalables)
mirror(-36, 0, -20, -30, 2.6, -16, 'container');
mirror(-30, 0, -20, -26, 5.2, -17, 'container'); // doble altura
mirror(-20, 0, -14, -14, 2.6, -11, 'container');
mirror(-10, 0, -22, -4, 2.6, -18, 'container');
add(B(-3, 0, -16, 3, 2.4, -12, 'container')); // contenedor central
// Grúa/viga superior decorativa con colisión (cruce de francotirador)
add(B(-42, 9, -15.5, 42, 10, -14, 'catwalk'));

// ==== NÚCLEO (z -8..8) ====
// Reactor central: columna emisiva dentro del pozo zero-g
add(B(-1.8, 0, -1.8, 1.8, 11, 1.8, 'accent'));
// Plataformas flotantes del pozo (parkour vertical en gravedad cero)
add(B(-6, 3, 2.5, -2.5, 3.5, 6, 'catwalk'));
add(B(2.5, 5.5, -6, 6, 6, -2.5, 'catwalk'));
add(B(-6, 8, -6, -2.5, 8.5, -2.5, 'catwalk'));
add(B(2.5, 8, 2.5, 6, 8.5, 6, 'catwalk'));
// Laboratorios laterales con cristaleras y mesas
mirror(-34, 0, -4, -32, 5, 4, 'glass');
mirror(-28, 0, -1.5, -22, 1.2, 1.5, 'lab');
mirror(-16, 0, -5, -12, 1.4, -2, 'accent');
mirror(-16, 0, 2, -12, 1.4, 5, 'accent');
// ENTREPISO y=6: dos alas que dominan el núcleo, con escaleras
mirror(-42, 6, -8, -24, 6.6, 8, 'catwalk');
// Escaleras al entrepiso (escalones de 1.1) desde el núcleo
mirror(-24, 0, 5, -22, 1.1, 8, 'catwalk');
mirror(-26, 0, 5, -24, 2.2, 8, 'catwalk');
mirror(-28, 0, 5, -26, 3.3, 8, 'catwalk');
mirror(-30, 0, 5, -28, 4.4, 8, 'catwalk');
mirror(-32, 0, 5, -30, 5.5, 8, 'catwalk');
// Barandilla en el borde interior del entrepiso (mirando al núcleo)
mirror(-24.5, 6.6, -8, -24, 7.4, -2, 'catwalk');
mirror(-24.5, 6.6, 2, -24, 7.4, 8, 'catwalk');

// ==== CUBIERTA EXTERIOR (z 8..24, sin techo, gravedad baja) ====
// Rocas de asteroide como cobertura orgánica
mirror(-34, 0, 12, -28, 2.8, 16, 'rock');
mirror(-18, 0, 18, -13, 2, 22, 'rock');
add(B(-4, 0, 14, 4, 2.4, 18, 'rock'));
mirror(-26, 0, 20, -22, 1.6, 23, 'rock');
// Plataforma mirador elevada central (salto flotado para alcanzarla)
add(B(-8, 4.5, 20, 8, 5, 23.5, 'catwalk'));

const gravityZones: GravityZone[] = [
  // El pozo del reactor: gravedad cero, la ruta rápida entre alturas.
  { id: 'reactor-core', kind: 'zero', min: vec3(-7, 0, -7), max: vec3(7, 12, 7), priority: 10 },
  // Toda la cubierta exterior en gravedad baja: saltos largos y aéreos.
  { id: 'observation-deck', kind: 'low', min: vec3(-42, 0, 8.5), max: vec3(42, 14, 24), priority: 5 },
];

const S = (x: number, y: number, z: number, yaw: number, team: 0 | 1 | 2): SpawnPoint => ({
  pos: vec3(x, y, z),
  yaw,
  team,
});

const spawns: SpawnPoint[] = [
  // Equipo 0 — extremo oeste (los tres carriles)
  S(-39, 1.5, -16, -Math.PI / 2, 0),
  S(-39, 1.5, 0, -Math.PI / 2, 0),
  S(-39, 1.5, 18, -Math.PI / 2, 0),
  S(-38, 7.6, 0, -Math.PI / 2, 0), // entrepiso
  // Equipo 1 — extremo este
  S(39, 1.5, -16, Math.PI / 2, 1),
  S(39, 1.5, 0, Math.PI / 2, 1),
  S(39, 1.5, 18, Math.PI / 2, 1),
  S(38, 7.6, 0, Math.PI / 2, 1),
  // Neutrales (FFA)
  S(0, 1.5, -21, Math.PI, 2),
  S(0, 1.5, 11, 0, 2),
  S(-20, 7.6, 4, -Math.PI / 2, 2),
  S(20, 7.6, 4, Math.PI / 2, 2),
  S(0, 6.5, 22, Math.PI, 2), // mirador
  S(-28, 1.5, -12, 0, 2),
  S(28, 1.5, -12, 0, 2),
  S(-10, 1.5, 0, -Math.PI / 2, 2),
  S(10, 1.5, 0, Math.PI / 2, 2),
];

export const VANTA_STATION: MapDef = {
  id: 'vanta-station',
  name: 'Vanta Station',
  description:
    'Estación de investigación de Etherium. Tres carriles: hangar de carga, núcleo del reactor en gravedad cero con entrepiso dominante, y una cubierta exterior a cielo abierto en gravedad baja con vistas a la nebulosa.',
  brushes,
  gravityZones,
  spawns,
  lights: [
    { type: 'ambient', color: 0x2a3448, intensity: 1.0 },
    { type: 'directional', color: 0xcfe2ff, intensity: 1.5, pos: vec3(25, 50, -30) },
    { type: 'point', color: 0x38e0c8, intensity: 260, pos: vec3(0, 7, 0) }, // reactor
    { type: 'point', color: 0xfff2d8, intensity: 140, pos: vec3(-24, 9, -16) },
    { type: 'point', color: 0xfff2d8, intensity: 140, pos: vec3(24, 9, -16) },
    { type: 'point', color: 0x5f8cff, intensity: 150, pos: vec3(0, 9, 18) }, // cubierta
    { type: 'point', color: 0x38e0c8, intensity: 90, pos: vec3(-33, 8, 0) },
    { type: 'point', color: 0x38e0c8, intensity: 90, pos: vec3(33, 8, 0) },
  ],
  killY: -30,
  skyboxUrl: '/assets/skyboxes/nebula-01.jpg',
  skyColor: 0x04070f,
  fogColor: 0x0a1220,
  fogDensity: 0.007,
  recommendedPlayers: [4, 16],
};
