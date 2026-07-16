# Netcode

Modelo estándar de FPS competitivo (Quake/Source/Overwatch), adaptado a WebSockets.

## Parámetros (shared/constants.ts)

| Parámetro | Valor | Notas |
|---|---|---|
| Tick del servidor | 30 Hz | configurable; objetivo 60 Hz para ranked |
| Pasos de input del cliente | 60 Hz | delta fijo `INPUT_DT = 1/60` |
| Retraso de interpolación | 100 ms | los remotos se dibujan en el pasado |
| Compensación de lag máx. | 250 ms | tope de rebobinado en el servidor |

## Flujo

```
Cliente (60 Hz)                      Servidor (30 Hz)
──────────────                       ────────────────
sample input → cmd(seq)
stepMovement(local)   ← PREDICCIÓN
send [cmds no confirmados]  ───────► cola por jugador
                                     por tick: stepMovement(autoridad)
                                     combate (rebobinado lag comp)
                                     modo de juego, respawns
        ◄─────────────────────────── snapshot { ackSeq, players, events, self }
purgar cmds ≤ ackSeq
estado := snapshot.self
replay cmds > ackSeq  ← RECONCILIACIÓN
remotos → buffer → interpolar t-100ms  ← INTERPOLACIÓN
```

## Claves de la implementación

- **Determinismo**: `stepMovement` (shared) es la única física de jugador. Mismo estado + mismo input ⇒ mismo resultado en ambos lados; la reconciliación solo corrige lo que la red desordenó.
- **Redundancia de inputs**: cada paquete lleva los últimos ≤12 comandos sin confirmar; perder un paquete no pierde inputs.
- **Compensación de lag** (`server/game/combat.ts`): cada tick se guarda un historial de posiciones (~1 s). Al disparar, los objetivos se rebobinan `interp + RTT/2` ms (máx. 250): le das a lo que ves en tu pantalla.
- **Autoridad total del servidor**: los inputs se validan (clamp de ejes y pitch, anti-flood de cola, secuencias monótonas). El cliente jamás reporta impactos.
- **Snapshots volátiles**: se emiten con `volatile` — si el buffer está congestionado se descarta el snapshot viejo en lugar de encolar latencia.
- **Ping**: el servidor lo mide activamente (emit con ack cada 2 s) y lo usa para el rebobinado; viaja en el snapshot para HUD y marcador.

## Escalado previsto (ver ROADMAP)

1. **Delta snapshots + serialización binaria** (ArrayBuffer) — necesario para 32-64 jugadores.
2. **Interest management** (solo replicar lo visible/cercano).
3. **WebTransport/WebRTC datagram** como transporte no fiable donde esté disponible; Socket.IO queda como fallback y canal fiable (chat, join).
4. **Servidores dedicados por región** — `AETHER_REGION` ya existe; falta el directorio de regiones y la selección por latencia.
