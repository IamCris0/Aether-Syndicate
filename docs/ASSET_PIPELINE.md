# Pipeline de assets con IA (Higgsfield)

## Principios

1. **La geometría jugable NUNCA la genera la IA.** Los mapas son módulos de datos (brushes) en `shared/data/maps/` — colisión = visual, determinismo de red garantizado. La IA genera lo que viste: texturas, skyboxes, arte, props decorativos.
2. **Todo asset tiene fallback.** Si falta el archivo, el juego usa el look procedural (materiales de color). Nada rompe.
3. **Estimar antes de gastar**: `higgsfield generate cost <modelo> --prompt "..."` es gratis. Soul V2 (`text2image_soul_v2`) cuesta 0.12 cr/imagen; los modelos de diseño (recraft, seedream) ~1-1.25 cr.
4. **Optimizar siempre**: la salida (~4-5 MB PNG) se redimensiona y comprime a JPG antes de entrar al repo (objetivo <150 KB).

## Estructura de carpetas

```
packages/client/public/assets/
├── operators/     retratos y arte de operadores (lobby, perfil)
├── skyboxes/      panoramas equirectangulares (fondo de escena + login)
├── textures/      texturas tileables de superficie (suelo, casco, pasarela)
├── ui/            emblemas, iconos del pase, key art de menús
└── models/        (futuro) props GLB de image_to_3d / tripo_3d
```

## Flujo (validado)

```bash
higgsfield account status                       # saldo
higgsfield generate cost text2image_soul_v2 --prompt "..."   # estimar (gratis)
higgsfield generate create text2image_soul_v2 --prompt "..." --aspect_ratio 3:4 --wait
# → descarga la URL, optimiza (768-1600px, JPG q80), coloca en public/assets/
```

Plan free: **1 job concurrente** — lanzar generaciones de una en una.

## Prompts de la arena (Orbital One / estética del juego)

Paleta obligatoria en todos: *dark navy, gunmetal, teal/cyan emissive accents*.

| Asset | Modelo | Aspect | Prompt |
|---|---|---|---|
| Skybox nebulosa ✅ | soul_v2 | 16:9 | `deep space nebula panorama, dark navy void with teal and cyan gas clouds, distant stars, subtle purple accents, ultra wide seamless space vista, no planets in foreground, cinematic astrophotography, very dark moody` |
| Suelo (deck) | soul_v2 | 1:1 | `seamless tileable game texture, dark sci-fi spaceship floor deck plates viewed directly from above, industrial gunmetal panels with hexagonal bolts and thin teal emissive light strips along panel seams, perfectly flat orthographic top-down view, uniform lighting, no perspective, no shadows, repeating pattern` |
| Casco (muros) | soul_v2 | 1:1 | `seamless tileable game texture, sci-fi space station hull wall panels, brushed gunmetal with recessed seams, occasional teal status lights, flat frontal orthographic view, even lighting, no perspective, repeating pattern` |
| Pasarela | soul_v2 | 1:1 | `seamless tileable game texture, industrial metal catwalk grating, dark steel diamond plate with wear, flat top-down orthographic view, even lighting, repeating pattern` |
| Operador equipo CYAN ✅ | soul_v2 | 3:4 | (ver commit f9cdd5b) |
| Operador equipo ROJO | soul_v2 | 3:4 | mismo prompt del operador cambiando `teal glowing accents` → `crimson red glowing accents` |
| Key art login | soul_v2 | 16:9 | `massive orbital space station refinery above a dark planet, teal etherium energy glowing from reactor core, cinematic sci-fi key art, dramatic rim light, dark navy space, volumetric light` |
| Emblemas pase | soul_v2 | 1:1 | `military sci-fi corporation emblem, minimal geometric badge, [hexagon/star/comet/diamond] shape, teal glow on black background, vector style insignia, centered, no text` |
| Props 3D (futuro) | image_to_3d | — | generar imagen del prop primero (contenedor, torreta, consola) y pasarla a `image_to_3d` — **estimar coste antes**, los modelos 3D son más caros |

## Integración en código (dónde enchufar cada asset)

| Asset | Punto de integración | Fallback |
|---|---|---|
| Skybox | `GameClient` (TextureLoader → `scene.background`) + CSS `#screen-login` | color plano `map.skyColor` |
| Textura suelo | `World.createMaterials()` → material `floor` | color procedural |
| Operador lobby | `index.html` `.lobby-operator` | `onerror` oculta la imagen |
| Emblemas | `shared/data/progression.ts` (recompensas `emblem` con ruta) | símbolo unicode actual |

## Registro de gastos

| Fecha | Asset | Modelo | Coste | Saldo |
|---|---|---|---|---|
| 2026-07-16 | operator-default | soul_v2 | 0.12 | 9.88 |
| 2026-07-16 | nebula-01 (skybox) | soul_v2 | 0.12 | 9.76 |
| 2026-07-16 | floor-deck-01 (2 intentos: 503 + rate limit; pendiente) | soul_v2 | 0.12* | ~9.6 |
