import pg from "pg";
import { clerkAccounts } from "./accounts";
import { MemoryContactStore, PostgresContactStore, type ContactStore } from "./contact";
import { config } from "./config";
import { MemoryDailyStore, PostgresDailyStore, type DailyStore } from "./daily/store";
import { PostgresStore } from "./persistence/store";
import { startServer } from "./server";

// With a database (DATABASE_URL, e.g. Neon): rooms survive restarts, every match
// is kept in the history, and the daily leaderboard is kept. Without: all in memory.
let dailyStore: DailyStore = new MemoryDailyStore();
let store: PostgresStore | null = null;
let contactStore: ContactStore = new MemoryContactStore();
if (config.databaseUrl) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  // Hosted databases close idle connections now and then. Without this
  // listener, that error would crash the server; the pool just reconnects.
  pool.on("error", (error) => console.error("Database connection error:", error.message));
  dailyStore = await PostgresDailyStore.open(pool);
  store = await PostgresStore.open(pool);
  contactStore = await PostgresContactStore.open(pool);
  console.log("Rooms, match history and daily results are saved in Postgres");
} else {
  console.log("Everything is kept in memory (set DATABASE_URL to keep rooms and history across restarts)");
}

const restoredRooms = store ? await store.loadRooms() : [];

// Accounts: sign in with Google, or email and password (Clerk). Guests can always play.
const accounts = config.clerkSecretKey ? clerkAccounts(config.clerkSecretKey, config.clerkAuthorizedParties) : null;
console.log(accounts ? "Accounts are on (Clerk)" : "Accounts are off (set CLERK_SECRET_KEY to let players sign in)");

const server = await startServer({
  dailyStore,
  store,
  reader: store,
  restoredRooms,
  accounts,
  contactStore,
  adminUserIds: config.adminUserIds,
  siteUrl: config.siteUrl,
  weeklySchedule: config.weeklySchedule,
  port: config.port,
  timing: config.timing,
  // In production the server also serves the website (built into client/dist).
  clientDist: config.isProduction ? config.clientDist : null,
  // The website's address when it's hosted elsewhere (e.g. Vercel).
  clientOrigins: config.clientOrigins,
});
console.log(`Server running on http://localhost:${server.port}${config.isProduction ? " (production)" : ""}`);
if (restoredRooms.length > 0) console.log(`Restored ${restoredRooms.length} room(s) from before the restart`);

// GRACEFUL SHUTDOWN: when the host stops the server (a new deploy, Ctrl+C...),
// tell every player first, so they see "restarting" instead of a silent freeze.
// With a database every room is saved first, and comes back after the restart.
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received: telling players and shutting down`);
    await server.shutdown(
      store
        ? "The server is restarting. You'll be back in your room in a moment."
        : "The server is restarting. Rooms will be reset; please create a new room in a moment.",
    );
    process.exit(0);
  });
}
