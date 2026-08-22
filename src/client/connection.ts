import type { ClientMessage, ServerMessage } from '../shared/types.js';
import { isServerMessage } from '../shared/validate.js';

// Tunables
const RECONNECT_DELAY_MS = 1500;
const HEARTBEAT_INTERVAL_MS = 20_000; // also doubles as the max time to notice a dead/zombied connection

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}

export class ServerConnection {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private awaitingPong = false;
  private messageListener: (msg: ServerMessage) => void = () => {};
  private openListener: () => void = () => {};
  private closeListener: () => void = () => {};

  onMessage(listener: (msg: ServerMessage) => void): void { this.messageListener = listener; }
  onOpen(listener: () => void): void { this.openListener = listener; }
  onClose(listener: () => void): void { this.closeListener = listener; }

  connect(): void {
    const socket = new WebSocket(wsUrl());
    this.ws = socket;

    socket.addEventListener('open', () => {
      this.startHeartbeat();
      this.openListener();
    });
    socket.addEventListener('close', () => {
      this.stopHeartbeat();
      this.closeListener();
      setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
    });

    socket.addEventListener('message', (evt: MessageEvent<string>) => {
      let parsed: unknown;
      try { parsed = JSON.parse(evt.data); } 
      catch { return; }
      
      if (!isServerMessage(parsed)) { return; }
      if (parsed.type === 'pong') { this.awaitingPong = false; }
      this.messageListener(parsed);
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      setTimeout(() => this.send(msg), 150);
    }
  }

  private startHeartbeat(): void {
    this.awaitingPong = false;
    this.heartbeatTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) { return; }
      if (this.awaitingPong) {
        // Previous ping went unanswered — treat the connection as dead and force a reconnect.
        ws.close();
        return;
      }
      this.awaitingPong = true;
      ws.send(JSON.stringify({ type: 'ping', t: Date.now() } satisfies ClientMessage));
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }
}
