import { Room } from './room.js';
import type { ServerLogger } from './logger.js';

export interface RoomManagerOptions {
  maxRooms: number;
  emptyRoomTeardownMs: number;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly options: RoomManagerOptions,
    private readonly logger: ServerLogger,
  ) {}

  get(name: string): Room | undefined { return this.rooms.get(name); }

  getOrCreate(name: string): Room {
    const existing = this.rooms.get(name);
    if (existing) {
      existing.cancelTeardown();
      return existing;
    }

    // Kill the oldest room at > max room count (prevent potentially stale rooms preventing a new session)
    if (this.rooms.size >= this.options.maxRooms) {
      const oldestName = this.rooms.keys().next().value;
      if (oldestName !== undefined) { this.teardown(oldestName, 'Room closed to make space for a new session.'); }
    }

    const room = new Room(name);
    this.rooms.set(name, room);
    this.logger.log('room_created', { room: name, activeRooms: this.rooms.size, maxRooms: this.options.maxRooms });
    return room;
  }

  teardown(name: string, reason: string): void {
    const room = this.rooms.get(name);
    if (!room) { return; }
    this.rooms.delete(name);
    room.dispose(reason);
    this.logger.log('room_deleted', { room: name, reason, activeRooms: this.rooms.size });
  }

  noteConnectionLeft(name: string): void {
    const room = this.rooms.get(name);
    if (!room || !room.isEmpty()) { return; }
    room.scheduleTeardown(this.options.emptyRoomTeardownMs, () => { this.teardown(name, 'Room closed due to inactivity.'); });
  }
}
