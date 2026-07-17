/**
 * Sistema de progresión data-driven: XP, niveles de cuenta y pase de batalla.
 * Igual que armas/modos/mapas: añadir recompensas o cambiar curvas es editar
 * datos, no sistemas. El cálculo vive aquí para que cliente y (futuro)
 * backend Supabase apliquen exactamente las mismas reglas.
 */

// ---------------------------------------------------------------- XP

export const XP_PER_KILL = 100;
export const XP_HEADSHOT_BONUS = 25;
export const XP_PER_ASSIST = 50;
export const XP_MATCH_WIN = 500;
export const XP_MATCH_COMPLETE = 150;

export const MAX_LEVEL = 100;

/** XP necesaria para pasar del nivel `level` al siguiente. */
export const xpToNextLevel = (level: number): number => 800 + (level - 1) * 220;

/** Aplica XP a (nivel, xp actual) y devuelve el estado resultante. */
export function applyXp(level: number, xp: number, earned: number): { level: number; xp: number; levelsGained: number } {
  let lv = level;
  let acc = xp + earned;
  let gained = 0;
  while (lv < MAX_LEVEL && acc >= xpToNextLevel(lv)) {
    acc -= xpToNextLevel(lv);
    lv++;
    gained++;
  }
  if (lv >= MAX_LEVEL) acc = Math.min(acc, xpToNextLevel(MAX_LEVEL));
  return { level: lv, xp: acc, levelsGained: gained };
}

// ---------------------------------------------------------------- Pase de batalla

export const BATTLEPASS_TIERS = 100;
/** XP de pase necesaria por nivel (lineal; la XP de partida alimenta ambos). */
export const BP_XP_PER_TIER = 1000;

export const bpTierFromXp = (bpXp: number): number =>
  Math.min(Math.floor(bpXp / BP_XP_PER_TIER), BATTLEPASS_TIERS);

export type RewardType = 'title' | 'crosshair' | 'emblem' | 'skin' | 'operator';

export interface BattlePassReward {
  tier: number;
  type: RewardType;
  id: string;
  name: string;
  /** título → texto, crosshair → color CSS, emblem → símbolo. */
  value: string;
  /** true = track premium (aún no activado; el pase actual es 100% gratis). */
  premium: boolean;
}

const R = (tier: number, type: RewardType, id: string, name: string, value: string): BattlePassReward =>
  ({ tier, type, id, name, value, premium: false });

/** Recompensas del pase — temporada 0 "Órbita Cero". */
export const BATTLEPASS_REWARDS: BattlePassReward[] = [
  R(1, 'title', 'title-recruit', 'Recluta', 'Recluta'),
  R(5, 'crosshair', 'ch-aether', 'Retícula Aether', '#38e0c8'),
  R(8, 'operator', 'op-aurum', 'Operador: Aurum', '#ffd24a'),
  R(10, 'title', 'title-syndicate', 'Recluta del Sindicato', 'Recluta del Sindicato'),
  R(12, 'skin', 'skin-ember', 'Camuflaje Ámbar', '#ff7733'),
  R(15, 'crosshair', 'ch-gold', 'Retícula Dorada', '#ffd24a'),
  R(20, 'emblem', 'em-diamond', 'Emblema Etherium', '◆'),
  R(25, 'title', 'title-gravbreaker', 'Rompegravedad', 'Rompegravedad'),
  R(28, 'skin', 'skin-crimson', 'Camuflaje Carmesí', '#ff4d5e'),
  R(30, 'crosshair', 'ch-crimson', 'Retícula Carmesí', '#ff4d5e'),
  R(33, 'operator', 'op-nova', 'Operador: Nova', '#a97fff'),
  R(35, 'emblem', 'em-hex', 'Emblema Hexágono', '⬡'),
  R(40, 'title', 'title-orbital', 'Veterano Orbital', 'Veterano Orbital'),
  R(45, 'crosshair', 'ch-violet', 'Retícula Violeta', '#a97fff'),
  R(48, 'skin', 'skin-gold', 'Camuflaje Dorado', '#ffd24a'),
  R(50, 'emblem', 'em-star', 'Emblema Estelar', '✦'),
  R(55, 'title', 'title-etherium', 'Agente de Etherium', 'Agente de Etherium'),
  R(58, 'operator', 'op-tundra', 'Operador: Tundra', '#7dffb2'),
  R(60, 'crosshair', 'ch-mint', 'Retícula Menta', '#7dffb2'),
  R(68, 'skin', 'skin-violet', 'Camuflaje Violeta', '#a97fff'),
  R(70, 'title', 'title-gravlord', 'Señor de la Gravedad', 'Señor de la Gravedad'),
  R(75, 'emblem', 'em-comet', 'Emblema Cometa', '☄'),
  R(78, 'operator', 'op-umbra', 'Operador: Umbra', '#ff7733'),
  R(80, 'crosshair', 'ch-ember', 'Retícula Ámbar', '#ff9d3c'),
  R(88, 'skin', 'skin-arctic', 'Camuflaje Ártico', '#d8e2ee'),
  R(90, 'title', 'title-voidlegend', 'Leyenda del Vacío', 'Leyenda del Vacío'),
  R(100, 'title', 'title-prime', 'AETHER PRIME', 'AETHER PRIME'),
];

export const rewardAtTier = (tier: number): BattlePassReward | undefined =>
  BATTLEPASS_REWARDS.find((r) => r.tier === tier);
