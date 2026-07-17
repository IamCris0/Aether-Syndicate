# Desplegar Aether Syndicate (enlace compartible)

Modelo **mono-servicio**: el servidor Node sirve el cliente compilado y el
Socket.IO en la misma URL. Una sola app en Render = un enlace para tus amigos.

## 1. Sube el repo a GitHub (una vez)

1. Crea un repo vacío en https://github.com/new (ej. `aether-syndicate`, sin README).
2. En la carpeta del proyecto:
   ```powershell
   git remote add origin https://github.com/TU_USUARIO/aether-syndicate.git
   git push -u origin main
   ```
   (Windows abrirá el navegador para autenticarte la primera vez.)

## 2. Despliega en Render (gratis)

1. Crea cuenta en https://render.com (puedes entrar con GitHub).
2. **New → Blueprint** → selecciona tu repo → Render lee `render.yaml`
   y crea el servicio solo → **Apply**.
3. Espera el primer build (~2-3 min). Tu juego queda en
   `https://aether-syndicate.onrender.com` (o similar). **Ese es el enlace.**

> Plan free de Render: el servicio se "duerme" tras 15 min sin tráfico y
> tarda ~30-60 s en despertar con la primera visita. Suficiente para jugar
> con amigos; para partidas serias, el plan Starter elimina el sleep.

## 3. Autoriza la URL de producción en Supabase (para Google login)

Dashboard de Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://TU-APP.onrender.com`
- **Redirect URLs**: añade `https://TU-APP.onrender.com` (mantén también `http://localhost:5173`)

## Actualizar el juego desplegado

Cada `git push` a `main` redespliega automáticamente.

## Alternativa: cliente y servidor separados

Si más adelante quieres el cliente en CDN (Vercel/Netlify/Cloudflare Pages):
publica `packages/client/dist` como sitio estático con la variable
`VITE_SERVER_URL=https://TU-SERVIDOR` y despliega solo el servidor en Render.
El código ya lo soporta sin cambios.
