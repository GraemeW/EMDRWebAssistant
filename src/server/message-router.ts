import type { RawData } from 'ws';
import type { ClientMessage, PublicState } from '../shared/types.js';
import { isClientMessage } from '../shared/validate.js';
import { normalizeRoomName } from '../shared/rooms.js';
import type { ClientSocket, ConnectionAcceptor } from './connections.js';
import type { DirectorAuth } from './auth.js';
import type { Room } from './room.js';
import type { RoomManager } from './room-manager.js';
import type { ServerLogger } from './logger.js';

// Tunables
const MAX_FAILED_ADMIN_ATTEMPTS = 5;

// Types
type JoinMessage = Extract<ClientMessage, { type: 'join' }>;

export class MessageRouter {
  constructor(
    private readonly rooms: RoomManager,
    private readonly acceptor: ConnectionAcceptor,
    private readonly auth: DirectorAuth,
    private readonly logger: ServerLogger,
  ) {}

  handleRawMessage(ws: ClientSocket, raw: RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!isClientMessage(parsed)) return;
    this.dispatch(ws, parsed);
  }

  handleClose(ws: ClientSocket): void {
    const roomName = this.acceptor.getRoomName(ws);
    if (roomName === null) { return; }

    const room = this.rooms.get(roomName);
    if (!room) { return; }

    this.logDeparture(ws, roomName);
    room.connections.leave(ws);
    this.broadcastRoomState(room);
    this.rooms.noteConnectionLeft(roomName);
  }

  handleNewConnection(ws: ClientSocket): void { this.issueChallenge(ws); }


  // Private Methods
  private issueChallenge(ws: ClientSocket): void {
    const nonce = this.auth.generateNonce();
    this.acceptor.setNonce(ws, nonce);
    this.acceptor.send(ws, { type: 'challenge', nonce });
  }

  private dispatch(ws: ClientSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'join':
        this.handleJoin(ws, msg);
        return;
      case 'control':
        this.handleControl(ws, msg);
        return;
      case 'ping':
        this.acceptor.send(ws, { type: 'pong', t: msg.t, serverTime: Date.now() });
        return;
      default: {
        const exhaustive: never = msg;
        return exhaustive;
      }
    }
  }

  private handleControl(ws: ClientSocket, msg: Extract<ClientMessage, { type: 'control' }>): void {
    const room = this.roomOf(ws);
    if (!room || ws.role !== 'admin' || !room.connections.isCurrentAdmin(ws)) { return; } // ignore non-admin control attempts
    room.session.applyControl(msg);
    this.broadcastRoomState(room);
  }

  private handleJoin(ws: ClientSocket, msg: JoinMessage): void {
    const roomName = normalizeRoomName(msg.room);

    if (msg.role === 'admin') {
      this.handleAdminJoin(ws, msg.digest, roomName);
      return;
    }

    this.handleViewerJoin(ws, roomName);
  }

  private handleViewerJoin(ws: ClientSocket, roomName: string): void {
    const room = this.rooms.get(roomName);
    if (!room) {
      this.acceptor.send(ws, {
        type: 'joined',
        role: null,
        error: 'No session found for that room yet — ask your director to start one.',
      });
      return;
    }

    this.moveToRoom(ws, room, roomName);
    room.connections.markViewer(ws);
    this.logger.log('viewer_joined', { room: roomName });
    this.acceptor.send(ws, { type: 'joined', role: 'viewer', room: roomName });
    this.broadcastRoomState(room);
  }

  private handleAdminJoin(ws: ClientSocket, digest: string, roomName: string): void {
    const nonce = this.acceptor.getNonce(ws);

    if (!this.auth.verify(nonce, digest)) {
      const attempts = this.acceptor.incrementFailedAttempts(ws);
      this.logger.log('director_auth_failed', { room: roomName, attempts });

      if (attempts >= MAX_FAILED_ADMIN_ATTEMPTS) {
        this.acceptor.send(ws, {
          type: 'joined',
          role: null,
          error: 'Too many incorrect attempts — reconnect to try again.',
        });
        ws.close();
        return;
      }

      this.issueChallenge(ws);
      this.acceptor.send(ws, { type: 'joined', role: null, error: 'Incorrect director passphrase.' });
      return;
    }

    this.acceptor.resetFailedAttempts(ws);

    // Correct login always wins the director seat for this room, joining or creating it as needed.
    const room = this.rooms.getOrCreate(roomName);
    this.moveToRoom(ws, room, roomName);

    const currentAdmin = room.connections.getAdminSocket();
    if (currentAdmin !== null && currentAdmin !== ws) {
      this.logger.log('director_replaced', { room: roomName });
      this.acceptor.send(currentAdmin, { type: 'kicked', reason: 'Another director signed in.' });
      currentAdmin.close();
    }

    room.connections.claimAdmin(ws);
    this.logger.log('director_joined', { room: roomName });
    this.acceptor.send(ws, { type: 'joined', role: 'admin', room: roomName });
    this.broadcastRoomState(room);
  }

  private moveToRoom(ws: ClientSocket, room: Room, roomName: string): void {
    const previousRoomName = this.acceptor.getRoomName(ws);
    if (previousRoomName !== null && previousRoomName !== roomName) {
      const previousRoom = this.rooms.get(previousRoomName);
      if (previousRoom) {
        this.logDeparture(ws, previousRoomName);
        previousRoom.connections.leave(ws);
        this.broadcastRoomState(previousRoom);
        this.rooms.noteConnectionLeft(previousRoomName);
      }
    }

    this.acceptor.setRoomName(ws, roomName);
    room.connections.join(ws);
    room.cancelTeardown(); // this room is in active use again
  }

  private logDeparture(ws: ClientSocket, roomName: string): void {
    if (ws.role === 'admin') {
      this.logger.log('director_left', { room: roomName });
    } else if (ws.role === 'viewer') {
      this.logger.log('viewer_left', { room: roomName });
    }
  }

  private roomOf(ws: ClientSocket): Room | undefined {
    const roomName = this.acceptor.getRoomName(ws);
    return roomName === null ? undefined : this.rooms.get(roomName);
  }

  private broadcastRoomState(room: Room): void {
    room.connections.broadcast({ type: 'state', state: this.buildPublicState(room) });
  }

  private buildPublicState(room: Room): PublicState {
    return {
      ...room.session.getState(),
      adminOnline: room.connections.hasLiveAdmin(),
      viewerCount: room.connections.countViewers(),
      serverTime: Date.now(),
    };
  }
}
