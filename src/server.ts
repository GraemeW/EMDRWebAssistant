import path from 'node:path';
import http from 'node:http';
import express from 'express';

import { loadConfig } from './server/config.js';
import { DirectorAuth } from './server/auth.js';
import { ConnectionAcceptor } from './server/connections.js';
import { RoomManager } from './server/room-manager.js';
import { MessageRouter } from './server/message-router.js';

const config = loadConfig();

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
const httpServer = http.createServer(app);

const auth = new DirectorAuth(config.directorPassphrase);
const acceptor = new ConnectionAcceptor(httpServer);
const rooms = new RoomManager({
  maxRooms: config.maxRooms,
  emptyRoomTeardownMs: config.emptyRoomTeardownMs,
});
const router = new MessageRouter(rooms, acceptor, auth);

acceptor.onConnection((ws) => {
  ws.on('message', (raw) => router.handleRawMessage(ws, raw));
  ws.on('close', () => router.handleClose(ws));
  router.handleNewConnection(ws);
});

httpServer.listen(config.port, config.host, () => {
  console.log(`EMDR Web Assistant server listening on http://${config.host}:${config.port}`);
  console.log('Director passphrase is set via the DIRECTOR_PASSPHRASE env var (defaults to "director").');
  console.log(`Rooms: up to ${config.maxRooms} concurrent, torn down after ${config.emptyRoomTeardownMs / 60_000} min empty.`);
});
