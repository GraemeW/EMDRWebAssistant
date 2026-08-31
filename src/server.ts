import path from 'node:path';
import http from 'node:http';
import express from 'express';

import { loadConfig } from './server/config.js';
import { DirectorAuth } from './server/auth.js';
import { ConnectionAcceptor } from './server/connections.js';
import { createLogger } from './server/logger.js';
import { RoomManager } from './server/room-manager.js';
import { MessageRouter } from './server/message-router.js';

// Tunables
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://canner.ca https://api.canner.ca",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self'",
  "connect-src 'self' ws: wss: https://api.canner.ca https://canner.ca",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const config = loadConfig();

const app = express();
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));
const httpServer = http.createServer(app);

const logger = createLogger();
const auth = new DirectorAuth(config.directorPassphrase);
const acceptor = new ConnectionAcceptor(httpServer);
const rooms = new RoomManager(
  { maxRooms: config.maxRooms, emptyRoomTeardownMs: config.emptyRoomTeardownMs },
  logger,
);
const router = new MessageRouter(rooms, acceptor, auth, logger);

acceptor.onConnection((ws) => {
  ws.on('message', (raw) => router.handleRawMessage(ws, raw));
  ws.on('close', () => router.handleClose(ws));
  router.handleNewConnection(ws);
});

httpServer.listen(config.port, config.host, () => {
  console.log(`The Window Sill server listening on http://${config.host}:${config.port}`);
  console.log('Director passphrase is set via the DIRECTOR_PASSPHRASE env var (defaults to "director").');
  console.log(`Rooms: up to ${config.maxRooms} concurrent, torn down after ${config.emptyRoomTeardownMs / 60_000} min empty.`);
  console.log('Event log: stdout (JSON-lines) — capture/retention is handled by your hosting platform.');
  logger.log('server_start', {
    port: config.port,
    host: config.host,
    maxRooms: config.maxRooms,
    emptyRoomTeardownMs: config.emptyRoomTeardownMs,
  });
});

function shutdown(signal: string): void {
  logger.log('server_stop', { signal });
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref(); // fallback in case close() hangs on open sockets
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
