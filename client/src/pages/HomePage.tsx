import { useEffect, useState, type FormEvent } from "react";
import {
  ClientEvents,
  DEFAULT_SETTINGS,
  NICKNAME_MAX_LENGTH,
  PIN_LENGTH,
  ROOM_CODE_LENGTH,
  ROOM_NAME_MAX_LENGTH,
  type PublicRoomInfo,
  type RoomSettings,
  type Scramble,
} from "@cube-racing/shared";
import { PublicRooms } from "../components/PublicRooms";
import { BestOfField, EventSelect, FormatField, MoreOptions } from "../components/SettingsForm";
import { EventIcon, Segmented } from "../components/ui";
import { WarmUp } from "../components/WarmUp";
import { settingsSummary } from "../labels";
import { setPref, usePrefs, type ThemePref } from "../prefs";
import { navigate } from "../router";
import { request, socket } from "../socket";
import { loadIdentity, saveNickname } from "../storage";

/** Only for /dev/states. */
export interface HomeDemo {
  screen?: "home" | "create";
  nickname?: string;
  /** A fixed warm-up scramble, so screenshots are the same every time. */
  warmUp?: Scramble;
  rooms?: PublicRoomInfo[];
  visibility?: RoomSettings["visibility"];
}

export function HomePage({ demo }: { demo?: HomeDemo }) {
  const [nickname, setNickname] = useState(() => demo?.nickname ?? loadIdentity().nickname);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<"home" | "create">(demo?.screen ?? "home");

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

  if (screen === "create") {
    return (
      <CreateRoom
        nickname={nickname.trim()}
        checkNickname={checkNickname}
        error={error}
        onError={setError}
        onBack={() => setScreen("home")}
        initialVisibility={demo?.visibility}
      />
    );
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

          <button type="button" className="primary" onClick={() => checkNickname() && setScreen("create")}>
            Create room
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

          <section className="steps" aria-labelledby="steps-title">
            <h3 id="steps-title">How a race works</h3>
            <ol>
              <li>Create a room and pick the event, ao5 or ao12, and best of 3.</li>
              <li>Share the code. Everyone gets the same scramble at the same moment.</li>
              <li>Solve, then pick OK, +2 or DNF. Averages and points follow WCA rules.</li>
            </ol>
          </section>
        </div>

        <div className="home-side">
          <PublicRooms onJoin={openRoom} demoRooms={demo?.rooms} />
          <WarmUp initial={demo?.warmUp} />
        </div>
      </main>

      <footer className="home-foot">
        <span>Timer: hold space or touch, let go to start, any key or tap stops.</span>
        <span>Scrambles and pictures by cubing.js</span>
      </footer>
    </div>
  );
}

/** A random 4-digit PIN (the host can change it). */
function randomPin(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 10 ** PIN_LENGTH).padStart(PIN_LENGTH, "0");
}

/** Creating a room: a few choices with good defaults, so it's quick. */
function CreateRoom(props: {
  nickname: string;
  checkNickname: () => string | null;
  error: string | null;
  onError: (error: string) => void;
  onBack: () => void;
  initialVisibility?: RoomSettings["visibility"];
}) {
  const [settings, setSettings] = useState<RoomSettings>({
    ...DEFAULT_SETTINGS,
    visibility: props.initialVisibility ?? DEFAULT_SETTINGS.visibility,
  });
  const [pin, setPin] = useState(randomPin);
  const [creating, setCreating] = useState(false);
  const change = (changes: Partial<RoomSettings>) => setSettings((old) => ({ ...old, ...changes }));
  const isPrivate = settings.visibility === "private";

  async function create(): Promise<void> {
    const name = props.checkNickname();
    if (!name) return;
    if (isPrivate && pin.length !== PIN_LENGTH) {
      props.onError(`The PIN must be ${PIN_LENGTH} digits.`);
      return;
    }
    setCreating(true);
    const response = await request(ClientEvents.CREATE_ROOM, {
      playerId: loadIdentity().playerId,
      nickname: name,
      settings,
      ...(isPrivate ? { pin } : {}),
    });
    setCreating(false);
    if (response.ok) navigate(`/room/${response.room.code}${isPrivate ? `?pin=${pin}` : ""}`);
    else props.onError(response.error);
  }

  return (
    <main className="page page-wide" style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom))" }}>
      <div className="page-head">
        <button type="button" className="quiet" onClick={props.onBack}>
          Back
        </button>
        <h1>New room</h1>
      </div>
      {props.error && <p className="banner banner-error">{props.error}</p>}

      <div className="settings-form">
        <label className="field">
          <span className="field-label">Room name</span>
          <input
            value={settings.name}
            onChange={(e) => change({ name: e.target.value })}
            maxLength={ROOM_NAME_MAX_LENGTH}
            placeholder={props.nickname ? `${props.nickname}'s room` : "My room"}
            autoComplete="off"
          />
        </label>

        <Segmented
          label="Who can join"
          value={settings.visibility}
          options={[
            { value: "public", label: "Public" },
            { value: "private", label: "Private (PIN)" },
          ]}
          onChange={(visibility) => change({ visibility })}
        />
        {isPrivate ? (
          <label className="field">
            <span className="field-label">PIN</span>
            <input
              className="pin-input"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
              inputMode="numeric"
              autoComplete="off"
            />
            <span className="tiny muted">Not listed publicly. Friends need the room code and this PIN; the invite link includes both.</span>
          </label>
        ) : (
          <p className="tiny muted">Listed on the home page, so anyone can join.</p>
        )}

        <EventSelect value={settings.cubeEvent} onChange={(cubeEvent) => change({ cubeEvent })} />
        <FormatField value={settings.format} onChange={(format) => change({ format })} />
        <BestOfField value={settings.winCondition} onChange={(winCondition) => change({ winCondition })} />
        <MoreOptions settings={settings} onChange={change} />
      </div>

      <div className="start-bar">
        <div className="inner" style={{ maxWidth: 528 }}>
          <p className="grow small muted">
            {settingsSummary(settings)}
            {isPrivate ? " · Private" : ""}
          </p>
          <button type="button" className="primary" onClick={create} disabled={creating}>
            {creating ? "Creating…" : "Create room"}
          </button>
        </div>
      </div>
    </main>
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
