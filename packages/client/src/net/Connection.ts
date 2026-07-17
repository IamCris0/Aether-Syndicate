import { io, type Socket } from 'socket.io-client';
import {
  PROTOCOL_VERSION,
  type ClientToServer,
  type GameModeId,
  type InputCommand,
  type JoinRequest,
  type JoinResponse,
  type RoomInfo,
  type RoomOptions,
  type ServerToClient,
  type Snapshot,
} from '@aether/shared';

type GameSocket = Socket<ServerToClient, ClientToServer>;

/** Datos de perfil que acompañan al join (loadout de armería, nivel). */
export interface JoinExtra {
  loadout?: string[];
  level?: number;
}

/**
 * Capa de red del cliente.
 * - Envía inputs en lotes con redundancia (los no confirmados se reenvían).
 * - Expone callbacks para snapshots y eventos de sala.
 * En producción se conecta a VITE_SERVER_URL; en dev usa el proxy de Vite.
 */
export class Connection {
  private socket: GameSocket;
  private unacked: InputCommand[] = [];

  playerId = '';
  onSnapshot: ((snap: Snapshot) => void) | null = null;
  onChat: ((from: string, text: string) => void) | null = null;
  onDisconnect: (() => void) | null = null;

  constructor() {
    const url = import.meta.env.VITE_SERVER_URL as string | undefined;
    this.socket = url ? io(url, { transports: ['websocket'] }) : io({ transports: ['websocket'] });

    this.socket.on('snapshot', (snap) => {
      // Purga los inputs ya confirmados por el servidor.
      this.unacked = this.unacked.filter((c) => c.seq > snap.ackSeq);
      this.onSnapshot?.(snap);
    });
    this.socket.on('sping', (cb) => cb());
    this.socket.on('chat', (from, text) => this.onChat?.(from, text));
    this.socket.on('disconnect', () => this.onDisconnect?.());
  }

  join(req: Omit<JoinRequest, 'protocolVersion'>): Promise<JoinResponse> {
    return new Promise((resolve) => {
      this.socket.emit('join', { ...req, protocolVersion: PROTOCOL_VERSION }, (res) => {
        if (res.ok && res.playerId) this.playerId = res.playerId;
        resolve(res);
      });
    });
  }

  matchmake(name: string, extra?: JoinExtra, mode?: GameModeId): Promise<JoinResponse> {
    return this.join({ playerName: name, method: 'matchmake', preferredMode: mode, ...extra });
  }

  createRoom(name: string, options: Partial<RoomOptions>, extra?: JoinExtra): Promise<JoinResponse> {
    return this.join({ playerName: name, method: 'create', createOptions: options as RoomOptions, ...extra });
  }

  joinByCode(name: string, code: string, password?: string, extra?: JoinExtra): Promise<JoinResponse> {
    return this.join({ playerName: name, method: 'code', roomCode: code, password, ...extra });
  }

  listRooms(): Promise<RoomInfo[]> {
    return new Promise((resolve) => this.socket.emit('listRooms', resolve));
  }

  /** Encola un input y reenvía todos los no confirmados (tolera pérdidas). */
  sendInput(cmd: InputCommand): void {
    this.unacked.push(cmd);
    if (this.unacked.length > 120) this.unacked.splice(0, this.unacked.length - 120);
    this.socket.volatile.emit('input', this.unacked.slice(-12));
  }

  get pendingInputs(): InputCommand[] {
    return this.unacked;
  }

  voteMap(mapId: string): void {
    this.socket.emit('voteMap', mapId);
  }

  leaveRoom(): void {
    this.socket.emit('leaveRoom');
    this.unacked = [];
  }
}
