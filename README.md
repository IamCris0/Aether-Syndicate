# AETHER SYNDICATE

> FPS multijugador competitivo para navegador. Corporaciones militares luchan por el control de estaciones orbitales y reactores de Etherium. **La gravedad es un arma.**

![estado](https://img.shields.io/badge/estado-pre--alpha-orange) ![web](https://img.shields.io/badge/plataforma-web-blue)

## Qué es

Un shooter competitivo 100% web (sin Unity/Unreal/Godot) construido sobre **Three.js + WebGL**, con servidor autoritativo en **Node.js + Socket.IO** y netcode de nivel competitivo: predicción del cliente, reconciliación, interpolación de entidades y compensación de lag.

Su diferenciador: **gravedad dinámica por zonas**. Cada mapa define volúmenes con gravedad normal, reducida, cero o invertida que afectan al movimiento, los saltos y las rutas de ataque.

## Arranque rápido

```bash
npm install
npm run dev        # servidor (:3001) + cliente (:5173) en paralelo
```

Abre http://localhost:5173, entra como invitado y pulsa **BUSCAR PARTIDA** (crea una sala con bots si no hay ninguna). Para probar el multijugador real, abre una segunda pestaña.

```bash
npm run typecheck        # verifica los tres paquetes
npx tsx tools/smoke-test.ts   # prueba e2e headless contra el servidor local
```

## Estructura

```
packages/
├── shared/   Simulación determinista compartida (movimiento, gravedad,
│             colisiones), datos (armas, modos, mapas) y protocolo tipado.
├── server/   Servidor autoritativo: salas, matchmaking, tick loop 30 Hz,
│             combate con compensación de lag, bots.
└── client/   Cliente Three.js: predicción/reconciliación, render, HUD,
              lobby, audio procedural, PWA, IndexedDB.
docs/         Arquitectura, netcode y roadmap.
tools/        Scripts de desarrollo (smoke test e2e).
```

La regla de oro: **todo lo que deba comportarse igual en cliente y servidor vive en `@aether/shared`**. Añadir un arma, un modo o un mapa es añadir datos, no tocar sistemas.

## Estado actual (v0.1 — fundación)

| Sistema | Estado |
|---|---|
| Movimiento (sprint, salto, agacharse, **slide**, aire, inercia) | ✅ |
| Gravedad dinámica por zonas (normal / baja / cero; invertida preparada) | ✅ |
| **Granadas físicas afectadas por la gravedad de zona** (flotan en zero-g) | ✅ |
| Netcode (predicción, reconciliación, interpolación, lag comp) | ✅ |
| Gunplay: recoil de cámara por arma, ADS con zoom, disparo con predicción local | ✅ |
| Matchmaking + crear sala + unirse por código + explorar salas | ✅ |
| Modos: FFA, TDM, Gun Game (Dominación/Hardpoint/Eliminación definidos) | ✅ |
| 7 armas data-driven con recoil, spread, falloff, recarga | ✅ |
| Mapa Orbital One (hangares, laboratorios, pozo zero-g, exterior) | ✅ |
| Bots de relleno | ✅ |
| HUD completo + marcador TAB + killfeed + hitmarkers diferenciados | ✅ |
| Menú de pausa (ESC), abandonar partida, pantalla de fin con marcador | ✅ |
| PWA + ajustes persistentes (IndexedDB) | ✅ |
| Cuentas (Supabase), progresión, inventario, pase de batalla | 🔜 ver roadmap |

## Despliegue

El cliente es un sitio estático; el servidor es un proceso Node persistente (necesita WebSockets, no funciona en serverless).

- **Cliente** → Vercel / Netlify / Cloudflare Pages: `npm run build -w @aether/client`, publica `packages/client/dist`. Define `VITE_SERVER_URL` con la URL del servidor.
- **Servidor** → Railway / Fly.io / Render / VPS: `npm run start -w @aether/server`. Variables: `PORT`, `CORS_ORIGIN`, `AETHER_REGION`.

## Documentación

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — diseño de módulos, principios y cómo extender cada sistema
- [docs/NETWORKING.md](docs/NETWORKING.md) — modelo de red en detalle
- [docs/ROADMAP.md](docs/ROADMAP.md) — plan de desarrollo por fases
