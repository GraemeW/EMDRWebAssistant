"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const ws_1 = __importDefault(require("ws"));
const validate_js_1 = require("./shared/validate.js");
const motion_js_1 = require("./shared/motion.js");
const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'director';
// ---- Defaults (ported from EMDRBobble.cs / BobbleMover.cs / MenuController.cs) ----
const DEFAULT_SHAPE = 'circle';
const DEFAULT_BOBBLE_COLOR = '#ffffff';
const DEFAULT_SIZE = 0.3;
const DEFAULT_BACKGROUND_COLOR = '#000000';
const DEFAULT_SPEED = 0.35;
const DEFAULT_RANGE = 1.0;
const INITIAL_X_FRACTION = 0.65;
function freshState() {
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
            speed: (0, motion_js_1.speedToFractionPerSecond)(DEFAULT_SPEED),
            t: Date.now(),
        },
    };
}
let state = freshState();
let adminSocket = null;
function reanchor(now) {
    const sample = (0, motion_js_1.computeAt)(state, now);
    state.anchor = { ...sample, t: now };
}
function countViewers(sockets) {
    let n = 0;
    for (const c of sockets) {
        if (c.role === 'viewer')
            n += 1;
    }
    return n;
}
function publicState(sockets) {
    return {
        ...state,
        adminOnline: adminSocket !== null,
        viewerCount: countViewers(sockets),
        serverTime: Date.now(),
    };
}
// ---- HTTP + WebSocket wiring ----
const app = (0, express_1.default)();
app.use(express_1.default.static(node_path_1.default.join(__dirname, '..', 'public')));
const server = node_http_1.default.createServer(app);
const wss = new ws_1.default.Server({ server });
function send(ws, msg) {
    if (ws.readyState === ws_1.default.OPEN)
        ws.send(JSON.stringify(msg));
}
function broadcast(msg) {
    const payload = JSON.stringify(msg);
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.default.OPEN)
            client.send(payload);
    });
}
function broadcastState() {
    broadcast({ type: 'state', state: publicState(wss.clients) });
}
/** Applies one admin control action. Exhaustively — a new ControlAction
 * variant that isn't handled here fails to compile, not just at runtime. */
function applyControl(msg) {
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
            state.size = (0, motion_js_1.clamp01)(msg.value);
            return;
        case 'setSpeed':
            reanchor(now);
            state.speed = (0, motion_js_1.clamp01)(msg.value);
            // Changing the setpoint takes effect immediately (no ramp) — but only
            // actually moves the bobble if it's currently playing.
            state.anchor.speed = state.running ? (0, motion_js_1.speedToFractionPerSecond)(state.speed) : 0;
            return;
        case 'setRange':
            reanchor(now);
            state.range = (0, motion_js_1.clamp01)(msg.value);
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
            state.anchor.speed = wasRunning ? (0, motion_js_1.speedToFractionPerSecond)(state.speed) : 0;
            return;
        }
        default: {
            // Exhaustiveness check: if ControlAction ever grows a new variant
            // without a case above, this line stops compiling.
            const exhaustive = msg;
            throw new Error(`Unhandled control action: ${JSON.stringify(exhaustive)}`);
        }
    }
}
function handleJoin(ws, msg) {
    if (msg.role === 'admin') {
        if (adminSocket !== null && adminSocket !== ws && adminSocket.readyState === ws_1.default.OPEN) {
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
wss.on('connection', (socket) => {
    const ws = socket;
    ws.role = 'unjoined';
    ws.on('message', (raw) => {
        let parsed;
        try {
            parsed = JSON.parse(raw.toString());
        }
        catch {
            return;
        }
        if (!(0, validate_js_1.isClientMessage)(parsed))
            return;
        switch (parsed.type) {
            case 'join':
                handleJoin(ws, parsed);
                return;
            case 'control':
                if (ws.role !== 'admin' || ws !== adminSocket)
                    return; // ignore non-admin control attempts
                applyControl(parsed);
                broadcastState();
                return;
            case 'ping':
                send(ws, { type: 'pong', t: parsed.t, serverTime: Date.now() });
                return;
            default: {
                const exhaustive = parsed;
                return exhaustive;
            }
        }
    });
    ws.on('close', () => {
        if (ws === adminSocket)
            adminSocket = null;
        broadcastState();
    });
    send(ws, { type: 'state', state: publicState(wss.clients) });
});
server.listen(PORT, () => {
    console.log(`EMDR bobble server listening on http://localhost:${PORT}`);
    console.log(`Director username: "${ADMIN_USERNAME}" (set ADMIN_USERNAME env var to change it)`);
});
//# sourceMappingURL=server.js.map