// TypeScript's types disappear at runtime. Anything that came off the wire
// via JSON.parse is `unknown`, not `ClientMessage` or `ServerMessage`, no
// matter what we declare — a malicious or just-out-of-sync peer can send
// anything. These guards are the actual safety boundary; the types in
// shared/types.ts only describe what's on the *other* side of it.
const BOBBLE_SHAPES = ['circle', 'square', 'triangle'];
export function isBobbleShape(x) {
    return typeof x === 'string' && BOBBLE_SHAPES.includes(x);
}
function isFiniteNumber(x) {
    return typeof x === 'number' && Number.isFinite(x);
}
function isRecord(x) {
    return typeof x === 'object' && x !== null;
}
export function isClientMessage(x) {
    if (!isRecord(x))
        return false;
    switch (x.type) {
        case 'join':
            if (x.role === 'admin')
                return typeof x.username === 'string';
            if (x.role === 'viewer')
                return true;
            return false;
        case 'control':
            switch (x.action) {
                case 'setShape':
                    return isBobbleShape(x.value);
                case 'setBobbleColor':
                case 'setBackgroundColor':
                    return typeof x.value === 'string';
                case 'setSize':
                case 'setSpeed':
                case 'setRange':
                    return isFiniteNumber(x.value);
                case 'setRunning':
                    return typeof x.value === 'boolean';
                case 'toggleRunning':
                case 'reset':
                    return true;
                default:
                    return false;
            }
        case 'ping':
            return isFiniteNumber(x.t);
        default:
            return false;
    }
}
export function isServerMessage(x) {
    if (!isRecord(x))
        return false;
    switch (x.type) {
        case 'joined':
            return x.role === 'admin' || x.role === 'viewer' || x.role === null;
        case 'state':
            // The state payload's own shape is trusted here since it only ever
            // comes from our own server; deep-validating every field would be
            // reasonable too, but isn't needed for a same-origin protocol like this.
            return isRecord(x.state);
        case 'pong':
            return isFiniteNumber(x.t) && isFiniteNumber(x.serverTime);
        default:
            return false;
    }
}
//# sourceMappingURL=validate.js.map