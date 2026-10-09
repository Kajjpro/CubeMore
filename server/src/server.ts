import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import compression from "compression";
import express from "express";
import { Server } from "socket.io";
import { getCubeEvent, ServerEvents } from "@cube-racing/shared";
import { DailyService } from "./daily/daily";
import { MemoryDailyStore, type DailyStore } from "./daily/store";
import type { MatchTiming } from "./match/types";
import { RoomPersistence } from "./persistence/persistence";
import type { HistoryReader, PersistenceStore, SavedRoom } from "./persistence/store";
import type { WeeklySchedule } from "./weekly/schedule";
import { generateScramble } from "./scrambles";
import type { AccountVerifier } from "./accounts";
import { MemoryContactStore, type ContactStore } from "./contact";
import { canonicalRedirect, isKnownPage, renderPage, sitemap } from "./seo";
import type { Coach } from "./practice/coach";
import { PracticeService } from "./practice/service";
import { MemoryPracticeStore, type PracticeStore } from "./practice/store";
import { SiteStatsService, type Activity } from "./stats/stats";
import { MemoryVisitStore, type VisitStore } from "./stats/visits";
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
  /** Where rooms and match history are kept. Default: nowhere (rooms are gone after a restart). */
  store?: PersistenceStore | null;
  /** Rooms saved before the last restart (from store.loadRooms()). */
  restoredRooms?: SavedRoom[];
  /** The history to read from (weekly results, leaderboard, replays). Default: none. */
  reader?: HistoryReader | null;
  /** When the weekly race is. Default: Saturday 12:00 UTC. */
  weeklySchedule?: WeeklySchedule;
  /** Checks sign-in tokens (Clerk). Default: none, everyone is a guest. */
  accounts?: AccountVerifier | null;
  /** Where contact form messages go. Default: in memory. */
  contactStore?: ContactStore;
  /** Clerk user ids allowed to read the contact messages. */
  adminUserIds?: string[];
  /** The site's public address ("https://cubemore.com") for search engines and link previews, or "". */
  siteUrl?: string;
  /** Where analyzer solves are kept. Default: in memory. */
  practiceStore?: PracticeStore;
  /** The AI coach for analyzer summaries, or none. */
  coach?: Coach | null;
  /** Where visits are counted. Default: in memory. */
  visitStore?: VisitStore;
  /** Races, solves and analyzer sessions from the database, for the stats. */
  activity?: () => Promise<Activity | null>;
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
  // Pages and files go out compressed (gzip): the website's main script is about
  // 570 KB, but 170 KB over the network, so the first visit loads much faster.
  app.use(compression());
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
    persistence: options.store ? new RoomPersistence(options.store, log) : null,
    restoredRooms: options.restoredRooms,
    reader: options.reader ?? null,
    weeklySchedule: options.weeklySchedule ?? { day: 6, hourUtc: 12 },
    accounts: options.accounts ?? null,
    contact: options.contactStore ?? new MemoryContactStore(),
    adminUserIds: options.adminUserIds ?? [],
    practice: new PracticeService(
      options.practiceStore ?? new MemoryPracticeStore(),
      options.reader ?? null,
      options.coach ?? null,
      Boolean(options.practiceStore && !(options.practiceStore instanceof MemoryPracticeStore)),
    ),
    stats: new SiteStatsService(options.visitStore ?? new MemoryVisitStore(), {
      kept: Boolean(options.visitStore && !(options.visitStore instanceof MemoryVisitStore)),
      accounts: options.accounts?.count ? () => options.accounts!.count!() : undefined,
      activity: options.activity,
    }),
  });

  /** A room's name and settings for its link preview ("Sunday practice: race on CubeMore"). Not while it's being set up. */
  const roomPreview = (pagePath: string): { name: string; summary: string } | null => {
    const code = pagePath.match(/^\/room\/([A-Za-z0-9]+)/)?.[1]?.toUpperCase();
    const room = code ? sockets.rooms.get(code)?.state : undefined;
    if (!room || room.setup) return null;
    const s = room.settings;
    const event = s.mixedEvents ? "Mixed events" : getCubeEvent(s.cubeEvent).name;
    const bestOf = s.winCondition === "unlimited" ? "unlimited sets" : `best of ${s.winCondition.slice(2)}`;
    return { name: s.name, summary: `${event}, ${s.format}, ${bestOf}` };
  };

  // For uptime checks (Fly.io calls this to know the server is alive).
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      rooms: sockets.rooms.all().length,
      database: Boolean(options.store),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  if (options.clientDist) {
    if (!existsSync(path.join(options.clientDist, "index.html"))) {
      throw new Error(`No built website in ${options.clientDist}. Run "npm run build" first.`);
    }
    // The built JS and CSS: their names contain a hash, so browsers may keep them for good.
    app.use("/assets", express.static(path.join(options.clientDist, "assets"), { maxAge: "1y", immutable: true }));
    const siteUrl = (options.siteUrl ?? "").trim().replace(/\/$/, "");
    // One address per page: other hosts, trailing slashes and capitals are sent to it (301).
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
      const target = canonicalRedirect(req.headers.host, req.path, query, siteUrl);
      if (target) return res.redirect(301, target);
      next();
    });
    // Every page search engines should know about (made here, so it always matches the pages).
    app.get("/sitemap.xml", (_req, res) => {
      if (!siteUrl) return void res.status(404).send("Set VITE_SITE_URL to get a sitemap.");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.type("application/xml").send(sitemap(siteUrl));
    });
    // Icons, the link-preview image, the manifest, robots.txt: same names after a
    // change, so browsers check again after an hour.
    app.use(express.static(options.clientDist, { index: false, maxAge: "1h" }));
    // Every other page (/, /race/pyraminx, /room/ABC234...) is the single-page app; React
    // shows the right screen. The HTML gets that page's title, description and preview tags.
    const indexHtml = readFileSync(path.join(options.clientDist, "index.html"), "utf8");
    app.get(/.*/, (req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      // Addresses that aren't pages answer 404 (the app still shows, with a "not found" page).
      res.status(isKnownPage(req.path) ? 200 : 404);
      res.type("html").send(renderPage(indexHtml, req.path, siteUrl, roomPreview(req.path)));
    });
  }

  await new Promise<void>((resolve) => httpServer.listen(options.port, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  async function close(): Promise<void> {
    const closed = new Promise<void>((resolve) => io.close(() => resolve()));
    // Don't wait for half-open or idle connections to time out: close them now.
    httpServer.closeAllConnections();
    await closed;
    // Nobody is connected any more: save every room as it is now, then stop them.
    await sockets.flush();
    sockets.stop();
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
