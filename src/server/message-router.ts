import type { RawData } from 'ws';
import type { ClientMessage, PublicState } from '../shared/types.js';
import { isClientMessage } from '../shared/validate.js';
import type { BobbleSession } from './bobble-session.js';
import type { ClientSocket, ConnectionRegistry } from './connections.js';

// Types
type JoinMessage = Extract<ClientMessage, { type: 'join' }>;

export class MessageRouter {
  constructor(
    private readonly session: BobbleSession,
    private readonly connections: ConnectionRegistry,
    private readonly adminUsername: string,
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
    this.connections.releaseAdminIfSelf(ws);
    this.broadcastState();
  }

  sendInitialState(ws: ClientSocket): void {
    this.connections.send(ws, { type: 'state', state: this.buildPublicState() });
  }

  
  // Private Methods
  private dispatch(ws: ClientSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'join':
        this.handleJoin(ws, msg);
        return;
      case 'control':
        if (ws.role !== 'admin' || !this.connections.isCurrentAdmin(ws)) return; // ignore non-admin control attempts
        this.session.applyControl(msg);
        this.broadcastState();
        return;
      case 'ping':
        this.connections.send(ws, { type: 'pong', t: msg.t, serverTime: Date.now() });
        return;
      default: {
        const exhaustive: never = msg;
        return exhaustive;
      }
    }
  }

  private handleJoin(ws: ClientSocket, msg: JoinMessage): void {
    if (msg.role === 'admin') {
      if (this.connections.hasLiveAdmin() && !this.connections.isCurrentAdmin(ws)) {
        this.connections.send(ws, {
          type: 'joined',
          role: 'viewer',
          error: 'A director is already running this session.',
        });
        this.connections.markViewer(ws);
        this.broadcastState();
        return;
      }
      if (msg.username !== this.adminUsername) {
        this.connections.send(ws, { type: 'joined', role: null, error: 'Incorrect director username.' });
        return;
      }
      this.connections.claimAdmin(ws);
      this.connections.send(ws, { type: 'joined', role: 'admin' });
      this.broadcastState();
      return;
    }

    this.connections.markViewer(ws);
    this.connections.send(ws, { type: 'joined', role: 'viewer' });
    this.broadcastState();
  }

  private broadcastState(): void {
    this.connections.broadcast({ type: 'state', state: this.buildPublicState() });
  }

  private buildPublicState(): PublicState {
    return {
      ...this.session.getState(),
      adminOnline: this.connections.hasLiveAdmin(),
      viewerCount: this.connections.countViewers(),
      serverTime: Date.now(),
    };
  }
}
