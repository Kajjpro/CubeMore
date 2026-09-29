# Deploying

Ways to put Cube Racing online:

- **Free: everything on Render** (no credit card): follow "Deploying to Render (free)" right below.
- **Paid: everything on Fly.io** (never sleeps): follow "Deploying to Fly.io" further down.
- **Website on Vercel + game server elsewhere**: follow "Website on Vercel" at the end.

# Deploying to Render (free)

The server runs on Render's free plan and also serves the website, so there is one
address, e.g. `https://cubits.onrender.com`. Render builds it from the `Dockerfile`,
with the settings in `render.yaml` (free plan, Singapore, health check `/health`).

**Good to know about the free plan**

- It **sleeps after about 15 minutes with no visitors**. The next visit waits roughly
  a minute while it wakes up. While people are connected, it should stay awake.
- Rooms live in memory, so they are **gone after it sleeps, restarts or redeploys**.
- The CPU is small: scrambles for big puzzles (4x4 and up) can take a few seconds, but
  the next ones are made in the background during a set.
- Check Render's pricing page for the current free-plan limits.

### 1. Put the latest code on GitHub

Render deploys whatever is on the `main` branch of your GitHub repository:

```bash
git add -A
git commit -m "Latest version"
git push
```

### 2. Create the service on Render

1. Go to https://render.com and **sign up with GitHub** (free, no card).
2. Click **New → Blueprint**, choose your repository (e.g. `Kajjpro/Cubits`) and click **Connect**.
   Render reads `render.yaml` and shows one web service, `cubits`, on the **Free** plan.
3. Click **Apply** (or **Deploy Blueprint**). The first build takes about 5-10 minutes.

(Without the Blueprint: **New → Web Service** → your repository → Language **Docker**,
Region **Singapore**, Instance type **Free**, Health Check Path `/health`,
Environment variable `NODE_ENV` = `production`.)

### 3. Open it

When the log says `Server running on http://localhost:10000 (production)` and the service
is **Live**, open the address shown at the top of the service page, e.g.
`https://cubits.onrender.com` (Render adds a few letters if the name is taken).
`https://<address>/health` answers `{"ok":true,...}`.

### Updating

Every `git push` to `main` deploys again automatically (and clears the rooms, so push
when nobody is racing). The **Logs** tab shows the room logs.

### Using Vercel for the website at the same time (optional)

Not needed, since Render already serves the website. If you want it anyway: set
`VITE_SERVER_URL` on Vercel to your Render address, and add an environment variable
`CLIENT_ORIGINS` = your Vercel address on Render (**Environment** tab), then redeploy both.

**Why the server can't run on Vercel.** Vercel runs code as short functions that start
and stop for each request and can't keep WebSocket connections open. The game server
must run all the time, keep every room in memory, and hold a live connection to every
player during a race. So on Vercel only the website can live; the server needs a host
that runs one program continuously (Fly.io, Render, Railway...).

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

# Website on Vercel (with the server on Fly.io)

The website (React) is served by Vercel; it connects to the game server on Fly.io.
Two settings connect them:

| Setting | Where | Value | Why |
| --- | --- | --- | --- |
| `VITE_SERVER_URL` | Vercel | `https://<your-fly-app>.fly.dev` | tells the website where the server is |
| `CLIENT_ORIGINS` | Fly.io | `https://<your-vercel-site>.vercel.app` | lets browsers on the Vercel site connect to the server |

### 1. Deploy the server on Fly.io first

Do steps 1-6 of "Deploying to Fly.io" above. Note the address, e.g. `https://cube-racing-khaliun.fly.dev`,
and check `https://cube-racing-khaliun.fly.dev/health` answers.

### 2. Put the website on Vercel

Run these in the project's root folder (the one with `vercel.json`, not `client/`):

```bash
npx vercel login                                  # opens the browser; log in to your Vercel account
npx vercel                                        # creates the project (answers below)
```

Answers to its questions: set up and deploy: **yes**; which scope: your account; link to an
existing project: **no**; project name: e.g. `cube-racing`; code directory: **`./`**; modify
settings: **no** (`vercel.json` already says how to build: `npm run build`, output `client/dist`).

### 3. Tell the website where the server is

```bash
npx vercel env add VITE_SERVER_URL production     # paste: https://cube-racing-khaliun.fly.dev
npx vercel --prod                                 # build and publish with that setting
```

`VITE_SERVER_URL` is baked into the website when it's built, so after changing it, run
`npx vercel --prod` again. Vercel prints your site's address, e.g. `https://cube-racing.vercel.app`.

### 4. Allow that website on the server

```bash
fly secrets set CLIENT_ORIGINS=https://cube-racing.vercel.app
```

Exactly the address Vercel printed: `https://`, no slash at the end. Several addresses
(e.g. your own domain too) are separated by commas. Setting a secret restarts the server.

### 5. Try it

Open the Vercel address, add `?debug=1`, create a room: the debug panel should say
`connection: connected`. Send the room link to a friend.

### Using GitHub instead of the command line

Push the project to GitHub, then in Vercel: **Add New → Project → import the repository**.
Keep the Root Directory as the repository root, and add `VITE_SERVER_URL` under
**Settings → Environment Variables** (then redeploy). Every push to `main` deploys the website.

### If it stays on "Connecting…"

- Open the browser console (F12). A **CORS** error means `CLIENT_ORIGINS` on Fly doesn't match
  the address in the address bar exactly. Fix it with `fly secrets set ...`.
- `VITE_SERVER_URL` missing or wrong: check it with `npx vercel env ls`, fix it, `npx vercel --prod`.
- Vercel **preview** deployments have other addresses (`...-git-branch-...vercel.app`). They can
  only connect if you add their address to `CLIENT_ORIGINS` too; the production address is enough
  for playing.
- Deploying the server (Fly) still clears all rooms; deploying the website (Vercel) doesn't.
