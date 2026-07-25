import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

import type { Role, ServerMessage } from '../shared/types.js';

export interface ClientSocket extends WebSocket {
  role: Role | 'unjoined';
}

export class ConnectionRegistry {
  private readonly wss: WebSocketServer;
  private adminSocket: ClientSocket | null = null;

  constructor(httpServer: HttpServer) {
    this.wss = new WebSocketServer({ server: httpServer });
  }

  onConnection(handler: (ws: ClientSocket) => void): void {
    this.wss.on('connection', (socket: WebSocket) => {
      const ws = socket as ClientSocket;
      ws.role = 'unjoined';
      handler(ws);
    });
  }

  isCurrentAdmin(ws: ClientSocket): boolean {
    return this.adminSocket === ws;
  }

  hasLiveAdmin(): boolean {
    return this.adminSocket !== null && this.adminSocket.readyState === WebSocket.OPEN;
  }

  claimAdmin(ws: ClientSocket): void {
    this.adminSocket = ws;
    ws.role = 'admin';
  }

  markViewer(ws: ClientSocket): void {
    ws.role = 'viewer';
  }

  releaseAdminIfSelf(ws: ClientSocket): void {
    if (this.adminSocket === ws) this.adminSocket = null;
  }

  countViewers(): number {
    let n = 0;
    for (const client of this.wss.clients) {
      if ((client as ClientSocket).role === 'viewer') n += 1;
    }
    return n;
  }

  send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }
}
