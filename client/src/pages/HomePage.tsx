import { useEffect, useState, type FormEvent } from "react";
import { ClientEvents, NICKNAME_MAX_LENGTH, ROOM_CODE_LENGTH, type DailyStatus, type PublicRoomInfo } from "@cube-racing/shared";
import { useAccount } from "../auth";
import { GuestHint } from "../components/Account";
import { RoomTabs, useRooms } from "../components/RoomList";
import { Link, SiteFooter, SiteHeader } from "../components/Site";
import { SmartHome } from "../components/SmartHome";
import { Avatar, Icon } from "../components/ui";
import { getPrefs } from "../prefs";
import { navigate } from "../router";
import { request, socket } from "../socket";
import { loadIdentity, saveNickname } from "../storage";
import { formatResult } from "../time";

/** Only for /dev/states. */
export interface HomeDemo {
  nickname?: string;
  rooms?: PublicRoomInfo[];
  daily?: DailyStatus;
  tab?: "public" | "private";
}

/**
 * The home page: the open rooms come first (Public | Private), with "Create a
 * room" and "Join with a code" right above them. Then the daily scramble,
 * contact, and smart cube racing.
 */
export function HomePage({ demo }: { demo?: HomeDemo }) {
  const [nickname, setNickname] = useState(() => demo?.nickname ?? loadIdentity().nickname);
  const account = useAccount();
  // Signed in, your name is your username (the server uses it too).
  const accountName = account.signedIn ? account.username : null;
  const publicId = usePublicId(account.playerId ?? loadIdentity().playerId);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { rooms, connected } = useRooms(demo?.rooms);
  const racingNow = rooms?.filter((room) => room.racing).length ?? 0;

  // If you got here with the browser's Back button, you were still in a room.
  // Tell the server you left (it does nothing if you weren't in one).
  useEffect(() => {
    if (!demo && socket.connected) void request(ClientEvents.LEAVE_ROOM, {});
  }, [demo]);

  /** Checks the nickname, saves it, and returns it (or null if it's empty). Signed in: your username. */
  function checkNickname(): string | null {
    if (accountName) {
      setError(null);
      return accountName;
    }
    const name = nickname.trim();
    if (!name) {
      setError("Enter a nickname first.");
      document.getElementById("home-nickname")?.focus();
      return null;
    }
    setError(null);
    saveNickname(name);
    return name;
  }

  /**
   * One tap: the room is made with the defaults (public, 3x3, ao5, Best of 3)
   * and you're in. The event and everything else are picked in the room.
   */
  async function createRoom(): Promise<void> {
    if (creating) return;
    const name = checkNickname();
    if (!name) return;
    setCreating(true);
    const response = await request(ClientEvents.CREATE_ROOM, {
      playerId: loadIdentity().playerId,
      nickname: name,
      settings: {},
      cubeEvent: getPrefs().mixedEvent,
    });
    setCreating(false);
    if (response.ok) navigate(`/room/${response.room.code}`);
    else setError(response.error);
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
      <SiteHeader>
        {rooms && rooms.length > 0 && (
          <span className="live-pill">{racingNow ? `${racingNow} racing now` : `${rooms.length} open`}</span>
        )}
      </SiteHeader>

      <main className="home-main">
        <section className="panel rooms-hero" aria-labelledby="rooms-title">
          <div className="rooms-hero-head">
            <div className="rooms-hero-title">
              <h1 id="rooms-title">Open rooms</h1>
              <p className="small muted">Race other cubers live: the same scramble for everyone, a live timer, WCA averages.</p>
            </div>
            <div className="rooms-actions">
              <button type="button" className="primary create-button" onClick={createRoom} disabled={creating}>
                <Icon name="plus" size={18} />
                {creating ? "Creating…" : "Create a room"}
              </button>
              <form className="join-form" onSubmit={join}>
                <label className="sr-only" htmlFor="join-code">
                  Join with a room code
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
          </div>

          <div className="you-bar">
            <Avatar id={publicId} name={accountName ?? (nickname || "?")} size="sm" />
            {accountName ? (
              <span className="you-bar-name">
                Racing as <b>{accountName}</b>
              </span>
            ) : (
              <label className="you-bar-field">
                <span className="you-bar-label">Racing as</span>
                <input
                  id="home-nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={NICKNAME_MAX_LENGTH}
                  placeholder="Your nickname"
                  autoComplete="nickname"
                />
              </label>
            )}
          </div>
          {account.loaded && !account.signedIn && <GuestHint />}
          {error && <p className="banner banner-error">{error}</p>}

          <RoomTabs rooms={rooms} connected={connected} onJoin={openRoom} initialTab={demo?.tab} />
        </section>

        <div className="home-cards">
          <DailyCard demo={demo?.daily} />
          <ContactCard />
        </div>
      </main>

      <SmartHome />

      <p className="tiny muted home-tip">
        Hold <kbd>Space</kbd> (or the timer on a phone), let go to start. Any key or tap stops it.
      </p>
      <SiteFooter />
    </div>
  );
}

/** Questions, ideas, bugs: the way to the contact page. */
function ContactCard() {
  return (
    <section className="panel daily-card contact-card" aria-labelledby="contact-card-title">
      <div className="grow">
        <h2 id="contact-card-title">Contact</h2>
        <p className="small muted">Questions, ideas, a bug, or an event to run on Cubist? Write to us.</p>
      </div>
      <Link to="/contact" className="button-link">
        Write
      </Link>
    </section>
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
      <button type="button" onClick={() => navigate("/daily")}>
        {done ? "Leaderboard" : daily?.status === "started" ? "Continue" : "Play"}
      </button>
    </section>
  );
}
