export interface ServerConfig {
  port: number;
  host: string;
  directorPassphrase: string;
  maxRooms: number;
  emptyRoomTeardownMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    directorPassphrase: env.DIRECTOR_PASSPHRASE ?? 'director',
    maxRooms: Number(env.MAX_ROOMS ?? 100),
    emptyRoomTeardownMs: Number(env.EMPTY_ROOM_TEARDOWN_MINUTES ?? 5) * 60_000,
  };
}
