# Deploying to Fly.io (Tokyo)

This puts the app on the internet at `https://<your-app-name>.fly.dev`, so friends
anywhere can race. You run these steps yourself; nothing here has been deployed yet.

## What gets deployed

**One** service: the Node server, which also serves the website. That's why there is no
separate "frontend" to deploy and no CORS setup: the website and the live connection
come from the same address.

## Why EXACTLY one machine

Rooms live in the server's **memory** (there's no database yet). If two machines ran:

- a room created on machine A wouldn't exist on machine B,
- two friends opening the same room link could land on different machines and never see each other.

So `fly.toml` is set up for one machine that is never stopped automatically, and the steps
below use `--ha=false` (Fly otherwise creates 2 machines for "high availability").

Two side effects of keeping rooms in memory:

- **A deploy or restart clears all rooms.** Players see "The server is restarting…" and then
  create a new room. Deploy when nobody is racing.
- **The machine is always on**, so it's billed all the time (it can't sleep, or rooms would
  vanish). Check Fly's current pricing page for the cost of a `shared-cpu-1x` machine with 512 MB.

To run several machines later, rooms would first have to move to shared storage
(for example Redis) and sockets would need the Socket.IO Redis adapter.

## Steps

### 1. Install the Fly command-line tool and log in

```bash
brew install flyctl          # on a Mac (other systems: https://fly.io/docs/flyctl/install/)
fly auth login               # opens the browser; create an account if you don't have one
```

Fly asks for a payment card before you can create apps.

### 2. Pick a name

Open `fly.toml` and change the first setting to a name nobody else has taken, e.g.:

```toml
app = "cube-racing-khaliun"
```

This becomes `https://cube-racing-khaliun.fly.dev`.

### 3. Create the app (once)

```bash
fly apps create cube-racing-khaliun
```

(Use `fly apps create` instead of `fly launch`: `fly launch` would rewrite `fly.toml`.)

### 4. Deploy

Run this in the project's root folder:

```bash
fly deploy --ha=false
```

Fly builds the `Dockerfile` on its own computers (you don't need Docker installed), then
starts one machine in Tokyo (`nrt`). The first build takes a few minutes.

### 5. Make sure there's exactly one machine

```bash
fly scale count 1
fly machine list             # should show ONE machine, state "started"
```

### 6. Open it

```bash
fly open                     # opens https://<your-app-name>.fly.dev
curl https://<your-app-name>.fly.dev/health
```

`/health` answers something like `{"ok":true,"rooms":0,"uptimeSeconds":42}`.

## Everyday commands

```bash
fly deploy --ha=false        # deploy a new version (clears all rooms!)
fly logs                     # live logs: room created, set started, solve submitted, player removed...
fly status                   # is it running?
fly machine list             # how many machines (must be 1)
```

## If something goes wrong

- **The site doesn't load**: `fly logs` shows the error. `fly status` shows whether the machine runs.
- **Two machines appear in `fly machine list`**: run `fly scale count 1`.
- **"Room not found" after a deploy**: expected, rooms are cleared on every restart.
- **Want another region?** Change `primary_region` in `fly.toml` (e.g. `sin` Singapore, `fra`
  Frankfurt), then deploy again. Pick the one closest to most of your players.

## What's in the files

- `Dockerfile`: builds the website, then makes a small image that runs
  `node --import tsx src/index.ts` in `server/`, listening on port 8080.
- `fly.toml`: app name, Tokyo region, one always-on machine, `/health` check,
  and `SIGTERM` + 10 s to shut down gracefully (players get the "restarting" message).
- `.env.example`: the settings you can change (on Fly, put them under `[env]` in `fly.toml`).
