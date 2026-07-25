import { isBobbleShape, isServerMessage } from '../shared/validate.js';
import { computeAt } from '../shared/motion.js';
function requireElement(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`Missing #${id} in the page`);
    return el;
}
// ---- DOM refs ----
const landing = requireElement('landing');
const session = requireElement('session');
const usernameInput = requireElement('director-username');
const btnJoinAdmin = requireElement('btn-join-admin');
const btnJoinViewer = requireElement('btn-join-viewer');
const adminHint = requireElement('admin-hint');
const viewerHint = requireElement('viewer-hint');
const roleBadge = requireElement('role-badge');
const directorStatus = requireElement('director-status');
const stage = requireElement('stage');
const bobbleEl = requireElement('bobble');
const controls = requireElement('controls');
const btnToggleRun = requireElement('btn-toggle-run');
const btnReset = requireElement('btn-reset');
const shapeButtons = Array.from(document.querySelectorAll('.shape-btn'));
const sizeSlider = requireElement('size-slider');
const speedSlider = requireElement('speed-slider');
const rangeSlider = requireElement('range-slider');
const bobbleColorInput = requireElement('bobble-color');
const backgroundColorInput = requireElement('background-color');
const btnFullscreen = requireElement('btn-fullscreen');
// ---- Connection + local state ----
let ws = null;
let myRole = null;
let latestState = null;
let clockOffset = 0; // serverTime - localTime, sampled on each state message
let pendingAdminJoin = false;
function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}`;
}
function connect() {
    const socket = new WebSocket(wsUrl());
    ws = socket;
    socket.addEventListener('open', () => {
        adminHint.textContent = '';
        viewerHint.textContent = '';
    });
    socket.addEventListener('close', () => {
        if (!session.classList.contains('hidden')) {
            directorStatus.textContent = 'Connection lost — reconnecting…';
        }
        setTimeout(connect, 1500);
    });
    socket.addEventListener('message', (evt) => {
        let parsed;
        try {
            parsed = JSON.parse(evt.data);
        }
        catch {
            return;
        }
        if (!isServerMessage(parsed))
            return;
        handleMessage(parsed);
    });
}
function handleMessage(msg) {
    switch (msg.type) {
        case 'joined':
            if (pendingAdminJoin) {
                pendingAdminJoin = false;
                if (msg.role === 'admin') {
                    enterSession('admin');
                }
                else {
                    adminHint.textContent = msg.error ?? 'Could not join as director.';
                    if (msg.role === 'viewer')
                        enterSession('viewer');
                }
            }
            else if (msg.role === 'viewer') {
                enterSession('viewer');
            }
            return;
        case 'state':
            latestState = msg.state;
            clockOffset = msg.state.serverTime - Date.now();
            applyStateToUI(msg.state);
            return;
        case 'pong':
            return;
        default: {
            // Exhaustiveness check: a new ServerMessage variant that isn't
            // handled above stops this from compiling.
            const exhaustive = msg;
            return exhaustive;
        }
    }
}
function enterSession(role) {
    myRole = role;
    landing.classList.add('hidden');
    session.classList.remove('hidden');
    roleBadge.textContent = role === 'admin' ? 'director' : 'viewer';
    roleBadge.classList.toggle('is-admin', role === 'admin');
    controls.classList.toggle('hidden', role !== 'admin');
}
// ---- Landing interactions ----
btnJoinAdmin.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (!username) {
        adminHint.textContent = 'Enter the director username first.';
        return;
    }
    pendingAdminJoin = true;
    adminHint.textContent = '';
    sendWhenReady({ type: 'join', role: 'admin', username });
});
usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')
        btnJoinAdmin.click();
});
btnJoinViewer.addEventListener('click', () => {
    sendWhenReady({ type: 'join', role: 'viewer' });
});
function sendWhenReady(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
    else {
        setTimeout(() => sendWhenReady(msg), 150);
    }
}
/** Sends one admin control action, built as a real typed value rather than
 * loose strings — a typo in `action` or a mismatched `value` type is a
 * compile error here, not a silent no-op on the wire. */
function sendControl(action) {
    if (myRole !== 'admin')
        return;
    sendWhenReady({ type: 'control', ...action });
}
// ---- Admin control bindings ----
btnToggleRun.addEventListener('click', () => sendControl({ action: 'toggleRunning' }));
btnReset.addEventListener('click', () => sendControl({ action: 'reset' }));
shapeButtons.forEach((btn) => {
    const shape = btn.dataset.shape;
    if (!isBobbleShape(shape)) {
        console.warn(`Shape button has an unrecognized data-shape value: ${String(shape)}`);
        return;
    }
    btn.addEventListener('click', () => sendControl({ action: 'setShape', value: shape }));
});
sizeSlider.addEventListener('input', () => sendControl({ action: 'setSize', value: Number(sizeSlider.value) }));
speedSlider.addEventListener('input', () => sendControl({ action: 'setSpeed', value: Number(speedSlider.value) }));
rangeSlider.addEventListener('input', () => sendControl({ action: 'setRange', value: Number(rangeSlider.value) }));
bobbleColorInput.addEventListener('input', () => sendControl({ action: 'setBobbleColor', value: bobbleColorInput.value }));
backgroundColorInput.addEventListener('input', () => sendControl({ action: 'setBackgroundColor', value: backgroundColorInput.value }));
btnFullscreen.addEventListener('click', () => {
    // Local-only: the Fullscreen API requires a user gesture on each browser,
    // so this can't be driven remotely for viewers — each device toggles its own.
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => { });
    }
    else {
        document.exitFullscreen().catch(() => { });
    }
});
// ---- Reflect server state into the UI (sliders, badges, colors) ----
function applyStateToUI(s) {
    stage.style.background = s.backgroundColor;
    if (s.adminOnline) {
        const n = s.viewerCount;
        directorStatus.textContent = `Director online · ${n} ${n === 1 ? 'viewer' : 'viewers'} watching`;
    }
    else {
        directorStatus.textContent = 'No director connected — controls are idle';
    }
    if (myRole === 'admin') {
        btnToggleRun.textContent = s.running ? 'Pause' : 'Resume';
        shapeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.shape === s.shape));
        if (document.activeElement !== sizeSlider)
            sizeSlider.value = String(s.size);
        if (document.activeElement !== speedSlider)
            speedSlider.value = String(s.speed);
        if (document.activeElement !== rangeSlider)
            rangeSlider.value = String(s.range);
        if (document.activeElement !== bobbleColorInput)
            bobbleColorInput.value = s.bobbleColor;
        if (document.activeElement !== backgroundColorInput)
            backgroundColorInput.value = s.backgroundColor;
    }
}
// ---- Render loop: recompute bobble position every frame from the
// last-known state + elapsed time, using the same shared formula the
// server uses, so motion stays smooth between messages. ----
function render() {
    if (latestState && !session.classList.contains('hidden')) {
        const now = Date.now() + clockOffset;
        const sample = computeAt(latestState, now);
        const rect = stage.getBoundingClientRect();
        const minDim = Math.min(rect.width, rect.height);
        const diameter = Math.max(14, minDim * (0.04 + latestState.size * 0.22));
        const x = sample.fraction * rect.width;
        const y = 0.5 * rect.height;
        bobbleEl.style.left = `${x}px`;
        bobbleEl.style.top = `${y}px`;
        bobbleEl.classList.remove('shape-circle', 'shape-square', 'shape-triangle');
        bobbleEl.classList.add(`shape-${latestState.shape}`);
        if (latestState.shape === 'triangle') {
            bobbleEl.style.width = '0';
            bobbleEl.style.height = '0';
            bobbleEl.style.borderLeft = `${diameter / 2}px solid transparent`;
            bobbleEl.style.borderRight = `${diameter / 2}px solid transparent`;
            bobbleEl.style.borderBottom = `${diameter * 0.87}px solid ${latestState.bobbleColor}`;
        }
        else {
            bobbleEl.style.border = 'none';
            bobbleEl.style.width = `${diameter}px`;
            bobbleEl.style.height = `${diameter}px`;
            bobbleEl.style.background = latestState.bobbleColor;
        }
    }
    requestAnimationFrame(render);
}
connect();
requestAnimationFrame(render);
//# sourceMappingURL=client.js.map