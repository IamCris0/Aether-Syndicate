import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase (cuentas en la nube + sincronización del perfil).
 * Si las variables de entorno no están configuradas, el juego funciona
 * exactamente igual en modo local/invitado: TODO el acceso pasa por
 * getSupabase() y tolera null.
 */

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  client = url && key ? createClient(url, key) : null;
  return client;
}
