# Bobble — web port

A one-driver, many-viewers web version of the Unity EMDR bobble app. One
person joins as the **director** and controls shape, color, size, speed,
travel range, background color, and play/pause. Anyone else can join as a
**viewer** and watches the same bobble, in sync, in real time.

Written in TypeScript, strict mode, with a shared, type-checked message
protocol between the server and browser client (details below).

## Running it

Requires Node.js (v18+) and npm.

```bash
npm install
npm start
```

`npm start` builds the TypeScript (server + client) and then runs the
compiled server. Open `http://localhost:3000` in a browser. Any number of
browsers/devices can point at the same URL.

By default the director username is `director`. Change it with an
environment variable if you'd like:

```bash
ADMIN_USERNAME=myname PORT=8080 npm start
```

### Other scripts

```bash
npm run typecheck   # type-check both the server and client, no output files
npm run build       # compile server -> dist/, client -> public/client/ and public/shared/
```

There's no dev-server/watch tooling added (kept dependency-light) — for
iterating, two terminals with Node's built-in watch flag works well and
needs no extra packages:

```bash
npx tsc -p tsconfig.server.json --watch    # terminal 1
node --watch dist/server.js                # terminal 2 (also rebuild the client on change)
```

## Deploying

Copy the whole folder (or just `src/`, `public/index.html`, `public/style.css`,
the `tsconfig*.json` files, and `package.json`) to any host that can run
Node — a small VPS, Render, Railway, Fly.io, a Raspberry Pi, etc. Run
`npm install && npm start` (or `npm run build` once, then `node dist/server.js`
directly, and keep it alive with `pm2` / `systemd`). No database, no bundler,
no build step beyond `tsc`.

Nothing is persisted to disk — all settings reset to defaults each time the
server process restarts, matching the "no saved settings" requirement.

## Project layout

```
src/
  server.ts           Express + WebSocket server (compiles to dist/)
  shared/
    types.ts           The WebSocket message protocol & session-state types
    validate.ts         Runtime type guards for messages coming off the wire
    motion.ts            The bounce/ramp position math (used by both sides)
  client/
    client.ts           Browser client (compiles to public/client/)
public/
  index.html            Landing screen + session screen markup (hand-written)
  style.css             Styling (hand-written)
  client/, shared/       *Generated* by `npm run build` — not committed
dist/                   *Generated* — the compiled server
tsconfig.base.json      Shared strict compiler options
tsconfig.server.json    Node/CommonJS build (src/server.ts + src/shared/*)
tsconfig.client.json    Browser/ESM build (src/client/* + src/shared/*)
```

`dist/` and `public/client/`, `public/shared/` are build output (see
`.gitignore`) — don't hand-edit files there, they get overwritten by
`npm run build`.

## Why two separate tsconfigs

The server runs on Node (CommonJS, no DOM) and the client runs in the
browser as a native ES module (`<script type="module">`, no bundler) — two
different runtimes with different `lib`/`module` needs, so they're two
separate `tsc` invocations sharing one `tsconfig.base.json` for the actual
strictness settings. `src/shared/*.ts` has zero Node- or DOM-specific APIs,
so it gets compiled twice (once per target) from the same source — the
bounce/ramp math and the message-protocol types are written exactly once,
not duplicated between server and client (which is what the original JS
version did, and exactly the kind of thing that quietly drifts over time).

## Type safety notes

A few things worth knowing about how the typing is set up, since some of
this is easy to get wrong (or skip) even in a "properly typed" TS project:

- **The protocol is a discriminated union** (`ClientMessage` / `ServerMessage`
  / `ControlAction` in `src/shared/types.ts`), and both `server.ts` and
  `client.ts` switch on it exhaustively — each `switch` has a `default` that
  assigns the remaining value to a `never`-typed variable. If someone adds a
  new message variant or control action later without updating every switch
  that handles it, **the build fails to compile** rather than silently
  ignoring the new case at runtime.
- **Types alone don't validate untrusted input.** `JSON.parse()` returns
  `any` (correctly typed here as `unknown`), and casting that straight to
  `ClientMessage`/`ServerMessage` would just be lying to the compiler — it
  wouldn't stop a mismatched or malicious payload from reaching your logic.
  `src/shared/validate.ts` has hand-written runtime type guards
  (`isClientMessage`, `isServerMessage`, `isBobbleShape`) that actually check
  the shape and values of incoming JSON before anything is treated as a
  typed message. This is the boundary that matters — the TS types describe
  what should be true on the other end of the wire, the guards are what
  actually enforces it.
- **`strict` plus a few extra flags** are on in `tsconfig.base.json`:
  `noUncheckedIndexedAccess` (indexing an array/record gives you `T | undefined`,
  not `T`), `noUnusedLocals`/`noUnusedParameters`, `noFallthroughCasesInSwitch`,
  and `noImplicitReturns`. `types: []` in the client config specifically
  prevents Node's global typings (`Buffer`, `process`, etc.) from leaking into
  browser code just because `@types/node` happens to be installed for the
  server.
- **DOM lookups are typed**, not `any`. `client.ts` uses a small
  `requireElement<T extends HTMLElement>(id)` helper that throws immediately
  if an expected element is missing from the page, instead of quietly letting
  `null` propagate through later code.
- **No TS `enum`.** `BobbleShape` is a union of string literals
  (`'circle' | 'square' | 'triangle'`) rather than an `enum` — this keeps it a
  pure compile-time type with zero runtime footprint, which matters because
  it's used directly as the wire value (an `enum` would need conversion
  to/from its runtime representation at the network boundary anyway).

## How it works

- **Server (`server.ts`)** holds the one authoritative session: current
  shape/color/size/speed/range/background/running state, plus an "anchor"
  (a position + direction + instantaneous speed + timestamp) it can use to
  analytically compute where the bobble is — and how fast it's currently
  moving — at any later moment. This mirrors `BobbleMover.cs`'s ping-pong
  motion and its speed-ramp easing, expressed as a closed-form formula (a
  piecewise ramp-then-constant speed profile, integrated to get distance)
  instead of a per-frame physics step, so the server never needs to run a
  game loop — it only recomputes on changes.
- Only one WebSocket connection can hold the **director** role at a time
  (claimed by sending the fixed username). If the director disconnects, the
  bobble keeps doing whatever it was doing, and the seat is free for anyone
  (including the same person) to reclaim.
- Every other connection is a **viewer**: read-only, gets the live state and
  renders the same motion locally using the same shared `computeAt` formula,
  so all screens track closely without the server streaming a position
  every frame.
- State changes (color, shape, size, speed, range, play/pause, reset) are
  broadcast to everyone instantly over WebSocket.

## Deliberate simplifications vs. the Unity version

- **No saved settings** — by design, per the original requirements.
- **Fullscreen is local-only.** Each browser can fullscreen itself, but
  browsers won't let one page force fullscreen on another device, so this
  isn't synced (unlike everything else).
- **Speed ramps on play/pause**, matching `BobbleMover.cs`'s 1.5s
  `_speedRampTime`: pressing pause decelerates smoothly to a stop rather
  than snapping instantly, and resuming eases back up to speed (including
  correctly resuming from wherever it actually was if you hit play again
  mid-decel).
- Session is singular by design (only one director seat, ever), matching
  "only one session needs to be active at a time."
