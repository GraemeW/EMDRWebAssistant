export interface ServerConfig {
  port: number;
  host: string;
  directorPassphrase: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    directorPassphrase: env.DIRECTOR_PASSPHRASE ?? 'director',
  };
}
