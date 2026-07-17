import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import {
  PROTOCOL_VERSION,
  type ClientToServer,
  type JoinResponse,
  type ServerToClient,
  SERVER_TICK_RATE,
} from '@aether/shared';
import { CONFIG } from './config.js';
import { RoomManager } from './rooms/RoomManager.js';
import type { GameRoom } from './rooms/GameRoom.js';

/**
 * Punto de entrada del servidor de juego.
 * Express sirve health-checks (y opcionalmente el build del cliente);
 * Socket.IO transporta el protocolo tipado de @aether/shared.
 */

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServer, ServerToClient>(httpServer, {
  cors: { origin: CONFIG.corsOrigin, methods: ['GET', 'POST'] },
});

const rooms = new RoomManager(io);

app.get('/health', (_req, res) => {
  res.json({ ok: true, region: CONFIG.region, tickRate: SERVER_TICK_RATE });
});

if (CONFIG.clientDist) {
  app.use(express.static(CONFIG.clientDist));
}

io.on('connection', (socket) => {
  let room: GameRoom | null = null;

  socket.on('join', (req, cb) => {
    try {
      if (req.protocolVersion !== PROTOCOL_VERSION) {
        cb({ ok: false, error: 'Versión de cliente incompatible. Recarga la página.' });
        return;
      }
      if (room) {
        room.removePlayer(socket.id);
        room = null;
      }
      const name = sanitizeName(req.playerName);

      let target: GameRoom;
      if (req.method === 'create') {
        target = rooms.createRoom(req.createOptions ?? {});
      } else if (req.method === 'code') {
        const result = rooms.joinByCode(req.roomCode ?? '', req.password);
        if (typeof result === 'string') {
          cb({ ok: false, error: result });
          return;
        }
        target = result;
      } else {
        target = rooms.matchmake(req.preferredMode);
      }

      target.addPlayer(socket, name, req.loadout, req.level);
      room = target;
      cb({
        ok: true,
        playerId: socket.id,
        roomCode: target.code,
        roomName: target.options.name,
        mapId: target.options.mapId,
        mode: target.options.mode,
        tickRate: SERVER_TICK_RATE,
      } satisfies JoinResponse);
    } catch (err) {
      console.error('[join] error', err);
      cb({ ok: false, error: 'Error interno al unirse a la partida.' });
    }
  });

  socket.on('input', (commands) => {
    if (room && Array.isArray(commands)) room.queueInputs(socket.id, commands);
  });

  socket.on('listRooms', (cb) => cb(rooms.listPublic()));

  socket.on('chat', (text) => {
    if (room && typeof text === 'string' && text.trim()) room.chat(socket.id, text.trim());
  });

  socket.on('voteMap', (mapId) => {
    if (room && typeof mapId === 'string') room.castVote(socket.id, mapId);
  });

  socket.on('leaveRoom', () => {
    room?.removePlayer(socket.id);
    room = null;
  });

  socket.on('disconnect', () => {
    room?.removePlayer(socket.id);
    room = null;
  });
});

httpServer.listen(CONFIG.port, () => {
  console.log(`[aether] servidor de juego en http://localhost:${CONFIG.port} (tick ${SERVER_TICK_RATE} Hz, región ${CONFIG.region})`);
});

function sanitizeName(raw: unknown): string {
  const name = String(raw ?? '')
    .replace(/[^\p{L}\p{N} _\-.]/gu, '')
    .trim()
    .slice(0, 20);
  return name || `Recluta-${Math.floor(Math.random() * 9000 + 1000)}`;
}
