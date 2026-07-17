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

## Opción B: cliente en Vercel + servidor en Render

Vercel es serverless: **no puede alojar el servidor del juego** (WebSockets
persistentes), pero sirve el cliente desde su CDN global — más rápido y con
mejor URL. El repo ya incluye `vercel.json` con todo configurado.

1. Despliega primero el servidor en Render (pasos de arriba). Apunta la URL,
   p. ej. `https://aether-syndicate.onrender.com`.
2. En https://vercel.com → **Add New → Project** → importa tu repo de GitHub.
   Vercel detecta `vercel.json` (build del cliente + carpeta de salida).
3. Antes del deploy, en **Environment Variables** añade las tres:
   | Variable | Valor |
   |---|---|
   | `VITE_SERVER_URL` | `https://TU-APP.onrender.com` (tu servidor Render) |
   | `VITE_SUPABASE_URL` | `https://dedoiaptbvknnfidqrko.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | (tu anon key) |
4. **Deploy**. Tu enlace queda en `https://TU-PROYECTO.vercel.app`.
5. En Supabase → Authentication → URL Configuration, añade también la URL
   de Vercel a las **Redirect URLs** (y como Site URL si será la principal).

Puedes tener AMBAS URLs vivas a la vez apuntando al mismo servidor de
Render: la de Vercel como principal (rápida, sin sleep del cliente) y la de
Render como respaldo todo-en-uno. Nota: aunque el cliente cargue al
instante desde Vercel, la PRIMERA partida tras 15 min de inactividad
seguirá esperando ~30-60 s a que el servidor de Render despierte.

Netlify y Cloudflare Pages funcionan igual: build
`npm run build -w @aether/client`, salida `packages/client/dist` y las
mismas tres variables de entorno.
