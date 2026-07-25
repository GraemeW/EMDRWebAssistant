# EMDR Web Assistant

A NodeJS port of the Unity EMDR bobble app. One person joins as the **director** and controls shape, color, size, speed, travel range, background color, and play/pause. The client can thenb join as a **viewer** and watch the same bobble, in sync, in real time.

Written in TypeScript, strict mode, with a shared, type-checked message protocol between the server and browser client (details below).

## Running it

Requires Node.js (v18+) and npm.

```bash
npm install
npm start
```

`npm start` builds the TypeScript (server + client) and then runs the compiled server. Open `http://localhost:3000` in a browser.

By default the director username is `director`, to be updated with some level of encryption momentarily.

```bash
ADMIN_USERNAME=myname PORT=8080 npm start
```

### Other scripts

```bash
npm run typecheck   # type-check both the server and client, no output files
npm run build       # compile server -> dist/, client -> public/client/ and public/shared/
```

There's no dev-server/watch tooling added to keep the overall package dependency-light.  For iterating, two terminals with Node's built-in watch flag works well:

```bash
npx tsc -p tsconfig.server.json --watch    # terminal 1
node --watch dist/server.js                # terminal 2 (also rebuild the client on change)
```

## Deploying

Copy the whole folder (or just `src/`, `public/index.html`, `public/style.css`, the `tsconfig*.json` files, and `package.json`) to any host that can run Node — a small VPS, Render, Railway, Fly.io, a Raspberry Pi, etc. Run `npm install && npm start` (or `npm run build` once, then `node dist/server.js` directly, and keep it alive with `pm2` / `systemd`). No database, no bundler, no build step beyond `tsc`.

Nothing is persisted to disk — all settings reset to defaults each time the server process restarts.

## Project layout

```
src/
  server.ts             Slim composition root: wires config/session/connections/router together
  server/
    config.ts             Env-derived config (PORT, ADMIN_USERNAME)
    bobble-session.ts      Bobble's physics state + applyControl
    connections.ts          WebSocket client/role bookkeeping
    message-router.ts       Parse incoming frames and ties session + connections together
  shared/
    types.ts             WebSocket message protocol & session-state types
    validate.ts           Runtime type guards for messages coming off the wire
    motion.ts               Bounce/ramp position math
  client/
    client.ts             Slim composition root: wires connection/renderer/controller together
    connection.ts           WebSocket lifecycle (connect/reconnect/send)
    dom.ts                   Typed element lookups
    renderer.ts               Per-frame paint loop
    session-controller.ts      Orchestrator: wires dom + connection + renderer together
public/
  index.html            Landing screen + session screen markup
  style.css             Styling
  client/, shared/       *Generated* by `npm run build` — not committed
dist/                   *Generated* — the compiled server
tsconfig.base.json      Shared strict compiler options
tsconfig.server.json    Node/CommonJS build (src/server.ts + src/server/* + src/shared/*)
tsconfig.client.json    Browser/ESM build (src/client/* + src/shared/*)
```

`dist/` and `public/client/`, `public/shared/` are build output (see `.gitignore`) — don't hand-edit files there, they get overwritten by `npm run build`.

## High-Level Notes on Architecture

Both sides follow the same shape:

Narrowly-scoped modules underneath a small orchestrator, underneath a slim composition-root entry
point that  wires them together and starts things up:

**Server** (`src/server.ts` wires these three together):
- `BobbleSession` — owns the bobble's state and the rules for mutating it
- `ConnectionRegistry` — owns the WebSocket client set and roles (who's the
  one director, how many viewers)
- `MessageRouter` — the only module that knows about both of the above:
  parses/validates incoming frames, decides what they mean, and composes
  the broadcasted `PublicState` from `BobbleSession` + `ConnectionRegistry`

**Client** (`src/client/client.ts` wires these three together):
- `ServerConnection` — owns the raw WebSocket (connect, reconnect, parse,
  send)
- `BobbleRenderer` — owns the per-frame paint loop - pure function of
  whatever `{ state, now, visible }` that it's handed each frame
- `SessionController` — the only module that knows about `dom.ts`,
  `ServerConnection`, and `BobbleRenderer` all at once: wires UI events to
  outgoing messages, reflects incoming state onto the UI, and feeds the
  renderer

## Why two separate tsconfigs

The server runs on Node (CommonJS, no DOM) and the client runs in the browser as a native ES module (`<script type="module">`, no bundler) — two different runtimes with different `lib`/`module` needs, so they're two separate `tsc` invocations sharing one `tsconfig.base.json` for the actual strictness settings. `src/shared/*.ts` has zero Node- or DOM-specific APIs, so it gets compiled twice (once per target) from the same source — the bounce/ramp math and the message-protocol types are written exactly once, not duplicated between server and client.

`tsconfig.json` at the root doesn't compile anything itself (`"files": []`), it just `references` the two leaf configs. Editors discover a project's settings by walking up from an open file to the nearest `tsconfig.json`, and having only `tsconfig.server.json`/
`tsconfig.client.json` (no plain `tsconfig.json`) means an editor may not find either one and fall back to an inferred default project with different defaults.  This can produce confusing type errors that don't reproduce when you actually run `npm run typecheck`. One side effect: composite mode requires declaration output, so you'll see `.d.ts` files alongside the compiled `.js` in `dist/`/`public/client/`/`public/shared/`.

## How it works

- **Server (`server.ts`)** holds the one authoritative session: current shape/color/size/speed/range/background/running state, plus an "anchor" (a position + direction + instantaneous speed + timestamp) it can use to analytically compute where the bobble is — and how fast it's currently moving — at any later moment. This mirrors `BobbleMover.cs`'s ping-pong motion and its speed-ramp easing, expressed as a closed-form formula (a piecewise ramp-then-constant speed profile, integrated to get distance) instead of a per-frame physics step, so the server never needs to run a game loop — it only recomputes on changes.
- Only one WebSocket connection can hold the **director** role at a time. If the director disconnects, the bobble keeps doing whatever it was doing, and the seat is free to reclaim.
- The other connection is a **viewer**: read-only, gets the live state and renders the same motion locally using the same shared `computeAt` formula, so all screens track closely without the server streaming a position every frame.
- State changes (color, shape, size, speed, range, play/pause, reset) are broadcast to everyone instantly over WebSocket.
- 