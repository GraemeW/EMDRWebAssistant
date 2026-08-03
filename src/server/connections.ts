import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { Role, ServerMessage } from '../shared/types.js';

export interface ClientSocket extends WebSocket {
  role: Role | 'unjoined';
  nonce: string;
  failedAdminAttempts: number;
  roomName: string | null; // roomName null before joining a room
}

export function sendTo(ws: WebSocket, msg: ServerMessage): void { if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(msg)); } }

export class ConnectionAcceptor {
  private readonly wss: WebSocketServer;

  constructor(httpServer: HttpServer) { this.wss = new WebSocketServer({ server: httpServer }); }

  // Login
  getNonce(ws: ClientSocket): string { return ws.nonce; }
  setNonce(ws: ClientSocket, nonce: string): void { ws.nonce = nonce; }
  incrementFailedAttempts(ws: ClientSocket): number {
    ws.failedAdminAttempts += 1;
    return ws.failedAdminAttempts;
  }
  resetFailedAttempts(ws: ClientSocket): void { ws.failedAdminAttempts = 0; }

  // Room membership (which room, not what role within it)
  getRoomName(ws: ClientSocket): string | null { return ws.roomName; }
  setRoomName(ws: ClientSocket, roomName: string | null): void { ws.roomName = roomName; }

  // Server Functionality
  onConnection(handler: (ws: ClientSocket) => void): void {
    this.wss.on('connection', (socket: WebSocket) => {
      const ws = socket as ClientSocket;
      ws.role = 'unjoined';
      ws.nonce = '';
      ws.failedAdminAttempts = 0;
      ws.roomName = null;
      handler(ws);
    });
  }

  send(ws: WebSocket, msg: ServerMessage): void { sendTo(ws, msg); }
}
