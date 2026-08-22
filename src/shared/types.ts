// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export type BobbleShape = 'circle' | 'square' | 'triangle';

export type Direction = 1 | -1;

export interface Anchor {
  fraction: number;
  direction: Direction;
  speed: number;
  t: number;
}

export interface SessionState {
  shape: BobbleShape;
  bobbleColor: string;
  backgroundColor: string;
  size: number;
  speed: number;
  range: number;
  running: boolean;
  beepOnBounce: boolean;
  beepFrequency: number;
  anchor: Anchor;
}

export interface PublicState extends SessionState {
  adminOnline: boolean;
  viewerCount: number;
  serverTime: number;
}

export type Role = 'admin' | 'viewer';

// Save State Tunables
export interface BobbleSettings {
  shape: BobbleShape;
  bobbleColor: string;
  backgroundColor: string;
  size: number;
  speed: number;
  range: number;
  beepOnBounce: boolean;
  beepFrequency: number;
}

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export type ControlAction =
  | { action: 'setShape'; value: BobbleShape }
  | { action: 'setBobbleColor'; value: string }
  | { action: 'setBackgroundColor'; value: string }
  | { action: 'setSize'; value: number }
  | { action: 'setSpeed'; value: number }
  | { action: 'setRange'; value: number }
  | { action: 'toggleRunning' }
  | { action: 'setRunning'; value: boolean }
  | { action: 'setBeepOnBounce'; value: boolean }
  | { action: 'setBeepFrequency'; value: number }
  | { action: 'reset' }
  | { action: 'loadSettings'; value: BobbleSettings };

export type ControlMessage = { type: 'control' } & ControlAction;

export type ClientMessage =
  | { type: 'join'; role: 'admin'; digest: string; room: string }
  | { type: 'join'; role: 'viewer'; room: string }
  | ControlMessage
  | { type: 'ping'; t: number };

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { type: 'joined'; role: Role | null; error?: string; room?: string }
  | { type: 'state'; state: PublicState }
  | { type: 'pong'; t: number; serverTime: number }
  | { type: 'challenge'; nonce: string }
  | { type: 'kicked'; reason: string };
