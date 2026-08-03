import { BobbleSession } from './bobble-session.js';
import { RoomConnections } from './room-connections.js';

export class Room {
  readonly session = new BobbleSession();
  readonly connections = new RoomConnections();
  readonly createdAt = Date.now();

  private teardownTimer: NodeJS.Timeout | null = null;

  constructor(readonly name: string) {}

  isEmpty(): boolean { return this.connections.isEmpty(); }

  // Schedule teardown after ms of being empty -- replaces any timer already pending
  scheduleTeardown(ms: number, onTeardown: () => void): void {
    this.cancelTeardown();
    this.teardownTimer = setTimeout(onTeardown, ms);
  }

  cancelTeardown(): void {
    if (this.teardownTimer !== null) {
      clearTimeout(this.teardownTimer);
      this.teardownTimer = null;
    }
  }

  dispose(reason: string): void {
    this.cancelTeardown();
    this.connections.closeAll(reason);
  }
}
