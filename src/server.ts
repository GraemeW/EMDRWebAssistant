import path from 'node:path';
import http from 'node:http';
import express from 'express';

import { loadConfig } from './server/config.js';
import { BobbleSession } from './server/bobble-session.js';
import { ConnectionRegistry } from './server/connections.js';
import { MessageRouter } from './server/message-router.js';

const config = loadConfig();

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
const httpServer = http.createServer(app);

const session = new BobbleSession();
const connections = new ConnectionRegistry(httpServer);
const router = new MessageRouter(session, connections, config.adminUsername);

connections.onConnection((ws) => {
  ws.on('message', (raw) => router.handleRawMessage(ws, raw));
  ws.on('close', () => router.handleClose(ws));
  router.sendInitialState(ws);
});

httpServer.listen(config.port, () => {
  console.log(`EMDR bobble server listening on http://localhost:${config.port}`);
  console.log(`Director username: "${config.adminUsername}" (set ADMIN_USERNAME env var to change it)`);
});
