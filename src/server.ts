import path from 'node:path';
import http from 'node:http';
import express from 'express';

import { loadConfig } from './server/config.js';
import { DirectorAuth } from './server/auth.js';
import { BobbleSession } from './server/bobble-session.js';
import { ConnectionRegistry } from './server/connections.js';
import { MessageRouter } from './server/message-router.js';

const config = loadConfig();

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
const httpServer = http.createServer(app);

const auth = new DirectorAuth(config.directorPassphrase);
const session = new BobbleSession();
const connections = new ConnectionRegistry(httpServer);
const router = new MessageRouter(session, connections, auth);

connections.onConnection((ws) => {
  ws.on('message', (raw) => router.handleRawMessage(ws, raw));
  ws.on('close', () => router.handleClose(ws));
  router.handleNewConnection(ws);
});

httpServer.listen(config.port, config.host, () => {
  console.log(`EMDR Web Assistant server listening on http://${config.host}:${config.port}`);
  console.log('Director passphrase is set via the DIRECTOR_PASSPHRASE env var (defaults to "director").');
});
