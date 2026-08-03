import { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/types.js';
import type { ClientSocket } from './connections.js';
import { sendTo } from './connections.js';

export class RoomConnections {
  private adminSocket: ClientSocket | null = null;
  private readonly members = new Set<ClientSocket>();

  // Membership
  join(ws: ClientSocket): void { this.members.add(ws); }
  leave(ws: ClientSocket): void {
    this.members.delete(ws);
    this.releaseAdminIfSelf(ws);
  }
  isEmpty(): boolean { return this.members.size === 0; }

  // Admin
  isCurrentAdmin(ws: ClientSocket): boolean { return this.adminSocket === ws; }
  hasLiveAdmin(): boolean { return this.adminSocket !== null && this.adminSocket.readyState === WebSocket.OPEN; }
  getAdminSocket(): ClientSocket | null { return this.adminSocket; }
  claimAdmin(ws: ClientSocket): void { this.adminSocket = ws; ws.role = 'admin'; }
  releaseAdminIfSelf(ws: ClientSocket): void { if (this.adminSocket === ws) this.adminSocket = null; }

  // Viewer
  markViewer(ws: ClientSocket): void { ws.role = 'viewer'; }
  countViewers(): number {
    let n = 0;
    for (const client of this.members) {
      if (client.role === 'viewer') n += 1;
    }
    return n;
  }

  // Messaging
  send(ws: ClientSocket, msg: ServerMessage): void { sendTo(ws, msg); }

  broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const client of this.members) {
      if (client.readyState === WebSocket.OPEN) { client.send(payload); }
    }
  }

  closeAll(reason: string): void {
    for (const client of this.members) {
      sendTo(client, { type: 'kicked', reason });
      client.close();
    }
  }
}
