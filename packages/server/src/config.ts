/** Configuración del servidor vía variables de entorno. */
export const CONFIG = {
  port: Number(process.env.PORT ?? 3001),
  /** Orígenes permitidos para CORS (coma-separados). '*' en desarrollo. */
  corsOrigin: process.env.CORS_ORIGIN?.split(',') ?? '*',
  /** Región lógica del servidor (para el futuro selector de regiones). */
  region: process.env.AETHER_REGION ?? 'local',
  /** Ruta opcional al build del cliente para servirlo desde el mismo proceso. */
  clientDist: process.env.CLIENT_DIST ?? '',
} as const;
