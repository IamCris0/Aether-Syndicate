import { applyXp, bpTierFromXp } from '@aether/shared';
import { kvGet, kvSet } from './storage.js';

/**
 * Perfil del jugador: progresión, pase de batalla, loadout y estadísticas.
 * v0: persistido en IndexedDB (modo invitado / offline). En fase 2 esta misma
 * estructura se sincroniza con Supabase — la UI no cambia, solo el backend.
 */

export interface PlayerProfile {
  /** Identidad estable del invitado (o user id de Supabase en fase 2). */
  userId: string;
  level: number;
  /** XP acumulada dentro del nivel actual. */
  xp: number;
  /** XP total del pase de batalla (tier = bpXp / BP_XP_PER_TIER). */
  bpXp: number;
  /** Tiers del pase ya reclamados. */
  claimedTiers: number[];
  equippedTitle: string | null;
  equippedCrosshair: string | null;
  equippedEmblem: string | null;
  /** Skin de arma equipada (id de recompensa del pase). */
  equippedSkin: string | null;
  /** Arma primaria elegida en la armería. */
  loadoutPrimary: string;
  stats: {
    kills: number;
    deaths: number;
    assists: number;
    wins: number;
    matches: number;
  };
}

export const DEFAULT_PROFILE: PlayerProfile = {
  userId: '',
  level: 1,
  xp: 0,
  bpXp: 0,
  claimedTiers: [],
  equippedTitle: null,
  equippedCrosshair: null,
  equippedEmblem: null,
  equippedSkin: null,
  loadoutPrimary: 'ar-vanguard',
  stats: { kills: 0, deaths: 0, assists: 0, wins: 0, matches: 0 },
};

export async function loadProfile(): Promise<PlayerProfile> {
  try {
    const saved = await kvGet<Partial<PlayerProfile>>('profile');
    const profile = { ...DEFAULT_PROFILE, ...saved, stats: { ...DEFAULT_PROFILE.stats, ...saved?.stats } };
    if (!profile.userId) {
      profile.userId = crypto.randomUUID();
      await saveProfile(profile);
    }
    return profile;
  } catch {
    return { ...DEFAULT_PROFILE, userId: crypto.randomUUID() };
  }
}

export async function saveProfile(profile: PlayerProfile): Promise<void> {
  try {
    await kvSet('profile', profile);
  } catch {
    /* sin IndexedDB (incógnito): el progreso vive solo en memoria */
  }
}

export interface MatchResult {
  xp: number;
  kills: number;
  deaths: number;
  assists: number;
  won: boolean;
  finished: boolean;
}

/** Aplica el resultado de una partida al perfil (cuenta + pase). Muta y devuelve niveles ganados. */
export function bankMatchResult(profile: PlayerProfile, result: MatchResult): { levelsGained: number; tiersGained: number } {
  const prevTier = bpTierFromXp(profile.bpXp);
  const applied = applyXp(profile.level, profile.xp, result.xp);
  profile.level = applied.level;
  profile.xp = applied.xp;
  profile.bpXp += result.xp;
  profile.stats.kills += result.kills;
  profile.stats.deaths += result.deaths;
  profile.stats.assists += result.assists;
  if (result.finished) profile.stats.matches += 1;
  if (result.won) profile.stats.wins += 1;
  return { levelsGained: applied.levelsGained, tiersGained: bpTierFromXp(profile.bpXp) - prevTier };
}
