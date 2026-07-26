import type { Anchor, SessionState } from './types.js';

// Tunables
export const MIN_FRACTIONAL_SPEED = 0.005;
export const MAX_FRACTIONAL_SPEED = 0.05;
export const TIME_OFFSET_FACTOR = 50.0;
export const RAMP_DURATION = 1.5;

// Types
export type MotionInput = Pick<SessionState, 'range' | 'size' | 'speed' | 'running'> & { anchor: Anchor };

// Interfaces
export interface Bounds {
  lower: number;
  upper: number;
}

export interface MotionSample {
  fraction: number;
  direction: 1 | -1;
  speed: number;
}

// Utilities
export function clamp01(v: number): number { return Math.min(1, Math.max(0, v)); }

export function speedToFractionPerSecond(relativeSpeed: number): number {
  const f = MIN_FRACTIONAL_SPEED + (MAX_FRACTIONAL_SPEED - MIN_FRACTIONAL_SPEED) * relativeSpeed;
  return f * TIME_OFFSET_FACTOR;
}

function spriteMargin(size: number): number { return 0.03 + size * 0.05; }

export function getBounds(range: number, size: number): Bounds {
  const margin = spriteMargin(size) / 2;
  const lower = clamp01(0.5 - range / 2) + margin;
  const upper = clamp01(0.5 + range / 2) - margin;
  return upper > lower ? { lower, upper } : { lower: 0.5, upper: 0.5 };
}

// Core Motion
export function computeAt(s: MotionInput, now: number): MotionSample {
  const { lower, upper } = getBounds(s.range, s.size);
  const range = upper - lower;
  if (range <= 0) return { fraction: lower, direction: 1, speed: 0 };

  const deltaTime = Math.max(0, (now - s.anchor.t) / 1000);
  const fullSpeed = speedToFractionPerSecond(s.speed);
  const target = s.running ? fullSpeed : 0;
  const s0 = s.anchor.speed;
  const rampRate = fullSpeed / RAMP_DURATION; // magnitude

  let distance: number;
  let speedNow: number;

  if (rampRate === 0 || Math.abs(target - s0) < 1e-9) {
    speedNow = target;
    distance = target * deltaTime;
  } else {
    const signedRate = target > s0 ? rampRate : -rampRate;
    const dtRamp = Math.abs(target - s0) / rampRate;
    if (deltaTime <= dtRamp) {
      speedNow = s0 + signedRate * deltaTime;
      distance = s0 * deltaTime + 0.5 * signedRate * deltaTime * deltaTime;
    } else {
      const distanceDuringRamp = s0 * dtRamp + 0.5 * signedRate * dtRamp * dtRamp;
      speedNow = target;
      distance = distanceDuringRamp + target * (deltaTime - dtRamp);
    }
  }

  const period = 2 * range;
  const anchorOffset = s.anchor.fraction - lower;
  const u0 = s.anchor.direction === 1 ? anchorOffset : period - anchorOffset;
  let u = (u0 + distance) % period;
  if (u < 0) { u += period; }

  return u <= range
    ? { fraction: lower + u, direction: 1, speed: speedNow }
    : { fraction: lower + (period - u), direction: -1, speed: speedNow };
}
