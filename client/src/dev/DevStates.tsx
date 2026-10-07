/*
 * /dev/states (development only): every screen and state, rendered with mock data.
 *   /dev/states                      list of states
 *   /dev/states?state=solving        one state, full page
 *   /dev/states?state=solving&theme=dark
 * The screenshot script (client/scripts/screenshots.mjs) visits each of these.
 */

import { useEffect, useState, type ReactNode } from "react";
import type { PublicRoomInfo, RoomSnapshot } from "@cube-racing/shared";
import { RoomView, type RoomActions, type RoomDemo } from "../components/RoomView";
import { HomePage } from "../pages/HomePage";
import { JoinError, PinForm } from "../pages/RoomPage";
import { OverlayView } from "../pages/OverlayPage";
import { UsernameForm } from "../components/Account";
import { ContactPage } from "../pages/ContactPage";
import { DailyView } from "../pages/DailyPage";
import { drawResultCard } from "../shareCard";
import { applyTheme, type ThemePref } from "../prefs";
import { AO5_FULL, AO5_TIMES, LONG_NAMES, NAMES, SCRAMBLES, ao12Times, mockChat, mockDaily, mockRoom, type MockRoomOptions } from "./mocks";

const noop = () => {};

const MIXED = { name: "Pyra vs 2x2 vs Skewb", cubeEvent: "222", mixedEvents: true } as const;

const ROOMS: PublicRoomInfo[] = [
  { code: "PHZ3DJ", name: "Sunday practice", cubeEvent: "333", format: "ao5", winCondition: "bo3", players: 6, maxPlayers: 50, racing: true, hostName: "Nomin", visibility: "public", smartOnly: false, mixedEvents: false },
  { code: "K7M2QX", name: "OH only, all levels welcome", cubeEvent: "333oh", format: "ao12", winCondition: "unlimited", players: 3, maxPlayers: 20, racing: false, hostName: "Bat", visibility: "private", smartOnly: false, mixedEvents: false },
  { code: "W4ZT9P", name: "Pyra sub-5 club", cubeEvent: "pyram", format: "ao5", winCondition: "bo5", players: 12, maxPlayers: 12, racing: true, hostName: "Saraa", visibility: "public", smartOnly: false, mixedEvents: false },
  { code: "R8NDE3", name: "Megaminx", cubeEvent: "minx", format: "single", winCondition: "bo1", players: 2, maxPlayers: 50, racing: false, hostName: "Anu", visibility: "public", smartOnly: false, mixedEvents: false },
  { code: "M1XD42", name: "Pyra vs 2x2 vs Skewb", cubeEvent: "222", mixedEvents: true, format: "ao5", winCondition: "bo3", players: 3, maxPlayers: 10, racing: false, hostName: "Bilguun", visibility: "public", smartOnly: false },
  { code: "T2CKW7", name: "Verified 3x3", cubeEvent: "333", format: "ao5", winCondition: "bo3", players: 4, maxPlayers: 8, racing: false, hostName: "Khulan", visibility: "public", smartOnly: true, mixedEvents: false },
];
const actions: RoomActions = {
  leave: noop,
  start: noop,
  updateSettings: noop,
  chooseEvent: noop,
  setWatching: noop,
  openRoom: noop,
  kick: noop,
  skip: noop,
  endMatch: noop,
  rematch: noop,
  backToLobby: noop,
  changePenalty: noop,
  dismissError: noop,
  sendChat: async () => null,
  react: noop,
};

interface RoomState {
  mock: MockRoomOptions;
  demo?: RoomDemo;
  connected?: boolean;
  notice?: string;
  error?: string;
  /** No chat messages yet. */
  emptyChat?: boolean;
}

const SOLVING: MockRoomOptions = { phase: "solving", times: AO5_TIMES, points: [0, 1, 0, 0, 1, 0], solving: [2, 4], hostIndex: 1 };

const ROOM_STATES: Record<string, RoomState> = {
  "lobby-alone": { mock: { names: ["Temuulen"], phase: "lobby" } },
  "lobby-private-alone": { mock: { names: ["Temuulen"], phase: "lobby", pin: "4821" } },
  "lobby-private-players": { mock: { phase: "lobby", pin: "4821" } },
  "lobby-players": { mock: { phase: "lobby", reconnecting: [4] } },
  "lobby-guest": { mock: { phase: "lobby", meIndex: 2, hostIndex: 0 } },
  "lobby-countdown": { mock: { phase: "lobby", names: NAMES.slice(0, 2), autoStartIn: 2_400 } },
  "lobby-countdown-guest": { mock: { phase: "lobby", names: NAMES.slice(0, 2), meIndex: 1, autoStartIn: 2_400 } },
  "lobby-after-race": { mock: { phase: "lobby", bestOfLocked: true } },
  "lobby-handicap": { mock: { phase: "lobby", settings: { scoring: "handicap" } } },
  "set-result-pace-set": {
    mock: { ...SOLVING, phase: "set_result", times: AO5_FULL, solveIndex: 4, setIndex: 0, settings: { scoring: "handicap" }, paces: [] },
  },
  "set-result-handicap": {
    mock: {
      ...SOLVING,
      phase: "set_result",
      times: AO5_FULL,
      solveIndex: 4,
      points: [0, 1, 0, 0, 1, 0],
      settings: { scoring: "handicap" },
      paces: [11_900, 9_400, 13_800, 12_900, 10_600, null],
    },
  },
  "standings-handicap": {
    mock: { ...SOLVING, settings: { scoring: "handicap" }, paces: [11_900, 9_400, 13_800, 12_900, 10_600, null] },
    demo: { sheetOpen: true },
  },
  solving: { mock: { ...SOLVING, solveDeadlineIn: 90_000, settings: { solveTimeLimit: 2 } } },
  "timer-holding": { mock: SOLVING, demo: { timer: { phase: "holding" } } },
  "timer-ready": { mock: SOLVING, demo: { timer: { phase: "ready" } } },
  "timer-running": { mock: SOLVING, demo: { timer: { phase: "running", elapsedMs: 9870 } } },
  "timer-running-long": { mock: SOLVING, demo: { timer: { phase: "running", elapsedMs: 599_990 } } },
  "timer-running-hidden": { mock: SOLVING, demo: { timer: { phase: "running", elapsedMs: 9870 }, runningDisplay: "hidden" } },
  penalty: {
    mock: SOLVING,
    demo: { timer: { phase: "stopped", pending: { timeMs: 11_870, penalty: "OK", confirmed: false } } },
  },
  waiting: {
    mock: { ...SOLVING, times: AO5_TIMES.map((row, i) => (i === 0 ? [row[0], row[1], 10_870] : row)) },
  },
  "type-in": { mock: SOLVING, demo: { inputMode: "typing" } },
  "solve-review": {
    mock: { ...SOLVING, phase: "solve_review", times: AO5_TIMES.map((row) => [row[0], row[1], row[2] ?? 11_450]) },
  },
  "set-result": { mock: { ...SOLVING, phase: "set_result", times: AO5_FULL, solveIndex: 4, points: [0, 2, 0, 0, 1, 0] } },
  "match-over-host": {
    mock: { ...SOLVING, phase: "match_over", times: AO5_FULL, solveIndex: 4, points: [0, 2, 0, 0, 1, 0], meIndex: 1 },
  },
  "match-over-guest": { mock: { ...SOLVING, phase: "match_over", times: AO5_FULL, solveIndex: 4, points: [0, 2, 0, 0, 1, 0] } },
  spectator: { mock: { ...SOLVING, names: [...NAMES.slice(0, 6), "Late Joiner"], meIndex: 6, spectators: [6] } },
  reconnecting: { mock: { ...SOLVING, reconnecting: [3] }, connected: false },
  "server-notice": { mock: SOLVING, connected: false, notice: "The server is restarting. Rooms will be reset; please create a new room in a moment." },
  "error-banner": { mock: { phase: "lobby" }, error: "Only the host can start the match." },
  "host-panel": { mock: { ...SOLVING, hostIndex: 0 }, demo: { sheetOpen: true } },
  "sheet-open": { mock: SOLVING, demo: { sheetOpen: true } },
  "menu-open": { mock: SOLVING, demo: { menuOpen: true } },
  "chat-open": { mock: SOLVING, demo: { sheetOpen: true, tab: "chat" } },
  "chat-unread": { mock: SOLVING, demo: { unread: 3 } },
  "lobby-empty-chat": { mock: { phase: "lobby" }, emptyChat: true },
  "ao12-12-players": {
    mock: { names: NAMES, phase: "solving", settings: { format: "ao12" }, solveIndex: 11, times: ao12Times(12), solving: [3], points: [1, 0, 2, 0, 1, 0, 0, 1, 0, 0, 0, 0] },
    demo: { sheetOpen: true },
  },
  "long-names-lobby": { mock: { names: LONG_NAMES, phase: "lobby", hostIndex: 1 } },
  "long-names-match": { mock: { ...SOLVING, names: LONG_NAMES }, demo: { sheetOpen: true } },
  "room-setup": { mock: { phase: "lobby", names: ["Temuulen"], setup: true } },
  "warmup-alone": { mock: { phase: "lobby", names: ["Temuulen"], bestOfLocked: false } },
  "warmup-private": { mock: { phase: "lobby", names: ["Temuulen"], bestOfLocked: false, pin: "4821" } },
  "watching-match": { mock: { ...SOLVING, watching: [0] } },
  "watching-lobby": { mock: { phase: "lobby", names: NAMES.slice(0, 4), watching: [0, 2] } },
  "mixed-join-picking": {
    mock: { names: ["Anar", "Bilguun"], phase: "lobby", settings: MIXED, events: ["pyram", "222"], picking: [1], meIndex: 1, autoStartIn: 2_000 },
  },
  "mixed-waiting-for-pick": {
    mock: { names: ["Anar", "Bilguun"], phase: "lobby", settings: MIXED, events: ["pyram", "222"], picking: [1], autoStartIn: 2_000 },
  },
  "mixed-lobby": {
    mock: { names: ["Anar", "Bilguun", "Tuya"], phase: "lobby", settings: MIXED, events: ["pyram", "222", "skewb"] },
  },
  "mixed-solving": {
    mock: {
      names: ["Anar", "Bilguun", "Tuya"],
      phase: "solving",
      settings: MIXED,
      events: ["pyram", "222", "skewb"],
      solveIndex: 3,
      times: [
        [2310, 1840, 2500, null],
        [2640, 2480, 2100, 2710],
        [2900, 2550, 3010, null],
      ],
      solving: [2],
      points: [1, 0, 0],
    },
  },
  "mixed-set-result": {
    mock: {
      names: ["Anar", "Bilguun", "Tuya"],
      phase: "set_result",
      settings: MIXED,
      events: ["pyram", "222", "skewb"],
      solveIndex: 4,
      times: [
        [2310, 1840, 2500, 3120, 2200],
        [2640, 2480, 2100, 2710, 3050],
        [2900, 2550, 3010, 2770, "DNF:0"],
      ],
      points: [2, 0, 0],
    },
  },
  "mixed-match-over": {
    mock: {
      names: ["Anar", "Bilguun", "Tuya"],
      phase: "match_over",
      settings: MIXED,
      events: ["pyram", "222", "skewb"],
      solveIndex: 4,
      times: [
        [2310, 1840, 2500, 3120, 2200],
        [2640, 2480, 2100, 2710, 3050],
        [2900, 2550, 3010, 2770, "DNF:0"],
      ],
      points: [2, 1, 0],
    },
  },
  "scramble-4x4": { mock: { ...SOLVING, settings: { cubeEvent: "444" }, scramble: { cubeEvent: "444", text: SCRAMBLES["444"] } } },
  "scramble-7x7": { mock: { ...SOLVING, settings: { cubeEvent: "777" }, scramble: { cubeEvent: "777", text: SCRAMBLES["777"] } } },
  "scramble-megaminx": { mock: { ...SOLVING, settings: { cubeEvent: "minx" }, scramble: { cubeEvent: "minx", text: SCRAMBLES.minx } } },
  "scramble-sq1": { mock: { ...SOLVING, settings: { cubeEvent: "sq1" }, scramble: { cubeEvent: "sq1", text: SCRAMBLES.sq1 } } },
};

export const STATE_NAMES = [
  "home",
  "home-no-rooms",
  "home-daily-done",
  "daily-new",
  "daily-started",
  "daily-holding",
  "daily-done",
  "daily-done-outside-top",
  "overlay",
  "overlay-lobby",
  "share-card",
  "home-private-tab",
  "contact",
  "contact-sent",
  "choose-username",
  "choose-username-taken",
  "pin-prompt",
  "pin-wrong",
  "join-error",
  ...Object.keys(ROOM_STATES),
];

function renderState(name: string): ReactNode {
  if (name === "home") return <HomePage demo={{ nickname: "Temuulen", rooms: ROOMS, daily: mockDaily("new") }} />;
  if (name === "home-no-rooms") return <HomePage demo={{ nickname: "Temuulen", rooms: [], daily: mockDaily("new") }} />;
  if (name === "home-private-tab") return <HomePage demo={{ nickname: "Temuulen", rooms: ROOMS, daily: mockDaily("new"), tab: "private" }} />;
  if (name === "contact") return <ContactPage />;
  if (name === "contact-sent") return <ContactPage demoSent={{ name: "Anu", email: "anu@example.com" }} />;
  if (name === "choose-username") return <UsernameForm suggestion="anarb" onSave={async () => null} onSignOut={noop} />;
  if (name === "choose-username-taken") {
    return <UsernameForm suggestion="anar" onSave={async () => "That username is taken. Try another one."} onSignOut={noop} />;
  }
  if (name === "pin-prompt") return <PinForm code="K7M2QX" error={null} onSubmit={noop} />;
  if (name === "pin-wrong") return <PinForm code="K7M2QX" error="Wrong PIN. Try again." onSubmit={noop} />;
  if (name === "home-daily-done") return <HomePage demo={{ nickname: "Temuulen", rooms: ROOMS, daily: mockDaily("done") }} />;
  if (name.startsWith("daily-")) {
    const status = name === "daily-new" ? "new" : name.startsWith("daily-done") ? "done" : "started";
    const daily = mockDaily(status, { rank: name === "daily-done-outside-top" ? 57 : 4 });
    const phase = name === "daily-holding" ? "holding" : undefined;
    return <DailyView daily={daily} error={null} onStart={async () => true} onSubmit={async () => true} demoPhase={phase} />;
  }
  if (name === "overlay") return <OverlayView room={mockRoom({ ...SOLVING, points: [1, 2, 0, 0, 1, 0] }).room} />;
  if (name === "overlay-lobby") return <OverlayView room={mockRoom({ phase: "lobby" }).room} />;
  if (name === "share-card") return <CardPreview />;
  if (name === "join-error") return <JoinError code="ZZZZZZ" error="Room not found. Check the code, or the room may have closed." />;
  const state = ROOM_STATES[name];
  if (!state) return <p>Unknown state {name}</p>;
  const { room, youId }: { room: RoomSnapshot; youId: string } = mockRoom(state.mock);
  return (
    <RoomView
      room={room}
      youId={youId}
      connected={state.connected ?? true}
      notice={state.notice ?? null}
      error={state.error ?? null}
      starting={false}
      chat={state.emptyChat ? [] : mockChat(state.mock.names ?? NAMES)}
      actions={actions}
      demo={state.demo}
    />
  );
}

export function DevStates() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get("state");
  const theme = params.get("theme") as ThemePref | null;

  useEffect(() => {
    applyTheme(theme ?? "system");
  }, [theme]);

  if (!name) {
    return (
      <main className="page page-wide">
        <div className="page-head">
          <h1>UI states</h1>
        </div>
        <ul className="list">
          {STATE_NAMES.map((state) => (
            <li key={state}>
              <a className="name" href={`/dev/states?state=${state}`}>
                {state}
              </a>
              <a href={`/dev/states?state=${state}&theme=dark`}>dark</a>
            </li>
          ))}
        </ul>
      </main>
    );
  }
  return <>{renderState(name)}</>;
}

/** The share card as an image, so the screenshot script can check it. */
function CardPreview() {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const { room } = mockRoom({ ...SOLVING, phase: "match_over", times: AO5_FULL, solveIndex: 4, points: [0, 2, 0, 0, 1, 0], meIndex: 1 });
    const names = Object.fromEntries(room.players.map((p) => [p.id, p.nickname]));
    void drawResultCard({ match: room.match!, settings: room.settings, names }).then((blob) => setSrc(URL.createObjectURL(blob)));
  }, []);
  return <main>{src && <img src={src} alt="Result card" style={{ width: "100%", maxWidth: 1200, display: "block" }} />}</main>;
}
