# Roadmap de desarrollo

## Fase 0 — Fundación ✅ (actual, v0.1)

Monorepo, simulación compartida determinista, gravedad dinámica por zonas, netcode completo (predicción/reconciliación/interpolación/lag comp), matchmaking + salas con código, FFA/TDM/Gun Game, 7 armas data-driven, mapa Orbital One, bots, HUD, PWA, IndexedDB.

## Fase 1 — Sensación de juego (gunplay AAA) — EN CURSO

- [x] Recoil pattern por arma aplicado a la cámara (predicción local de disparo)
- [x] ADS (apuntar): zoom de FOV (sniper 3.5x), spread reducido, sensibilidad y velocidad reducidas
- [x] Slide (agacharse esprintando conserva el momento con fricción mínima)
- [x] Granadas: proyectiles físicos del servidor afectados por la gravedad de zona,
      con rebote, línea de visión, knockback y explosión (G para lanzar, 2 por vida)
- [x] Hitmarkers diferenciados (normal / headshot dorado / kill rojo) + shake de cámara
- [x] Menú de pausa (ESC), abandonar partida, pantalla de fin con marcador y "Jugar otra"
- [ ] Mantle/escalada ligera en `stepMovement`
- [ ] Animaciones de recarga/cambio de arma en el viewmodel
- [ ] Sonido por materiales (pasos metal/cristal) y mezcla en gravedad cero
- [ ] Chispas de impacto y decals (requiere object pooling)
- [ ] Kill cam / pantalla "eliminado por X"

## Fase 2 — Cuentas y persistencia

- [ ] Supabase Auth: Google primero; Discord/GitHub/Apple después (la pantalla de login ya reserva los botones)
- [ ] Perfil: nivel, XP, estadísticas agregadas por arma/modo/mapa
- [ ] Guardado de configuración en la nube (IndexedDB como caché offline + cola de sincronización)
- [ ] SQLite (better-sqlite3) en el servidor para partidas offline/LAN sin Supabase
- [ ] Misiones diarias/semanales y logros (motor de condiciones data-driven)

## Fase 3 — Escala de red

- [ ] Serialización binaria de snapshots (ArrayBuffer) + delta compression
- [ ] Interest management (replicación por relevancia)
- [ ] Tick 60 Hz en salas pequeñas / ranked
- [ ] Espectador y repeticiones (grabar el stream de snapshots ya lo hace posible)
- [ ] Directorio de regiones y selección por ping
- [ ] Pruebas de carga: 32 y 64 jugadores (experimental)

## Fase 4 — Contenido

- [ ] Modos: Dominación, Hardpoint, Eliminación (interfaz `GameModeLogic` lista)
- [ ] Mapa 2: "Refinería Kessler" (gravedad invertida como mecánica central)
- [ ] Sistema de accesorios (miras, silenciadores, cargadores — modifican `WeaponDef` por composición)
- [ ] Operadores (solo apariencia, nunca stats) y skins de arma
- [ ] Lobby 3D con personaje renderizado y luces cinematográficas
- [ ] Editor de mapas basado en el formato de brushes

## Fase 5 — Metajuego y competitivo

- [ ] Pase de batalla (100 niveles, gratis + premium preparado)
- [ ] Inventario (miles de objetos: skins, emblemas, sprays, gestos)
- [ ] Ranked: MMR, temporadas, colocación
- [ ] Clanes, amigos, invitaciones directas
- [ ] Chat de texto en partida (el protocolo `chat` ya existe) y de voz
- [ ] Anti-cheat estadístico (el servidor ya es autoritativo; añadir detección de anomalías)

## Optimización continua

Presupuesto: 120 FPS en gama alta, 60 FPS estables en gama media.

- [ ] Instancing de brushes y merge de geometría estática por material
- [ ] Frustum culling ya lo da Three.js; añadir occlusion culling por sectores (el mapa ya se divide en áreas)
- [ ] Object pooling de trazadoras/partículas/impactos
- [ ] Web Worker para la simulación de predicción (aislar del hilo de render)
- [ ] LOD de avatares y texture streaming cuando haya arte real
- [ ] Presets de calidad gráfica en Ajustes
