# Roadmap de desarrollo

## LA GRAN REFORMA — plan de fases activo

| Fase | Contenido | Estado |
|---|---|---|
| **3 — Lobby 3D** | Escena real tras el menú: podio, luces cinematográficas, operador 3D con idle/parallax (3.1 ✅); arma equipada en manos (3.2); emotes (3.3) | 3.1 ✅ |
| **4 — Armas 2.0** | Geometría 3D por arma ✅; manos 1ª persona ✅; animaciones recarga/cambio/tajo ✅; skins del pase ✅; sonido real por arma (Higgsfield SFX + fallback procedural) ✅; pendiente: inspección | 🔶 |
| **5 — Mapas 2.0** | Orbital One v2 ✅; texturas ✅; Refinería Kessler ✅ con **gravedad invertida jugable** (Canal Invertido: cámara rotada, controles adaptados, avatares boca abajo) ✅ | ✅ |
| **6 — Operadores** | Sistema data-driven equipable (solo cosmético), modelos in-game por equipo, operador rojo | ⬜ |
| **7 — Menús/UX 2.0** | Rediseño visual completo, transiciones, sonidos de UI, onboarding | ⬜ |
| **8 — Retención** | Misiones diarias/semanales, logros, killcam, votación de mapa | ⬜ |

Las fases históricas (0-2) y el detalle original se conservan abajo.

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

## Fase 2 — Cuentas, progresión y metajuego — EN CURSO

- [x] Arquitectura de auth desacoplada (`services/auth.ts`): interfaz `AuthProvider`,
      invitado con identidad estable persistida; Google/Discord/… implementan la misma interfaz
- [x] Perfil persistente en IndexedDB: nivel, XP, pase, loadout, estadísticas (K/D, victorias)
- [x] Progresión: XP por baja/headshot/asistencia/victoria con popups en HUD,
      curva de niveles (1-100) en `shared/data/progression.ts`
- [x] Pase de batalla temporada 0 «Órbita Cero»: 100 niveles, recompensas reclamables
      y equipables (retículas de color, títulos, emblemas), track premium preparado
- [x] Armería funcional: elegir arma primaria; el servidor VALIDA y aplica el loadout
- [x] Nivel visible en el marcador de partida
- [ ] Supabase Auth (Google primero) + sincronización del perfil a la nube
      (la estructura `PlayerProfile` ya es el contrato; IndexedDB queda como caché offline)
- [ ] SQLite (better-sqlite3) en el servidor para partidas offline/LAN sin Supabase
- [ ] Misiones diarias/semanales y logros (motor de condiciones data-driven)
- [ ] XP autoritativa del servidor (anti-cheat de progresión; hoy la calcula el cliente)

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
