import { getSupabase } from '../services/supabase.js';
import type { PlayerProfile } from './profile.js';

/**
 * Sincronización del perfil con Supabase (tabla `profiles`, RLS por usuario).
 * IndexedDB sigue siendo la caché offline y la única fuente para invitados;
 * con sesión iniciada, cada guardado local se replica a la nube (debounced)
 * y al iniciar sesión se resuelve el conflicto local↔nube.
 */

export interface CloudRecord {
  profile: PlayerProfile;
  username: string | null;
}

export async function fetchCloudRecord(userId: string): Promise<CloudRecord | null> {
  const supa = getSupabase();
  if (!supa) return null;
  const { data, error } = await supa
    .from('profiles')
    .select('data, username')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return { profile: data.data as PlayerProfile, username: (data.username as string | null) ?? null };
}

/**
 * Reclama un nombre de usuario único (índice UNIQUE case-insensitive).
 * 'taken' si otro usuario ya lo tiene; el perfil viaja en el mismo upsert.
 */
export async function claimUsername(
  userId: string,
  username: string,
  profile: PlayerProfile,
): Promise<'ok' | 'taken' | 'error'> {
  const supa = getSupabase();
  if (!supa) return 'error';
  const { error } = await supa
    .from('profiles')
    .upsert({ user_id: userId, username, data: profile, updated_at: new Date().toISOString() });
  if (!error) return 'ok';
  return error.code === '23505' ? 'taken' : 'error';
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Sube el perfil (debounced 2 s). GUARDA ANTI-PISADO: el servidor escribe
 * la progresión (level/xp/bpXp/stats) con autoridad, así que antes de subir
 * se adopta la progresión de la nube si va por delante — el cliente nunca
 * puede "retroceder" lo que otorgó el servidor.
 */
export function pushCloudProfile(userId: string, profile: PlayerProfile): void {
  const supa = getSupabase();
  if (!supa) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void (async () => {
      const cloud = await fetchCloudRecord(userId);
      if (cloud && cloud.profile.bpXp > profile.bpXp) {
        profile.level = cloud.profile.level;
        profile.xp = cloud.profile.xp;
        profile.bpXp = cloud.profile.bpXp;
        profile.stats = cloud.profile.stats;
      }
      const { error } = await supa
        .from('profiles')
        .upsert({ user_id: userId, data: profile, updated_at: new Date().toISOString() });
      if (error) console.warn('[cloud] no se pudo sincronizar el perfil:', error.message);
    })();
  }, 2000);
}

/**
 * Resuelve local vs nube al iniciar sesión: gana el que tenga más XP total
 * de pase (proxy monótono del progreso). El perdedor se sobreescribe.
 */
export function resolveProfiles(local: PlayerProfile, cloud: PlayerProfile | null): PlayerProfile {
  if (!cloud) return local;
  return cloud.bpXp >= local.bpXp ? { ...local, ...cloud } : local;
}
