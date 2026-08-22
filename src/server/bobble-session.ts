import type { ControlMessage, SessionState } from '../shared/types.js';
import { clamp01, speedToFractionPerSecond, computeAt } from '../shared/motion.js';

// Tunables
const DEFAULT_SHAPE = 'circle' as const;
const DEFAULT_BOBBLE_COLOR = '#ffffff';
const DEFAULT_SIZE = 0.3;
const DEFAULT_BACKGROUND_COLOR = '#000000';
const DEFAULT_SPEED = 0.35;
const DEFAULT_RANGE = 1.0;
const DEFAULT_BEEP_ON_BOUNCE = false;
const DEFAULT_BEEP_FREQUENCY_HZ = 440;
const MIN_BEEP_FREQUENCY_HZ = 100;
const MAX_BEEP_FREQUENCY_HZ = 2000;
const INITIAL_X_FRACTION = 0.65;

function clampBeepFrequency(hz: number): number {
  return Math.min(MAX_BEEP_FREQUENCY_HZ, Math.max(MIN_BEEP_FREQUENCY_HZ, hz));
}

// Initial State
function freshState(): SessionState {
  return {
    shape: DEFAULT_SHAPE,
    bobbleColor: DEFAULT_BOBBLE_COLOR,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    size: DEFAULT_SIZE,
    speed: DEFAULT_SPEED,
    range: DEFAULT_RANGE,
    running: true,
    beepOnBounce: DEFAULT_BEEP_ON_BOUNCE,
    beepFrequency: DEFAULT_BEEP_FREQUENCY_HZ,
    anchor: {
      fraction: INITIAL_X_FRACTION,
      direction: 1,
      speed: speedToFractionPerSecond(DEFAULT_SPEED),
      t: Date.now(),
    },
  };
}

export class BobbleSession {
  private state: SessionState = freshState();

  getState(): SessionState {
    return this.state;
  }

  applyControl(msg: ControlMessage): void {
    const now = Date.now();
    switch (msg.action) {
      case 'setShape':
        this.state.shape = msg.value;
        return;
      case 'setBobbleColor':
        this.state.bobbleColor = msg.value;
        return;
      case 'setBackgroundColor':
        this.state.backgroundColor = msg.value;
        return;
      case 'setSize':
        this.reanchor(now);
        this.state.size = clamp01(msg.value);
        return;
      case 'setSpeed':
        this.reanchor(now);
        this.state.speed = clamp01(msg.value);
        this.state.anchor.speed = this.state.running ? speedToFractionPerSecond(this.state.speed) : 0;
        return;
      case 'setRange':
        this.reanchor(now);
        this.state.range = clamp01(msg.value);
        return;
      case 'toggleRunning':
        this.reanchor(now);
        this.state.running = !this.state.running;
        return;
      case 'setRunning':
        this.reanchor(now);
        this.state.running = msg.value;
        return;
      case 'setBeepOnBounce':
        this.state.beepOnBounce = msg.value;
        return;
      case 'setBeepFrequency':
        this.state.beepFrequency = clampBeepFrequency(msg.value);
        return;
      case 'reset': {
        const wasRunning = this.state.running;
        this.state = freshState();
        this.state.running = wasRunning; // keep play/pause as it was, reset everything else
        this.state.anchor.speed = wasRunning ? speedToFractionPerSecond(this.state.speed) : 0;
        return;
      }
      case 'loadSettings': {
        this.reanchor(now); // size/speed/range are all changing at once, freeze position
        this.state.shape = msg.value.shape;
        this.state.bobbleColor = msg.value.bobbleColor;
        this.state.backgroundColor = msg.value.backgroundColor;
        this.state.size = clamp01(msg.value.size);
        this.state.speed = clamp01(msg.value.speed);
        this.state.range = clamp01(msg.value.range);
        this.state.beepOnBounce = msg.value.beepOnBounce;
        this.state.beepFrequency = clampBeepFrequency(msg.value.beepFrequency);
        this.state.anchor.speed = this.state.running ? speedToFractionPerSecond(this.state.speed) : 0;
        return;
      }
      default: {
        const exhaustive: never = msg;
        throw new Error(`Unhandled control action: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  // Private Methods
  private reanchor(now: number): void {
    const sample = computeAt(this.state, now);
    this.state.anchor = { ...sample, t: now };
  }
}
