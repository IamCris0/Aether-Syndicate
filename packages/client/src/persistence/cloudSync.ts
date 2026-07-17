import { getSupabase } from '../services/supabase.js';
import type { PlayerProfile } from './profile.js';

/**
 * Sincronización del perfil con Supabase (tabla `profiles`, RLS por usuario).
 * IndexedDB sigue siendo la caché offline y la única fuente para invitados;
 * con sesión iniciada, cada guardado local se replica a la nube (debounced)
 * y al iniciar sesión se resuelve el conflicto local↔nube.
 */

export async function fetchCloudProfile(userId: string): Promise<PlayerProfile | null> {
  const supa = getSupabase();
  if (!supa) return null;
  const { data, error } = await supa
    .from('profiles')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.data as PlayerProfile;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** Sube el perfil (debounced 2 s para no spamear en rachas de guardado). */
export function pushCloudProfile(userId: string, profile: PlayerProfile): void {
  const supa = getSupabase();
  if (!supa) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void supa
      .from('profiles')
      .upsert({ user_id: userId, data: profile, updated_at: new Date().toISOString() })
      .then(({ error }) => {
        if (error) console.warn('[cloud] no se pudo sincronizar el perfil:', error.message);
      });
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
