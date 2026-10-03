import { useEffect, useState, type FormEvent } from "react";
import {
  ClientEvents,
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  type CubeEventId,
  type DailyStatus,
  type PublicRoomInfo,
} from "@cube-racing/shared";
import { RoomList, useRooms } from "../components/RoomList";
import { EventPicker } from "../components/SettingsForm";
import { Avatar, Brand, ThemeButton } from "../components/ui";
import { EVENT_SHORT } from "../labels";
import { setPref, usePrefs } from "../prefs";
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
  const publicId = usePublicId(loadIdentity().playerId);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"race" | "create" | null>(null);
  const { raceEvent } = usePrefs();
  const { rooms, connected } = useRooms(demo?.rooms);
  const racingNow = rooms?.filter((room) => room.racing).length ?? 0;

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
      <header className="site-head">
        <Brand />
        <span className="grow" />
        {rooms && rooms.length > 0 && (
          <span className="live-pill">{racingNow ? `${racingNow} racing now` : `${rooms.length} open`}</span>
        )}
        <ThemeButton />
      </header>

      <main className="home-main">
        <h1 className="sr-only">Cube Racing</h1>
        <section className="panel race-card" aria-label="Start racing">
          <div className="you-row">
            <Avatar id={publicId} name={nickname || "?"} size="lg" />
            <label className="field grow">
              <span className="field-label">Your nickname</span>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder="Your name"
                autoComplete="nickname"
                autoFocus={!nickname}
              />
            </label>
          </div>

          <EventPicker label="Pick your puzzle" layout="strip" value={raceEvent} onChange={(id) => setPref("raceEvent", id)} />

          {error && <p className="banner banner-error">{error}</p>}

          <button type="button" className="primary xl race-button" onClick={raceNow} disabled={busy !== null}>
            {busy === "race" ? "Finding a race…" : `Race ${EVENT_SHORT[raceEvent]} now`}
          </button>
          <p className="tiny muted race-hint">Joins an open room for this event, or opens one for the next racer.</p>

          <div className="race-alt">
            <button type="button" className="create-button" onClick={createRoom} disabled={busy !== null}>
              {busy === "create" ? "Creating…" : "Create a room for friends"}
            </button>
            <form className="join-form" onSubmit={join}>
              <label className="sr-only" htmlFor="join-code">
                Join with code
              </label>
              <input
                id="join-code"
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={ROOM_CODE_LENGTH}
                placeholder="CODE"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit">Join</button>
            </form>
          </div>
        </section>

        <div className="home-side">
          <DailyCard demo={demo?.daily} />
          <RoomList rooms={rooms} connected={connected} onJoin={openRoom} />
        </div>

      </main>

      <footer className="home-foot">
        <span>
          Hold <kbd>Space</kbd> (or the timer on a phone), let go to start. Any key or tap stops it.
        </span>
        <span>Scrambles and pictures by cubing.js</span>
      </footer>
    </div>
  );
}

/**
 * Your public id, worked out like the server does (the first 12 hex digits of
 * SHA-256 of your secret id), so your avatar has the same colour here as in a
 * room. null where Web Crypto isn't available (plain http on a local network).
 */
function usePublicId(playerId: string): string | null {
  const [publicId, setPublicId] = useState<string | null>(null);
  useEffect(() => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return;
    let cancelled = false;
    void subtle.digest("SHA-256", new TextEncoder().encode(playerId)).then((hash) => {
      const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (!cancelled) setPublicId(hex.slice(0, 12));
    });
    return () => {
      cancelled = true;
    };
  }, [playerId]);
  return publicId;
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
    <section className="panel daily-card" aria-labelledby="daily-title">
      <div className="grow">
        <h2 id="daily-title">Daily scramble</h2>
        <p className="small muted">
          {!daily ? (
            "The same 3x3 scramble for everyone, one attempt a day."
          ) : done ? (
            <>
              You: <b className="mono daily-you">{formatResult(daily.result!)}</b>, #{daily.rank} of {daily.total}
            </>
          ) : daily.status === "started" ? (
            "Your attempt is running. Finish it!"
          ) : (
            `One attempt. ${daily.total} finished today.`
          )}
        </p>
      </div>
      <button type="button" className={done ? "" : "primary"} onClick={() => navigate("/daily")}>
        {done ? "Leaderboard" : daily?.status === "started" ? "Continue" : "Play"}
      </button>
    </section>
  );
}
