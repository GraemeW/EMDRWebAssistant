import type { ClientMessage, ServerMessage } from '../shared/types.js';
import { isServerMessage } from '../shared/validate.js';

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}

export class ServerConnection {
  private ws: WebSocket | null = null;
  private messageListener: (msg: ServerMessage) => void = () => {};
  private openListener: () => void = () => {};
  private closeListener: () => void = () => {};

  onMessage(listener: (msg: ServerMessage) => void): void { this.messageListener = listener; }
  onOpen(listener: () => void): void { this.openListener = listener; }
  onClose(listener: () => void): void { this.closeListener = listener; }

  connect(): void {
    const socket = new WebSocket(wsUrl());
    this.ws = socket;

    socket.addEventListener('open', () => this.openListener());
    socket.addEventListener('close', () => {
      this.closeListener();
      setTimeout(() => this.connect(), 1500);
    });

    socket.addEventListener('message', (evt: MessageEvent<string>) => {
      let parsed: unknown;
      try { parsed = JSON.parse(evt.data); } 
      catch { return; }
      
      if (!isServerMessage(parsed)) { return; }
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
}
