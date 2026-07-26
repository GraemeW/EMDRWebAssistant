import type { RawData } from 'ws';
import type { ClientMessage, PublicState } from '../shared/types.js';
import { isClientMessage } from '../shared/validate.js';
import type { BobbleSession } from './bobble-session.js';
import type { ClientSocket, ConnectionRegistry } from './connections.js';
import type { DirectorAuth } from './auth.js';

// Tunables
const MAX_FAILED_ADMIN_ATTEMPTS = 5;

// Types
type JoinMessage = Extract<ClientMessage, { type: 'join' }>;

export class MessageRouter {
  constructor(
    private readonly session: BobbleSession,
    private readonly connections: ConnectionRegistry,
    private readonly auth: DirectorAuth,
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

  handleNewConnection(ws: ClientSocket): void {
    this.issueChallenge(ws);
    this.connections.send(ws, { type: 'state', state: this.buildPublicState() });
  }

  
  // Private Methods
  private issueChallenge(ws: ClientSocket): void {
    const nonce = this.auth.generateNonce();
    this.connections.setNonce(ws, nonce);
    this.connections.send(ws, { type: 'challenge', nonce });
  }

  private dispatch(ws: ClientSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'join':
        this.handleJoin(ws, msg);
        return;
      case 'control':
        if (ws.role !== 'admin' || !this.connections.isCurrentAdmin(ws)) { return; } // ignore non-admin control attempts
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
      this.handleAdminJoin(ws, msg.digest);
      return;
    }

    this.connections.markViewer(ws);
    this.connections.send(ws, { type: 'joined', role: 'viewer' });
    this.broadcastState();
  }

  private handleAdminJoin(ws: ClientSocket, digest: string): void {
    const nonce = this.connections.getNonce(ws);

    if (!this.auth.verify(nonce, digest)) {
      const attempts = this.connections.incrementFailedAttempts(ws);
      if (attempts >= MAX_FAILED_ADMIN_ATTEMPTS) {
        this.connections.send(ws, {
          type: 'joined',
          role: null,
          error: 'Too many incorrect attempts — reconnect to try again.',
        });
        ws.close();
        return;
      }
      
      this.issueChallenge(ws);
      this.connections.send(ws, { type: 'joined', role: null, error: 'Incorrect director passphrase.' });
      return;
    }

    this.connections.resetFailedAttempts(ws);

    // Correct login always wins the director seat
    const currentAdmin = this.connections.getAdminSocket();
    if (currentAdmin !== null && currentAdmin !== ws) {
      this.connections.send(currentAdmin, { type: 'kicked', reason: 'Another director signed in.' });
      currentAdmin.close();
    }

    this.connections.claimAdmin(ws);
    this.connections.send(ws, { type: 'joined', role: 'admin' });
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
