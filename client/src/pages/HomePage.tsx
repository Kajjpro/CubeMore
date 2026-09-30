import { useEffect, useState, type FormEvent } from "react";
import {
  ClientEvents,
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  type CubeEventId,
  type DailyStatus,
  type PublicRoomInfo,
} from "@cube-racing/shared";
import { RoomList } from "../components/RoomList";
import { EventSelect } from "../components/SettingsForm";
import { EventIcon } from "../components/ui";
import { setPref, usePrefs, type ThemePref } from "../prefs";
import { navigate } from "../router";
import { request, socket } from "../socket";
import { loadIdentity, saveNickname } from "../storage";
import { formatResult } from "../time";

/** Only for /dev/states. */
export interface HomeDemo {
  nickname?: string;
  rooms?: PublicRoomInfo[];
  daily?: DailyStatus;
}

export function HomePage({ demo }: { demo?: HomeDemo }) {
  const [nickname, setNickname] = useState(() => demo?.nickname ?? loadIdentity().nickname);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"race" | "create" | null>(null);
  const { raceEvent } = usePrefs();

  // If you got here with the browser's Back button, you were still in a room.
  // Tell the server you left (it does nothing if you weren't in one).
  useEffect(() => {
    if (!demo && socket.connected) void request(ClientEvents.LEAVE_ROOM, {});
  }, [demo]);

  /** Checks the nickname, saves it, and returns it (or null if it's empty). */
  function checkNickname(): string | null {
    const name = nickname.trim();
    if (!name) {
      setError("Enter a nickname first.");
      return null;
    }
    setError(null);
    saveNickname(name);
    return name;
  }

  /**
   * One tap: the room is made with the defaults (public, 3x3, ao5, Best of 3)
   * and you're in. Everything can be changed in the room before the race.
   */
  async function create(settings: { cubeEvent?: CubeEventId; name?: string } = {}): Promise<void> {
    const name = checkNickname();
    if (!name) return;
    const response = await request(ClientEvents.CREATE_ROOM, { playerId: loadIdentity().playerId, nickname: name, settings });
    if (response.ok) navigate(`/room/${response.room.code}`);
    else setError(response.error);
  }

  /**
   * "Race now": joins an open public room for your event (one waiting in the
   * lobby first, so the race starts 3 s later), or opens a new one that the
   * next "Race now" player will find.
   */
  async function raceNow(): Promise<void> {
    if (!checkNickname() || busy) return;
    setBusy("race");
    const response = await request(ClientEvents.QUICK_RACE, { cubeEvent: raceEvent });
    if (response.ok && response.code) navigate(`/room/${response.code}`);
    else if (response.ok) await create({ cubeEvent: raceEvent, name: "Quick race" });
    else setError(response.error);
    setBusy(null);
  }

  async function createRoom(): Promise<void> {
    if (busy) return;
    setBusy("create");
    await create();
    setBusy(null);
  }

  function openRoom(roomCode: string): void {
    if (checkNickname()) navigate(`/room/${roomCode}`);
  }

  function join(event: FormEvent): void {
    event.preventDefault();
    if (!checkNickname()) return;
    const clean = code.trim().toUpperCase();
    if (clean.length !== ROOM_CODE_LENGTH) {
      setError(`Room codes have ${ROOM_CODE_LENGTH} characters.`);
      return;
    }
    // The room page does the joining (and shows errors like "room not found").
    navigate(`/room/${clean}`);
  }

  return (
    <div className="home">
      <header className="home-head">
        <EventIcon id="333" />
        <h1>Cube Racing</h1>
        <ThemeButton />
      </header>

      <main className="home-main">
        <div className="home-form">
          <p className="intro">Race the same scrambles with friends, live, with WCA-style averages.</p>

          {error && <p className="banner banner-error">{error}</p>}

          <label className="field">
            <span className="field-label">Nickname</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={NICKNAME_MAX_LENGTH}
              placeholder="Your name"
              autoComplete="nickname"
              autoFocus={!nickname}
            />
          </label>

          <div className="race-now">
            <EventSelect label="Race" value={raceEvent} onChange={(id) => setPref("raceEvent", id)} />
            <button type="button" className="primary" onClick={raceNow} disabled={busy !== null}>
              {busy === "race" ? "Finding a race…" : "Race now"}
            </button>
          </div>
          <p className="tiny muted race-now-hint">Joins an open room for this event, or opens one for the next racer.</p>

          <button type="button" onClick={createRoom} disabled={busy !== null}>
            {busy === "create" ? "Creating…" : "Create a room for friends"}
          </button>

          <div className="or">or</div>

          <form className="field" onSubmit={join}>
            <label className="field-label" htmlFor="join-code">
              Join with code
            </label>
            <div className="row">
              <input
                id="join-code"
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={ROOM_CODE_LENGTH}
                placeholder="ABC234"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit">Join</button>
            </div>
          </form>

        </div>

        <div className="home-side">
          <DailyCard demo={demo?.daily} />
          <RoomList onJoin={openRoom} demoRooms={demo?.rooms} />
        </div>

        <section className="steps" aria-labelledby="steps-title">
          <h3 id="steps-title">How a race works</h3>
          <ol>
            <li>Race now to meet whoever is online, or create a room and share its code with friends.</li>
            <li>The race starts 3 seconds after someone joins. Everyone gets the same scramble.</li>
            <li>Solve, then pick OK, +2 or DNF. Averages and points follow WCA rules.</li>
          </ol>
        </section>
      </main>

      <footer className="home-foot">
        <span>Timer: hold space or touch, let go to start, any key or tap stops.</span>
        <span>Scrambles and pictures by cubing.js</span>
      </footer>
    </div>
  );
}

/** Today's daily scramble: your status in one line, and a way in. */
function DailyCard({ demo }: { demo?: DailyStatus }) {
  const [daily, setDaily] = useState<DailyStatus | null>(demo ?? null);
  useEffect(() => {
    if (demo) return;
    const load = () =>
      void request(ClientEvents.DAILY_STATUS, { playerId: loadIdentity().playerId }).then((r) => r.ok && setDaily(r.daily));
    socket.on("connect", load);
    if (socket.connected) load();
    return () => void socket.off("connect", load);
  }, [demo]);

  const done = daily?.status === "done" && daily.result;
  return (
    <section className="panel daily-card">
      <div className="grow">
        <h2>Daily scramble</h2>
        <p className="small muted">
          {!daily
            ? "Same scramble for everyone, one attempt a day."
            : done
              ? `You: ${formatResult(daily.result!)} · #${daily.rank} of ${daily.total}`
              : daily.status === "started"
                ? "Your attempt is running. Finish it!"
                : `One attempt · ${daily.total} finished today`}
        </p>
      </div>
      <button type="button" className={done ? "" : "primary"} onClick={() => navigate("/daily")}>
        {done ? "Leaderboard" : daily?.status === "started" ? "Continue" : "Play"}
      </button>
    </section>
  );
}

const THEME_ORDER: ThemePref[] = ["system", "light", "dark"];
const THEME_LABEL: Record<ThemePref, string> = { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" };

/** Cycles system / light / dark. */
function ThemeButton() {
  const { theme } = usePrefs();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
  return (
    <button type="button" className="quiet small" onClick={() => setPref("theme", next)}>
      {THEME_LABEL[theme]}
    </button>
  );
}
