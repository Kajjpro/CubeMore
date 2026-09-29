import { config } from "./config";
import { startServer } from "./server";

const server = await startServer({
  port: config.port,
  timing: config.timing,
  // In production the server also serves the website (built into client/dist).
  clientDist: config.isProduction ? config.clientDist : null,
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
