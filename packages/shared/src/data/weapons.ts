/**
 * Definiciones de armas 100% dirigidas por datos.
 * Añadir un arma nueva = añadir una entrada aquí; ningún sistema
 * (servidor, cliente, HUD, audio) necesita cambios de código.
 */

export type WeaponClass = 'ar' | 'smg' | 'shotgun' | 'sniper' | 'lmg' | 'pistol' | 'melee' | 'grenade';

export interface RecoilPattern {
  /** Retroceso vertical por disparo (radianes). */
  vertical: number;
  /** Retroceso horizontal máximo por disparo (radianes, aleatorio simétrico). */
  horizontal: number;
  /** Velocidad de recuperación (por segundo). */
  recovery: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  class: WeaponClass;
  slot: number;
  damage: number;
  headshotMultiplier: number;
  /** Disparos por segundo. */
  fireRate: number;
  automatic: boolean;
  /** Balas por disparo (escopetas > 1). */
  pellets: number;
  /** Dispersión base (radianes). */
  spread: number;
  spreadAds: number;
  magazineSize: number;
  reserveAmmo: number;
  reloadTimeS: number;
  /** Alcance sin caída de daño (m). */
  range: number;
  /** Daño mínimo a distancia máxima (fracción de `damage`). */
  falloff: number;
  /** Alcance máximo absoluto del hitscan (m). */
  maxRange: number;
  penetration: number;
  recoil: RecoilPattern;
  /** Velocidad de proyectil (m/s). 0 = hitscan. Preparado para balística real. */
  projectileSpeed: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  'ar-vanguard': {
    id: 'ar-vanguard',
    name: 'VG-77 Vanguard',
    class: 'ar',
    slot: 0,
    damage: 26,
    headshotMultiplier: 1.6,
    fireRate: 10,
    automatic: true,
    pellets: 1,
    spread: 0.012,
    spreadAds: 0.003,
    magazineSize: 30,
    reserveAmmo: 120,
    reloadTimeS: 2.1,
    range: 40,
    falloff: 0.6,
    maxRange: 300,
    penetration: 1,
    recoil: { vertical: 0.006, horizontal: 0.003, recovery: 6 },
    projectileSpeed: 0,
  },
  'smg-wisp': {
    id: 'smg-wisp',
    name: 'K9 Wisp',
    class: 'smg',
    slot: 0,
    damage: 19,
    headshotMultiplier: 1.4,
    fireRate: 15,
    automatic: true,
    pellets: 1,
    spread: 0.02,
    spreadAds: 0.008,
    magazineSize: 34,
    reserveAmmo: 170,
    reloadTimeS: 1.7,
    range: 20,
    falloff: 0.5,
    maxRange: 200,
    penetration: 0,
    recoil: { vertical: 0.004, horizontal: 0.004, recovery: 8 },
    projectileSpeed: 0,
  },
  'shotgun-breaker': {
    id: 'shotgun-breaker',
    name: 'M8 Breaker',
    class: 'shotgun',
    slot: 0,
    damage: 12,
    headshotMultiplier: 1.2,
    fireRate: 1.4,
    automatic: false,
    pellets: 8,
    spread: 0.05,
    spreadAds: 0.035,
    magazineSize: 6,
    reserveAmmo: 30,
    reloadTimeS: 2.8,
    range: 8,
    falloff: 0.2,
    maxRange: 40,
    penetration: 0,
    recoil: { vertical: 0.03, horizontal: 0.008, recovery: 4 },
    projectileSpeed: 0,
  },
  'sniper-longshot': {
    id: 'sniper-longshot',
    name: 'AX-1 Longshot',
    class: 'sniper',
    slot: 0,
    damage: 95,
    headshotMultiplier: 2,
    fireRate: 0.9,
    automatic: false,
    pellets: 1,
    spread: 0.03,
    spreadAds: 0.0005,
    magazineSize: 5,
    reserveAmmo: 25,
    reloadTimeS: 3.2,
    range: 150,
    falloff: 0.85,
    maxRange: 600,
    penetration: 2,
    recoil: { vertical: 0.05, horizontal: 0.01, recovery: 3 },
    projectileSpeed: 0,
  },
  'lmg-bulwark': {
    id: 'lmg-bulwark',
    name: 'HX Bulwark',
    class: 'lmg',
    slot: 0,
    damage: 24,
    headshotMultiplier: 1.4,
    fireRate: 11,
    automatic: true,
    pellets: 1,
    spread: 0.022,
    spreadAds: 0.009,
    magazineSize: 75,
    reserveAmmo: 225,
    reloadTimeS: 4.2,
    range: 45,
    falloff: 0.65,
    maxRange: 350,
    penetration: 2,
    recoil: { vertical: 0.007, horizontal: 0.005, recovery: 5 },
    projectileSpeed: 0,
  },
  'pistol-nomad': {
    id: 'pistol-nomad',
    name: 'P2 Nomad',
    class: 'pistol',
    slot: 1,
    damage: 30,
    headshotMultiplier: 1.7,
    fireRate: 5,
    automatic: false,
    pellets: 1,
    spread: 0.01,
    spreadAds: 0.004,
    magazineSize: 12,
    reserveAmmo: 60,
    reloadTimeS: 1.5,
    range: 25,
    falloff: 0.5,
    maxRange: 150,
    penetration: 0,
    recoil: { vertical: 0.012, horizontal: 0.004, recovery: 7 },
    projectileSpeed: 0,
  },
  // Pseudo-arma: identifica a las granadas en killfeed y estadísticas.
  'grenade-frag': {
    id: 'grenade-frag',
    name: 'Granada de fragmentación',
    class: 'grenade',
    slot: -1,
    damage: 110,
    headshotMultiplier: 1,
    fireRate: 1,
    automatic: false,
    pellets: 1,
    spread: 0,
    spreadAds: 0,
    magazineSize: 0,
    reserveAmmo: 0,
    reloadTimeS: 0,
    range: 6,
    falloff: 0,
    maxRange: 6,
    penetration: 0,
    recoil: { vertical: 0, horizontal: 0, recovery: 0 },
    projectileSpeed: 18,
  },
  'knife-fang': {
    id: 'knife-fang',
    name: 'Fang',
    class: 'melee',
    slot: 2,
    damage: 75,
    headshotMultiplier: 1,
    fireRate: 1.6,
    automatic: false,
    pellets: 1,
    spread: 0,
    spreadAds: 0,
    magazineSize: 0,
    reserveAmmo: 0,
    reloadTimeS: 0,
    range: 2.2,
    falloff: 1,
    maxRange: 2.2,
    penetration: 0,
    recoil: { vertical: 0, horizontal: 0, recovery: 10 },
    projectileSpeed: 0,
  },
};

export const DEFAULT_LOADOUT: string[] = ['ar-vanguard', 'pistol-nomad', 'knife-fang'];

/** Orden de armas para el modo Gun Game. */
export const GUNGAME_ORDER: string[] = [
  'pistol-nomad',
  'smg-wisp',
  'shotgun-breaker',
  'ar-vanguard',
  'lmg-bulwark',
  'sniper-longshot',
  'knife-fang',
];

export const getWeapon = (id: string): WeaponDef => WEAPONS[id] ?? WEAPONS['ar-vanguard'];
