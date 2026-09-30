import { existsSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import { ServerEvents } from "@cube-racing/shared";
import { DailyService } from "./daily/daily";
import { MemoryDailyStore, type DailyStore } from "./daily/store";
import type { MatchTiming } from "./match/types";
import { generateScramble } from "./scrambles";
import { registerSocketHandlers, type IoServer, type SocketOptions } from "./socketHandlers";

export interface StartOptions {
  /** 0 = pick any free port (used by tests). */
  port: number;
  timing: MatchTiming;
  /** Default 50 ms. */
  broadcastIntervalMs?: number;
  /** false = don't print room logs (tests). */
  logs?: boolean;
  makeScrambles?: SocketOptions["makeScrambles"];
  /**
   * In production: the folder with the built website (client/dist). The server
   * then serves the website AND Socket.IO from the same address, so there's
   * one service to deploy and no cross-origin (CORS) problems.
   */
  clientDist?: string | null;
  /** Websites on other addresses allowed to connect (e.g. the Vercel site). */
  clientOrigins?: string[];
  /** Where daily scramble results are kept. Default: in memory (gone after a restart). */
  dailyStore?: DailyStore;
}

export interface RunningServer {
  port: number;
  io: IoServer;
  rooms: ReturnType<typeof registerSocketHandlers>["rooms"];
  /** Tells every player "the server is restarting", then closes everything. */
  shutdown: (message: string) => Promise<void>;
  close: () => Promise<void>;
}

/** Starts Express + Socket.IO. Used by index.ts, and by the chaos test. */
export async function startServer(options: StartOptions): Promise<RunningServer> {
  const log = (code: string, message: string) => {
    if (options.logs !== false) console.log(`${new Date().toISOString()} [room ${code}] ${message}`);
  };

  // Express handles normal HTTP requests.
  const app = express();
  const httpServer = createServer(app);

  // Socket.IO shares the same HTTP server and handles the live connections.
  const io: IoServer = new Server(httpServer, {
    // Messages bigger than 10 KB are rejected. Our messages are tiny.
    maxHttpBufferSize: 10_000,
    // Check every 5 seconds that each client is still there. If a phone loses
    // signal, we notice within about 10 seconds (the defaults take ~45 seconds).
    pingInterval: 5_000,
    pingTimeout: 5_000,
    // Browsers only let a website on another address connect if the server
    // says that address is allowed (CORS). Used when the website is on Vercel.
    ...(options.clientOrigins?.length ? { cors: { origin: options.clientOrigins } } : {}),
  });

  const sockets = registerSocketHandlers(io, {
    timing: options.timing,
    broadcastIntervalMs: options.broadcastIntervalMs ?? 50,
    log,
    makeScrambles: options.makeScrambles,
    daily: new DailyService(options.dailyStore ?? new MemoryDailyStore(), () => generateScramble("333")),
  });

  // For uptime checks (Fly.io calls this to know the server is alive).
  app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: sockets.rooms.all().length, uptimeSeconds: Math.round(process.uptime()) });
  });

  if (options.clientDist) {
    if (!existsSync(path.join(options.clientDist, "index.html"))) {
      throw new Error(`No built website in ${options.clientDist}. Run "npm run build" first.`);
    }
    // The built files (JS, CSS...). Their names contain a hash, so browsers may cache them for long.
    app.use(express.static(options.clientDist, { index: false, maxAge: "1y", immutable: true }));
    // Every other page (/, /room/ABC234...) is the single-page app; React shows the right screen.
    app.get(/.*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(options.clientDist!, "index.html"));
    });
  }

  await new Promise<void>((resolve) => httpServer.listen(options.port, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  async function close(): Promise<void> {
    sockets.stop();
    const closed = new Promise<void>((resolve) => io.close(() => resolve()));
    // Don't wait for half-open or idle connections to time out: close them now.
    httpServer.closeAllConnections();
    await closed;
  }

  return {
    port,
    io,
    rooms: sockets.rooms,
    shutdown: async (message) => {
      io.emit(ServerEvents.NOTICE, { message });
      await new Promise((resolve) => setTimeout(resolve, 500)); // give the message time to arrive
      await close();
    },
    close,
  };
}
