export interface ServerConfig {
  port: number;
  adminUsername: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3000),
    adminUsername: env.ADMIN_USERNAME ?? 'director',
  };
}
