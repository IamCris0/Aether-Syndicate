import type { GameModeId, InputCommand, RoomInfo, RoomOptions, Snapshot } from '../types.js';

/**
 * Contrato de mensajes Socket.IO entre cliente y servidor.
 * Ambos lados tipan sus sockets con estas interfaces, de modo que
 * cualquier cambio de protocolo rompe la compilación en vez de en runtime.
 */

export interface JoinRequest {
  protocolVersion: number;
  playerName: string;
  /** 'matchmake' busca/crea sala pública; 'code' se une a una concreta. */
  method: 'matchmake' | 'code' | 'create';
  roomCode?: string;
  password?: string;
  createOptions?: RoomOptions;
  preferredMode?: GameModeId;
  /** Loadout elegido en la armería (el servidor lo valida contra WEAPONS). */
  loadout?: string[];
  /** Nivel de cuenta para mostrar en el marcador (verificado por Supabase en fase 2). */
  level?: number;
}

export interface JoinResponse {
  ok: boolean;
  error?: string;
  playerId?: string;
  roomCode?: string;
  roomName?: string;
  mapId?: string;
  mode?: GameModeId;
  tickRate?: number;
}

export interface ClientToServer {
  join: (req: JoinRequest, cb: (res: JoinResponse) => void) => void;
  /** Lote de inputs pendientes (redundancia contra pérdida de paquetes). */
  input: (commands: InputCommand[]) => void;
  listRooms: (cb: (rooms: RoomInfo[]) => void) => void;
  leaveRoom: () => void;
  chat: (text: string) => void;
}

export interface ServerToClient {
  snapshot: (snap: Snapshot) => void;
  playerJoined: (id: string, name: string) => void;
  playerLeft: (id: string, name: string) => void;
  chat: (fromName: string, text: string) => void;
  kicked: (reason: string) => void;
  /** Sondeo de latencia del servidor: el cliente responde inmediatamente. */
  sping: (cb: () => void) => void;
}
