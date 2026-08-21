import type { BobbleShape, BobbleSettings, ClientMessage, ServerMessage } from './types.js';
import { isValidRoomName } from './rooms.js';

// Tunables
const BOBBLE_SHAPES: readonly BobbleShape[] = ['circle', 'square', 'triangle'];

// Type Validation
export function isBobbleShape(x: unknown): x is BobbleShape { return typeof x === 'string' && (BOBBLE_SHAPES as readonly string[]).includes(x); }

export function isBobbleSettings(x: unknown): x is BobbleSettings {
  if (!isRecord(x)) { return false; }
  return (
    isBobbleShape(x.shape) &&
    typeof x.bobbleColor === 'string' &&
    typeof x.backgroundColor === 'string' &&
    isFiniteNumber(x.size) &&
    isFiniteNumber(x.speed) &&
    isFiniteNumber(x.range) &&
    typeof x.beepOnBounce === 'boolean'
  );
}

export function isClientMessage(x: unknown): x is ClientMessage {
  if (!isRecord(x)) { return false; }

  switch (x.type) {
    case 'join':
      if (!isValidRoomName(x.room)) { return false; }
      if (x.role === 'admin') { return typeof x.digest === 'string'; }
      if (x.role === 'viewer') { return true; }
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
        case 'setBeepOnBounce':
          return typeof x.value === 'boolean';
        case 'loadSettings':
          return isBobbleSettings(x.value);
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

export function isServerMessage(x: unknown): x is ServerMessage {
  if (!isRecord(x)) { return false; }

  switch (x.type) {
    case 'joined':
      return x.role === 'admin' || x.role === 'viewer' || x.role === null;
    case 'state':
      // The state payload's own shape is trusted here since it only ever comes from our own server
      return isRecord(x.state);
    case 'pong':
      return isFiniteNumber(x.t) && isFiniteNumber(x.serverTime);
    case 'challenge':
      return typeof x.nonce === 'string';
    case 'kicked':
      return typeof x.reason === 'string';
    default:
      return false;
  }
}

// Local Functions
function isFiniteNumber(x: unknown): x is number { return typeof x === 'number' && Number.isFinite(x); }

function isRecord(x: unknown): x is Record<string, unknown> { return typeof x === 'object' && x !== null; }
