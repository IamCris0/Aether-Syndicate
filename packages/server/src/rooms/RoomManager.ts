import type { Server } from 'socket.io';
import {
  DEFAULT_MAP_ID,
  DEFAULT_ROOM_PLAYERS,
  MAX_ROOM_PLAYERS,
  ROOM_CODE_LENGTH,
  getGameMode,
  type ClientToServer,
  type GameModeId,
  type RoomInfo,
  type RoomOptions,
  type ServerToClient,
} from '@aether/shared';
import { GameRoom } from './GameRoom.js';

/** Sin caracteres ambiguos (0/O, 1/I) para dictar códigos por voz. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Tope global de salas activas: cada sala tiene su bucle a 30 Hz, así que
 *  esto acota el consumo si alguien intenta crear salas en masa. Muy por
 *  encima de cualquier uso legítimo entre amigos. */
const MAX_ROOMS = 200;

/**
 * Gestiona el ciclo de vida de las salas:
 *  - matchmaking: busca una sala pública con hueco o crea una nueva
 *  - salas personalizadas con contraseña y código de invitación
 *  - limpieza automática cuando se quedan sin humanos
 */
export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();

  constructor(private readonly io: Server<ClientToServer, ServerToClient>) {}

  private generateCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  createRoom(options: Partial<RoomOptions>): GameRoom {
    if (this.rooms.size >= MAX_ROOMS) throw new Error('Servidor lleno: demasiadas salas activas.');
    const mode = getGameMode(options.mode ?? 'ffa');
    const full: RoomOptions = {
      name: (options.name || 'Partida de Aether').slice(0, 40),
      password: options.password || undefined,
      maxPlayers: clamp(options.maxPlayers ?? DEFAULT_ROOM_PLAYERS, 2, MAX_ROOM_PLAYERS),
      mode: mode.id,
      mapId: options.mapId ?? DEFAULT_MAP_ID,
      timeLimitS: clamp(options.timeLimitS ?? mode.defaultTimeLimitS, 60, 3600),
      scoreLimit: clamp(options.scoreLimit ?? mode.defaultScoreLimit, 1, 1000),
      bots: clamp(options.bots ?? 0, 0, 32),
      gravityScale: clamp(options.gravityScale ?? 1, -1, 2),
    };
    const code = this.generateCode();
    const room = new GameRoom(this.io, code, full);
    room.onEmpty = () => this.rooms.delete(code);
    this.rooms.set(code, room);
    console.log(`[rooms] creada ${code} (${full.mode} @ ${full.mapId}, max ${full.maxPlayers})`);
    return room;
  }

  /** Busca una sala pública compatible con hueco; si no existe, la crea. */
  matchmake(preferredMode?: GameModeId): GameRoom {
    for (const room of this.rooms.values()) {
      if (room.options.password) continue;
      if (!room.isJoinable()) continue;
      if (preferredMode && room.options.mode !== preferredMode) continue;
      return room;
    }
    return this.createRoom({
      name: 'Partida rápida',
      mode: preferredMode ?? 'ffa',
      bots: 3, // las partidas rápidas arrancan con bots que ceden sitio a humanos
    });
  }

  joinByCode(code: string, password?: string): GameRoom | string {
    const room = this.rooms.get(code.toUpperCase().trim());
    if (!room) return 'Sala no encontrada.';
    if (!room.isJoinable()) return 'La sala está llena.';
    if (room.options.password && room.options.password !== password) return 'Contraseña incorrecta.';
    return room;
  }

  find(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  listPublic(): RoomInfo[] {
    return [...this.rooms.values()]
      .filter((r) => !r.options.password)
      .map((r) => r.info());
  }
}

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.floor(v) || min));
