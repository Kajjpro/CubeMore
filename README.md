# CubeMore

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
  - **server** on port **3001**: Node.js + Express + Socket.IO. It runs all the rooms in memory.
    `tsx watch` restarts it automatically whenever you save a server file.
    Restarting clears all rooms, unless `DATABASE_URL` is set (see below).
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
- **Event pages**: `/race/3x3`, `/race/pyraminx`, `/race/skewb`... one page per WCA event with
  its open rooms and a Create button, made to be found by searches like "pyraminx race online".
- **Creating a room**: a private setup first (event, format, Best of, public or private, name):
  nobody can see or join it yet. **Open room**, then wait on the timer with warm-up solves (they
  don't count). People join; nothing starts by itself: the host presses Start when everyone
  is there. (Only the weekly race starts on its own, at its time.)
- **Mixed rooms**: someone who joins picks their event first ("Ready with Pyra").
- **Under the timer**: `Timer | Type in` and `Watch`, always in sight (also in the Menu).
- **Step away**: Menu → "Step away, just watch" (or "Just watch" on your card in the lobby). You stay in
  the room and the chat, but nobody waits for you; mid-set, the rest of your set counts as DNF and your
  points stay. "Race again" puts you back in from the next set. If everyone steps away, the match
  waits at the set result until someone is back.
- Every room has a **chat**. The server also posts short notices there ("Anu joined the room",
  "Nomin submitted 9.12", "Nomin wins set 1"). The last 100 lines are kept for people who join later.

## What makes it different

- **Solve analyzer** (`/analyze`): solve with a smart cube (single or ao5) and see every
  stage: cross, the four F2L pairs, OLL and PLL, with time spent looking and turning, the
  shortest cross for the scramble, the shortest way for each pair, the OLL/PLL case and its
  algorithm, a real-speed replay, and the suggestions that would save the most time. Signed-in
  players keep their sessions; an optional AI coach writes a short summary. See "The solve
  analyzer" in DEPLOY.md.

- **Race now**: one tap puts you in an open public room for your event (or opens one for
  the next racer). The room's host starts the race when people have joined.
- **Live clocks**: while others solve, their running time ticks in the standings, so you
  know whether you're ahead before anyone stops.
- **Finish line**: after each solve, a short replay: every bar runs at its player's speed
  and stops when the fastest crosses the line; then the gaps ("+0.42").
- **Reactions**: 🔥 👏 😮 😂 on someone's time (on the finish line, or tap their row). They
  float up from their row and show in the chat.
- **Accounts** (optional): sign in with Google, or email and password (Clerk). Right after
  signing up you choose a unique username; it's your name everywhere, and your seat, daily attempt and history follow you
  across devices. Guests can still race with just a nickname. Setup: "Accounts" in DEPLOY.md.
- **Mixed events** (room setting): everyone picks their own event from 2x2, Pyraminx, Skewb
  and Clock (short events, so the times are close) and races on time, with the fastest
  average winning, e.g. a Pyra main against a 2x2 main. Each event gets its own scrambles.
  You pick in the lobby (your last pick is remembered); during a match your event is fixed,
  and you can switch for the next one. Works in public and private rooms, and "Race now" for
  one of these events finds mixed rooms too.
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
- **Database (optional)**: with `DATABASE_URL` (e.g. a free Neon database), rooms survive
  restarts and deploys (browsers rejoin the same match by themselves), and every match is
  kept: each solve with its scramble, each set, the winners.
- **Smart cubes (beta)**: Menu → "GAN cube" (GAN 356 i3, i Carry 2, 12 ui, 14 ui… through
  gan-web-bluetooth) or "Other smart cube" (GoCube, Giiker, QiYi… through cubing.js). Chrome / Edge.
  - **Guided scramble**: the scramble follows your cube. Done moves turn green; a wrong turn
    shows its undo in red ("L'") right where it happened.
  - **Inspection**: the moment the cube matches the scramble, 15 s of inspection start. Your
    first turn starts the timer; if the 15 s run out, it starts by itself. Solving stops it.
  - **Exact times**: GAN cubes stamp each move with their own clock, so Bluetooth delays don't
    change the time; the cube's clock drift is corrected over the session, and moves Bluetooth
    lost are recovered. When the cube stops without being solved, the app asks it for its full
    state, so a lost move never leaves the timer running (no extra U U').
  - **Verified**: every move is sent with the time; the server replays it on the scramble
    (solved at the last move, humanly possible, not the scramble undone). Verified times get a
    ✓ with their moves and TPS.
  - **Smart-cube rooms** (lobby → Timing → "Smart cubes only"): only verified solves count.
  - **Weekly race**: every Saturday 12:00 UTC (`WEEKLY_RACE_DAY`, `WEEKLY_RACE_HOUR_UTC`), a
    smart-cube 3x3 ao5 for everyone. The room opens 30 minutes before and starts on the minute.
  - **Verified leaderboard** on the home page (this week / all time), with a replay of each
    solve. Needs `DATABASE_URL`.
  - Without a cube: add `?simcube=1` to the address, and the Menu offers a keyboard cube
    (i/k = R/R', j/f = U/U', h/g = F/F', d/e = L/L', s/l = D/D', w/o = B/B').
- **Bluetooth timer (beta)**: Menu → "Connect timer" (GAN Smart Timer, GAN Halo). Hands on,
  lift to start, stop like at a competition; the time is the timer's own.

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
  cube3.ts         a 3x3 model in GAN's facelets format (smart cube guide + verification)
  smartSolve.ts    verifying a smart cube solve (shared, so both sides use the same rules)
  practice.ts      the analyzer's sessions and solves (types)
  analysis/        THE SOLVE ANALYZER (pure; the browser runs it, the server checks it)
    analyze.ts       a solve -> CFOP stages for any cross colour, cases, shortest cross/pairs
    state.ts         reading a state the CFOP way (cross, slots, oriented) for each face
    algs.ts          the 57 OLL and 21 PLL cases with their algorithms (SpeedSolving wiki)
    cases.ts         recognising a case by trying the algorithms
    search.ts        shortest cross (exact table) and F2L pair (IDA*) searches
    notation.ts      full notation (wide, slices, rotations) on the facelet model
    frame.ts         holding the cube: cross on the bottom, converting move names
    benchmarks.ts    typical numbers for each level (approximate)
    advice.ts        ranked suggestions; session.ts: the ao5 summary

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
  persistence/store.ts        Postgres tables: saved rooms + match history
  persistence/persistence.ts  keeps them up to date in the background (never blocks racing)
  persistence/history.ts      what's worth keeping when a room changes (set finished...)
  persistence/restore.ts      reopening a saved room after a restart
  weekly/                     the weekly smart-cube race: schedule, results
  practice/                   the analyzer: kept sessions (memory/Postgres), the AI coach, top solves
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
  smartCube.ts          the smart cube connection (gan-web-bluetooth, cubing.js)
  smart/                the scramble guide, the solve flow (inspection...), exact timing
  analyzer/             the analyzer in a web worker, and one practice session's flow
  btTimer.ts            the Bluetooth timer connection (GAN)
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
