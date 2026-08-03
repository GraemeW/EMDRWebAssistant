// Tunables
export const ROOM_NAME_MAX_LENGTH = 40;
const ROOM_NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

export function isValidRoomName(x: unknown): x is string {
  if (typeof x !== 'string') { return false; }
  const trimmed = x.trim();
  if (trimmed.length === 0 || trimmed.length > ROOM_NAME_MAX_LENGTH) { return false; }
  return ROOM_NAME_PATTERN.test(trimmed);
}

export function normalizeRoomName(name: string): string { return name.trim().toLowerCase();}
