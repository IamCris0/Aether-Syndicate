import { readFileSync } from 'node:fs';

/**
 * Configuración del servidor vía variables de entorno.
 * En desarrollo, packages/server/.env (gitignored) se carga automáticamente;
 * en producción (Render) las variables se definen en el dashboard.
 */

function loadEnvFile(): void {
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    /* sin .env local: solo variables del entorno */
  }
}
loadEnvFile();

export const CONFIG = {
  port: Number(process.env.PORT ?? 3001),
  /** Orígenes permitidos para CORS (coma-separados). '*' en desarrollo. */
  corsOrigin: process.env.CORS_ORIGIN?.split(',') ?? '*',
  /** Región lógica del servidor (para el futuro selector de regiones). */
  region: process.env.AETHER_REGION ?? 'local',
  /** Ruta opcional al build del cliente para servirlo desde el mismo proceso. */
  clientDist: process.env.CLIENT_DIST ?? '',
  /** Supabase admin (XP autoritativa). Ambas vacías ⇒ progresión solo local. */
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
} as const;
