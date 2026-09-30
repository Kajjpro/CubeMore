import pg from "pg";
import { config } from "./config";
import { MemoryDailyStore, PostgresDailyStore, type DailyStore } from "./daily/store";
import { startServer } from "./server";

// The daily scramble's results: in Postgres if there is a database, else in memory.
let dailyStore: DailyStore;
if (config.databaseUrl) {
  dailyStore = await PostgresDailyStore.open(new pg.Pool({ connectionString: config.databaseUrl, max: 5 }));
  console.log("Daily scramble results are saved in Postgres");
} else {
  dailyStore = new MemoryDailyStore();
  console.log("Daily scramble results are kept in memory (set DATABASE_URL to keep them across restarts)");
}

const server = await startServer({
  dailyStore,
  port: config.port,
  timing: config.timing,
  // In production the server also serves the website (built into client/dist).
  clientDist: config.isProduction ? config.clientDist : null,
  // The website's address when it's hosted elsewhere (e.g. Vercel).
  clientOrigins: config.clientOrigins,
});
console.log(`Server running on http://localhost:${server.port}${config.isProduction ? " (production)" : ""}`);

// GRACEFUL SHUTDOWN: when the host stops the server (a new deploy, Ctrl+C...),
// tell every player first, so they see "restarting" instead of a silent freeze.
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received: telling players and shutting down`);
    await server.shutdown("The server is restarting. Rooms will be reset; please create a new room in a moment.");
    process.exit(0);
  });
}
