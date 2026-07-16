/**
 * Capa de autenticación desacoplada del juego.
 *
 * v0: solo GuestAuthProvider (identidad estable persistida localmente).
 * Fase 2: SupabaseAuthProvider implementará esta MISMA interfaz con
 * Google/Discord/GitHub/Apple — el resto del cliente no cambia, porque
 * todo consume `Identity`, nunca el proveedor concreto.
 */

export interface Identity {
  provider: 'guest' | 'google' | 'discord' | 'steam' | 'epic' | 'github' | 'apple';
  userId: string;
  displayName: string;
}

export interface AuthProvider {
  readonly id: Identity['provider'];
  readonly label: string;
  /** false ⇒ el botón se muestra deshabilitado con `unavailableReason`. */
  readonly available: boolean;
  readonly unavailableReason?: string;
  signIn(displayName?: string): Promise<Identity>;
}

class GuestAuthProvider implements AuthProvider {
  readonly id = 'guest' as const;
  readonly label = 'Invitado';
  readonly available = true;

  async signIn(displayName?: string): Promise<Identity> {
    return {
      provider: 'guest',
      userId: '', // el userId estable vive en el perfil (profile.userId)
      displayName: displayName || `Recluta-${Math.floor(Math.random() * 9000 + 1000)}`,
    };
  }
}

/** Proveedores planificados: se activan al configurar Supabase Auth (fase 2). */
const PLANNED = ['google', 'discord', 'steam', 'epic', 'github', 'apple'] as const;

export const guestAuth: AuthProvider = new GuestAuthProvider();

export const plannedProviders: ReadonlyArray<{ id: string; reason: string }> = PLANNED.map((id) => ({
  id,
  reason: 'Requiere Supabase Auth — planificado en docs/ROADMAP.md fase 2.',
}));
