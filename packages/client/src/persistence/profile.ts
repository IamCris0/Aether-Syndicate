import {
  applyXp,
  bpTierFromXp,
  dailyKey,
  dailyMissions,
  weeklyKey,
  weeklyMissions,
  type MissionDef,
} from '@aether/shared';
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
  /** Misiones: progreso por id, reclamadas, y claves de periodo para el reset. */
  missionProgress: Record<string, number>;
  missionClaimed: string[];
  dailyPeriod: string;
  weeklyPeriod: string;
  achievementsClaimed: string[];
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
  missionProgress: {},
  missionClaimed: [],
  dailyPeriod: '',
  weeklyPeriod: '',
  achievementsClaimed: [],
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
  headshots: number;
  grenadeKills: number;
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
  applyMissionResult(profile, result);
  return { levelsGained: applied.levelsGained, tiersGained: bpTierFromXp(profile.bpXp) - prevTier };
}

/** Resetea el progreso de misiones si cambió el día/semana. */
export function ensureMissionPeriods(profile: PlayerProfile): void {
  const today = dailyKey();
  const thisWeek = weeklyKey();
  if (profile.dailyPeriod !== today) {
    profile.dailyPeriod = today;
    for (const id of Object.keys(profile.missionProgress)) {
      if (id.startsWith('d-')) delete profile.missionProgress[id];
    }
    profile.missionClaimed = profile.missionClaimed.filter((id) => !id.startsWith('d-'));
  }
  if (profile.weeklyPeriod !== thisWeek) {
    profile.weeklyPeriod = thisWeek;
    for (const id of Object.keys(profile.missionProgress)) {
      if (id.startsWith('w-')) delete profile.missionProgress[id];
    }
    profile.missionClaimed = profile.missionClaimed.filter((id) => !id.startsWith('w-'));
  }
}

/** Suma el resultado de una partida al progreso de las misiones activas. */
function applyMissionResult(profile: PlayerProfile, result: MatchResult): void {
  ensureMissionPeriods(profile);
  const active: MissionDef[] = [...dailyMissions(), ...weeklyMissions()];
  const gains: Record<string, number> = {
    kills: result.kills,
    assists: result.assists,
    headshots: result.headshots,
    grenadeKills: result.grenadeKills,
    wins: result.won ? 1 : 0,
    matches: result.finished ? 1 : 0,
  };
  for (const mission of active) {
    if (profile.missionClaimed.includes(mission.id)) continue;
    const gain = gains[mission.stat] ?? 0;
    if (gain <= 0) continue;
    profile.missionProgress[mission.id] = Math.min(
      (profile.missionProgress[mission.id] ?? 0) + gain,
      mission.target,
    );
  }
}
