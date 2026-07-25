import path from 'node:path';
import http from 'node:http';
import express from 'express';
import WebSocket from 'ws';

import type { ControlMessage, PublicState, Role, ServerMessage, SessionState } from './shared/types.js';
import { isClientMessage } from './shared/validate.js';
import { clamp01, speedToFractionPerSecond, computeAt } from './shared/motion.js';

const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'director';

// ---- Defaults (ported from EMDRBobble.cs / BobbleMover.cs / MenuController.cs) ----
const DEFAULT_SHAPE = 'circle' as const;
const DEFAULT_BOBBLE_COLOR = '#ffffff';
const DEFAULT_SIZE = 0.3;
const DEFAULT_BACKGROUND_COLOR = '#000000';
const DEFAULT_SPEED = 0.35;
const DEFAULT_RANGE = 1.0;
const INITIAL_X_FRACTION = 0.65;

function freshState(): SessionState {
  return {
    shape: DEFAULT_SHAPE,
    bobbleColor: DEFAULT_BOBBLE_COLOR,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    size: DEFAULT_SIZE,
    speed: DEFAULT_SPEED,
    range: DEFAULT_RANGE,
    running: true,
    anchor: {
      fraction: INITIAL_X_FRACTION,
      direction: 1,
      speed: speedToFractionPerSecond(DEFAULT_SPEED),
      t: Date.now(),
    },
  };
}

let state: SessionState = freshState();

/** A ws socket, tagged with the role it's claimed in this session. */
interface ClientSocket extends WebSocket {
  role: Role | 'unjoined';
}

let adminSocket: ClientSocket | null = null;

function reanchor(now: number): void {
  const sample = computeAt(state, now);
  state.anchor = { ...sample, t: now };
}

function countViewers(sockets: Iterable<WebSocket>): number {
  let n = 0;
  for (const c of sockets) {
    if ((c as ClientSocket).role === 'viewer') n += 1;
  }
  return n;
}

function publicState(sockets: Iterable<WebSocket>): PublicState {
  return {
    ...state,
    adminOnline: adminSocket !== null,
    viewerCount: countViewers(sockets),
    serverTime: Date.now(),
  };
}

// ---- HTTP + WebSocket wiring ----
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMessage): void {
  const payload = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

function broadcastState(): void {
  broadcast({ type: 'state', state: publicState(wss.clients) });
}

/** Applies one admin control action. Exhaustively — a new ControlAction
 * variant that isn't handled here fails to compile, not just at runtime. */
function applyControl(msg: ControlMessage): void {
  const now = Date.now();
  switch (msg.action) {
    case 'setShape':
      state.shape = msg.value;
      return;
    case 'setBobbleColor':
      state.bobbleColor = msg.value;
      return;
    case 'setBackgroundColor':
      state.backgroundColor = msg.value;
      return;
    case 'setSize':
      reanchor(now);
      state.size = clamp01(msg.value);
      return;
    case 'setSpeed':
      reanchor(now);
      state.speed = clamp01(msg.value);
      // Changing the setpoint takes effect immediately (no ramp) — but only
      // actually moves the bobble if it's currently playing.
      state.anchor.speed = state.running ? speedToFractionPerSecond(state.speed) : 0;
      return;
    case 'setRange':
      reanchor(now);
      state.range = clamp01(msg.value);
      return;
    case 'toggleRunning':
      reanchor(now);
      state.running = !state.running;
      return;
    case 'setRunning':
      reanchor(now);
      state.running = msg.value;
      return;
    case 'reset': {
      const wasRunning = state.running;
      state = freshState();
      state.running = wasRunning; // keep play/pause as it was, reset everything else
      state.anchor.speed = wasRunning ? speedToFractionPerSecond(state.speed) : 0;
      return;
    }
    default: {
      // Exhaustiveness check: if ControlAction ever grows a new variant
      // without a case above, this line stops compiling.
      const exhaustive: never = msg;
      throw new Error(`Unhandled control action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function handleJoin(ws: ClientSocket, msg: { role: 'admin'; username: string } | { role: 'viewer' }): void {
  if (msg.role === 'admin') {
    if (adminSocket !== null && adminSocket !== ws && adminSocket.readyState === WebSocket.OPEN) {
      send(ws, { type: 'joined', role: 'viewer', error: 'A director is already running this session.' });
      ws.role = 'viewer';
      broadcastState();
      return;
    }
    if (msg.username !== ADMIN_USERNAME) {
      send(ws, { type: 'joined', role: null, error: 'Incorrect director username.' });
      return;
    }
    adminSocket = ws;
    ws.role = 'admin';
    send(ws, { type: 'joined', role: 'admin' });
    broadcastState();
    return;
  }

  ws.role = 'viewer';
  send(ws, { type: 'joined', role: 'viewer' });
  broadcastState();
}

wss.on('connection', (socket: WebSocket) => {
  const ws = socket as ClientSocket;
  ws.role = 'unjoined';

  ws.on('message', (raw: WebSocket.RawData) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!isClientMessage(parsed)) return;

    switch (parsed.type) {
      case 'join':
        handleJoin(ws, parsed);
        return;
      case 'control':
        if (ws.role !== 'admin' || ws !== adminSocket) return; // ignore non-admin control attempts
        applyControl(parsed);
        broadcastState();
        return;
      case 'ping':
        send(ws, { type: 'pong', t: parsed.t, serverTime: Date.now() });
        return;
      default: {
        const exhaustive: never = parsed;
        return exhaustive;
      }
    }
  });

  ws.on('close', () => {
    if (ws === adminSocket) adminSocket = null;
    broadcastState();
  });

  send(ws, { type: 'state', state: publicState(wss.clients) });
});

server.listen(PORT, () => {
  console.log(`EMDR bobble server listening on http://localhost:${PORT}`);
  console.log(`Director username: "${ADMIN_USERNAME}" (set ADMIN_USERNAME env var to change it)`);
});
