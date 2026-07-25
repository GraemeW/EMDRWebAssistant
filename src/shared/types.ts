// Shared, type-only contract between server and client. Every value here
// is either an interface or a union of literal types — nothing runtime —
// so `import type { ... }` on both sides erases completely at compile time.

export type BobbleShape = 'circle' | 'square' | 'triangle';

export type Direction = 1 | -1;

/** A frozen snapshot the position/speed formula can be re-derived from at any later time. */
export interface Anchor {
  fraction: number;
  direction: Direction;
  /** Instantaneous fractional speed at time `t` — may be mid-ramp. */
  speed: number;
  t: number;
}

/** The authoritative, server-owned bobble session. */
export interface SessionState {
  shape: BobbleShape;
  bobbleColor: string;
  backgroundColor: string;
  size: number;
  speed: number;
  range: number;
  /** Desired play/pause state, as last commanded by the director. */
  running: boolean;
  anchor: Anchor;
}

/** SessionState plus fields only relevant once it's broadcast to clients. */
export interface PublicState extends SessionState {
  adminOnline: boolean;
  viewerCount: number;
  serverTime: number;
}

export type Role = 'admin' | 'viewer';

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

/** Every admin control action, discriminated on `action`. */
export type ControlAction =
  | { action: 'setShape'; value: BobbleShape }
  | { action: 'setBobbleColor'; value: string }
  | { action: 'setBackgroundColor'; value: string }
  | { action: 'setSize'; value: number }
  | { action: 'setSpeed'; value: number }
  | { action: 'setRange'; value: number }
  | { action: 'toggleRunning' }
  | { action: 'setRunning'; value: boolean }
  | { action: 'reset' };

export type ControlMessage = { type: 'control' } & ControlAction;

export type ClientMessage =
  | { type: 'join'; role: 'admin'; username: string }
  | { type: 'join'; role: 'viewer' }
  | ControlMessage
  | { type: 'ping'; t: number };

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { type: 'joined'; role: Role | null; error?: string }
  | { type: 'state'; state: PublicState }
  | { type: 'pong'; t: number; serverTime: number };
