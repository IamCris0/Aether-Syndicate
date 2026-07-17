# Supabase — cuentas y perfil en la nube

El cliente ya está conectado a tu proyecto (`packages/client/.env`). Faltan
**dos pasos únicos en el dashboard** para activarlo todo:

## 1. Crear la tabla de perfiles (obligatorio)

Dashboard → **SQL Editor** → pega el contenido de [`supabase/schema.sql`](../supabase/schema.sql) → **Run**.

Crea la tabla `profiles` (un JSON por usuario) con **Row Level Security**:
cada usuario solo puede leer/escribir su propia fila. La anon key del
cliente no puede tocar nada más.

## 2. Activar Google como proveedor (para el botón de Google)

1. Dashboard → **Authentication → Providers → Google** → Enable.
2. Necesitas un OAuth Client de Google Cloud (
   [console.cloud.google.com](https://console.cloud.google.com) →
   APIs & Services → Credentials → Create OAuth client ID → Web application):
   - **Authorized redirect URI**: `https://dedoiaptbvknnfidqrko.supabase.co/auth/v1/callback`
3. Copia el Client ID y el Client Secret en el provider de Supabase.
4. En **Authentication → URL Configuration**, añade a *Redirect URLs*:
   - `http://localhost:5173` (desarrollo)
   - la URL de producción cuando despliegues el cliente

## Cómo funciona en el juego

- **Invitado**: todo local en IndexedDB, como siempre. Cero dependencia de red.
- **Google**: al iniciar sesión, el perfil local y el de la nube se comparan
  y **gana el de mayor progreso** (XP de pase); a partir de ahí, cada
  guardado local se replica a la nube con debounce de 2 s. La sesión se
  restaura sola al recargar (entras directo al lobby).
- Sin `.env` configurado, el botón de Google queda deshabilitado y nada más cambia.

## Pendiente (anti-cheat de progresión)

La XP la calcula hoy el cliente. El siguiente paso de seguridad es que el
SERVIDOR de juego escriba la XP con la service-role key (o via Edge
Function) para que el progreso no sea manipulable. Está anotado en el
roadmap de la fase 3.
