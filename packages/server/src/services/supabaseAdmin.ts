import { applyXp, type PlayerSnapshot } from '@aether/shared';
import { CONFIG } from '../config.js';

/**
 * Acceso ADMIN a Supabase desde el servidor de juego (service role key).
 * - verifyAccessToken: valida el JWT de sesión que envía el cliente al
 *   unirse y devuelve su user id real (nunca se confía en un id del cliente).
 * - grantMatchResult: escribe el progreso (XP/nivel/pase/stats) con
 *   autoridad del servidor — el cliente NO puede trucar su progresión.
 * Si las variables de entorno no están configuradas, todo degrada a no-op
 * y el juego funciona igual (progresión local como hasta ahora).
 */

const enabled = (): boolean => !!(CONFIG.supabaseUrl && CONFIG.supabaseServiceKey);

const adminHeaders = (): Record<string, string> => ({
  apikey: CONFIG.supabaseServiceKey,
  Authorization: `Bearer ${CONFIG.supabaseServiceKey}`,
  'Content-Type': 'application/json',
});

export function supabaseAdminEnabled(): boolean {
  return enabled();
}

/** Valida el token de sesión de un cliente. Devuelve su user id o null. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  if (!enabled() || !token) return null;
  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/user`, {
      headers: { apikey: CONFIG.supabaseServiceKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
}

export interface MatchGrant {
  xp: number;
  kills: number;
  deaths: number;
  assists: number;
  won: boolean;
  finished: boolean;
}

/**
 * Aplica el resultado de una partida al perfil en la nube (merge seguro:
 * solo toca los campos de progresión; los cosméticos/misiones del cliente
 * se conservan tal cual).
 */
export async function grantMatchResult(userId: string, grant: MatchGrant): Promise<void> {
  if (!enabled()) return;
  try {
    const url = `${CONFIG.supabaseUrl}/rest/v1/profiles?user_id=eq.${userId}&select=data`;
    const res = await fetch(url, { headers: adminHeaders(), signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`fetch profile ${res.status}`);
    const rows = (await res.json()) as Array<{ data: Record<string, unknown> }>;
    if (rows.length === 0) return; // aún sin perfil en nube: el cliente lo creará

    const data = rows[0].data;
    const applied = applyXp(Number(data.level ?? 1), Number(data.xp ?? 0), grant.xp);
    data.level = applied.level;
    data.xp = applied.xp;
    data.bpXp = Number(data.bpXp ?? 0) + grant.xp;
    const stats = (data.stats ?? {}) as Record<string, number>;
    stats.kills = Number(stats.kills ?? 0) + grant.kills;
    stats.deaths = Number(stats.deaths ?? 0) + grant.deaths;
    stats.assists = Number(stats.assists ?? 0) + grant.assists;
    if (grant.finished) stats.matches = Number(stats.matches ?? 0) + 1;
    if (grant.won) stats.wins = Number(stats.wins ?? 0) + 1;
    data.stats = stats;

    const patch = await fetch(`${CONFIG.supabaseUrl}/rest/v1/profiles?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    });
    if (!patch.ok) throw new Error(`patch profile ${patch.status}`);
  } catch (err) {
    console.warn(`[xp] no se pudo escribir el progreso de ${userId}:`, (err as Error).message);
  }
}

export type { PlayerSnapshot };
