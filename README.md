# Cube Racing

Real-time speedcubing races with friends: rooms, all 17 WCA events, shared random-state
scrambles with a picture, a stackmat-style timer (or type your times), OK / +2 / DNF,
ao5 / ao12 averages, sets, points and best-of-N matches.

Built so that a solve is **never lost or skipped** and every player always sees the same
state, even with 50 players, slow connections, refreshes and dropouts.

## Run it locally

You need **Node.js 22 or newer** (check with `node -v`).

```bash
# 1. Install everything (run once, in the project's root folder)
npm install

# 2. Start the server AND the website together
npm run dev
```

Then open **http://localhost:5173** in your browser.

### What those commands do

- `npm install` downloads the libraries for all three folders (`shared`, `server`, `client`).
  The root `package.json` lists them as **workspaces**, so a single install covers all of them.
- `npm run dev` starts two programs at the same time (using `concurrently`):
  - **server** on port **3001**: Node.js + Express + Socket.IO. It holds all the rooms in memory.
    `tsx watch` restarts it automatically whenever you save a server file.
    Restarting clears all rooms.
  - **client** on port **5173**: the Vite dev server for the React website. It reloads the page
    when you save a client file. It also **forwards** every `/socket.io` request to port 3001
    (see `client/vite.config.ts`), so the browser only needs one address.
- Press `Ctrl + C` in the terminal to stop both.

To run just one side, use `npm run dev -w server` or `npm run dev -w client`
(`-w` means "in this workspace").

### All commands

```bash
npm run dev         # develop: server + website with live reload
npm test            # unit tests (server: scoring, match engine, rooms, runtime; client: time parsing)
npm run chaos       # 20 bots x 20 runs of chaos (disconnects, refreshes, duplicates) - takes a few minutes
npm run typecheck   # checks the TypeScript types of the server and the client
npm run build       # builds the website into client/dist
npm start           # runs like production: ONE server on port 3001 that also serves client/dist
```

Settings come from environment variables; see [.env.example](.env.example).
To deploy on Fly.io, follow [DEPLOY.md](DEPLOY.md). To test with friends, use [TESTING.md](TESTING.md).

## Testing with several players on one computer

Every tab in the same browser shares `localStorage`, so every tab would count as the
**same** player. Give each tab its own **profile** by adding `?profile=<anything>` to the URL:

1. Tab 1: open `http://localhost:5173`, enter a nickname, and click **Create room**.
2. Tab 2: open `http://localhost:5173/?profile=2`, enter another nickname, and join with the code.
3. Tab 3: open `http://localhost:5173/?profile=3`, and so on.

Each tab remembers its profile, even when you move between pages or refresh.
Add `&debug=1` to see a debug panel (connection, latency, snapshot version, outbox size).

Tip: Chrome slows down timers in tabs you're not looking at, so put the tabs in
**separate windows side by side** when testing the timer.

### Testing on your phone

Your phone must be on the same Wi-Fi as your computer.

```bash
npm run dev -w server                 # terminal 1
npm run dev -w client -- --host       # terminal 2 (--host makes Vite reachable from other devices)
```

Vite prints a `Network:` address like `http://192.168.1.20:5173`. Open it on your phone.

## Rooms

- **Create room** is one tap: the room is made with the defaults (public, 3x3, ao5, Best of 3)
  and you're in. The host changes anything in the lobby: name, who can join, event, format,
  Best of, time limit, max players.
- **No Start button needed**: 3 seconds after a second player joins the lobby, the race starts
  for everyone. Alone, the host can "Practise alone"; back in the lobby after a match, the host
  presses Start.
- Every room has a **name** (default: "<host>'s room").
- The home page lists **every room**, public and private, with its code.
  - **Public**: anyone can join with one tap.
  - **Private** (a PIN tag in the list): joining needs the 4-digit PIN. The host's "Copy invite
    link" includes the PIN, so friends just tap the link. Someone coming back to their own seat
    (refresh, dropped connection) doesn't need the PIN again. After 10 wrong PINs a room only
    accepts one more try every 6 seconds, so nobody can try all 10,000.
- **Best of** can be changed until the first race starts; after that it's fixed. The host can
  pick another event for a rematch, or restart in the middle of a match with another event
  (points go back to 0).
- You can join a room whose match has already started: you watch that set and race from the next one.
- Every room has a **chat**. The server also posts short notices there ("Anu joined the room",
  "Nomin submitted 9.12", "Nomin wins set 1"). The last 100 lines are kept for people who join later.

## What makes it different

- **Race now**: one tap puts you in an open public room for your event (or opens one for
  the next racer). The race starts 3 seconds after someone joins.
- **Live clocks**: while others solve, their running time ticks in the standings, so you
  know whether you're ahead before anyone stops.
- **Finish line**: after each solve, a short replay: every bar runs at its player's speed
  and stops when the fastest crosses the line; then the gaps ("+0.42").
- **Reactions**: 🔥 👏 😮 😂 on someone's time (on the finish line, or tap their row). They
  float up from their row and show in the chat.
- **Handicap scoring** (room setting): everyone races their own pace (their average from
  earlier sets; set 1 sets it). Whoever beats their pace by the most wins the set, so
  a 25-second solver can beat a 9-second solver.
- **Streamer overlay**: Menu → "Copy overlay link" → add it in OBS as a Browser Source.
  A transparent panel with live standings and running clocks. It watches the room without
  taking a seat (private rooms: the link includes the PIN).
- **Share card**: after a match, "Share result card" makes a 1200×630 image (share sheet
  on phones, a download elsewhere).
- **Daily scramble** (`/daily`): the same 3x3 scramble for everyone each day (UTC), one
  attempt: the scramble shows when you start, then you have 10 minutes. A global
  leaderboard; your rank. Needs `DATABASE_URL` to survive restarts (see DEPLOY.md).
- **Smart cube (beta)**: Menu → "Connect smart cube" (Chrome / Edge with Bluetooth: GAN,
  GoCube, Giiker…). On 3x3: turn it to match the scramble; your first turn starts the
  timer and solving it stops it. Others can tap your row and watch your cube turn live.
  For testing without a cube, add `?simcube=1` to the address: the Menu then offers a
  keyboard cube (i/k = R/R', j/f = U/U', h/g = F/F', d/e = L/L', s/l = D/D', w/o = B/B').

## How a match works

- A **match** is a series of **sets**. A set has 1 solve (single), 5 (ao5) or 12 (ao12).
- Everyone in the room when a set starts is in that set's **roster**. People who join later
  watch (spectators) until the next set.
- For each solve: the scramble is shown, everyone solves, and once **everyone in the roster
  has a result** the times are shown for 3 seconds, then the next scramble comes.
  "Has a result" = submitted, OR the time limit ran out (DNF), OR the host skipped them (DNF),
  OR they left the room (DNF). So nobody can block the room.
- After the last solve of a set: averages, the set winner (+1 point) and points for 6 seconds.
- **Scoring** (WCA-style): times truncated to hundredths, +2 adds 2 s, ao5 drops best and worst,
  ao12 drops 1 best and 1 worst, 2+ DNFs = DNF average, averages rounded half up.
  Best result wins the set; tie -> better single; still tied -> all tied get a point.
- **Winning**: bo1 = 1 point, bo3 = 2, bo5 = 3. You need the target AND strictly more points
  than everyone else; tied players keep playing sets. Unlimited: the host ends the match.

## How the code is organised

```
shared/          Used by BOTH server and client
  events.ts        every event name, payload and response (the "contract")
  schemas.ts       zod schemas: the server checks every payload with these
  types.ts         RoomSnapshot, MatchSnapshot, SolveResult, settings...
  constants.ts     timings (30 s reconnect, 3 s review, 6 s set result...), limits
  cubeEvents.ts    the 17 WCA events

server/src/
  index.ts              starts the server; graceful shutdown
  server.ts             Express + Socket.IO (+ serves the website in production)
  config.ts             settings from environment variables
  socketHandlers.ts     events -> rate limit -> zod check -> room queue -> logic -> commit -> ack
  match/scoring.ts      averages, set winners, match winner (pure)
  match/matchLogic.ts   the match state machine (pure)
  rooms/roomLogic.ts    room rules + connects players to the match (pure)
  rooms/liveRoom.ts     one running room: action queue, timers, broadcasts, scrambles
  rooms/roomStore.ts    the in-memory list of rooms
  rooms/chatNotices.ts  the chat's system lines ("Anu joined the room"...)
  daily/daily.ts        the daily scramble: one attempt per player per day, ranks
  daily/store.ts        where daily results live: memory, or Postgres (DATABASE_URL)
  scrambles.ts          random-state WCA scrambles with cubing.js
  rateLimit.ts          token bucket per connection
  **/*.test.ts          unit tests
server/chaos/chaos.ts   the 20-bot chaos test

client/src/
  socket.ts             the one Socket.IO connection + request() helper
  useRoom.ts            keeps a room in sync (joins, reconnects, applies snapshots)
  outbox.ts             solves waiting to be acknowledged (survives refreshes)
  timer/useSpeedTimer.ts  the space bar / touch timer
  timer/useSmartSolve.ts  a solve timed by a smart cube
  smartCube.ts          the Bluetooth cube connection (cubing.js) + solve tracking
  shareCard.ts          draws the result card image
  time.ts               formatting and typing times
  clock.ts              the server's clock (for countdowns)
  pages/, components/   the screens
```

## How the sync works

1. **The server is the only source of truth.** Clients never change room state themselves.
   A button sends a *request*; the screen only changes when the server's new state arrives.
2. **Every request gets exactly one answer**: `{ ok: true }` or `{ ok: false, error, code? }`.
3. **Full snapshots with versions.** After any change the room's `version` goes up and the
   server sends the *whole* room to everyone (at most one snapshot per 50 ms per room, so 50
   players submitting at once don't flood anyone). Clients ignore older versions.
   Snapshots include the server's time, so countdowns are right even if a clock is wrong.
   Only the *current* scramble is ever sent; future ones stay on the server.
4. **One queue per room.** Every action for a room runs one after another, so two actions can
   never interleave (e.g. a submission while the next set's scrambles are being made).
5. **Deadlines live in the state, not in timers.** The room's single timer only means
   "check now"; it can only do what is due in the *current* state, so a leftover timer can
   never skip a solve.
6. **The outbox.** The moment your timer stops, the solve is saved in localStorage. It's sent
   when you confirm (or after 5 s) and retried until the server acknowledges it, also after a
   reconnect or a page refresh. Sending twice is harmless: the server ignores duplicates.
7. **Identity survives refreshes.** A random `playerId` in localStorage. Rejoining with it gives
   you back your seat (for 30 s after a disconnect). Others only see a public id made from it.

## UI development

The design is described in [DESIGN.md](DESIGN.md). While `npm run dev` is running:

- **http://localhost:5173/dev/states** lists every screen and state with mock data
  (development only; it isn't included in production builds).
- `node client/scripts/screenshots.mjs` screenshots every state at 7 screen sizes in light
  and dark mode, into `client/screenshots/`, and checks each one for horizontal scroll,
  clipped text, overlaps, small tap targets and content that doesn't fit.
# Cubits
