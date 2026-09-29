import { useEffect, useState, type FormEvent } from "react";
import {
  ClientEvents,
  DEFAULT_SETTINGS,
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  type RoomSettings,
  type Scramble,
} from "@cube-racing/shared";
import { SettingsForm } from "../components/SettingsForm";
import { EventIcon } from "../components/ui";
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
    return <CreateRoom checkNickname={checkNickname} error={error} onError={setError} onBack={() => setScreen("home")} />;
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

        <WarmUp initial={demo?.warmUp} />
      </main>

      <footer className="home-foot">
        <span>Timer: hold space or touch, let go to start, any key or tap stops.</span>
        <span>Scrambles and pictures by cubing.js</span>
      </footer>
    </div>
  );
}

function CreateRoom(props: {
  checkNickname: () => string | null;
  error: string | null;
  onError: (error: string) => void;
  onBack: () => void;
}) {
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [creating, setCreating] = useState(false);

  async function create(): Promise<void> {
    const name = props.checkNickname();
    if (!name) return;
    setCreating(true);
    const response = await request(ClientEvents.CREATE_ROOM, {
      playerId: loadIdentity().playerId,
      nickname: name,
      settings,
    });
    setCreating(false);
    if (response.ok) navigate(`/room/${response.room.code}`);
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
      <SettingsForm settings={settings} onChange={(changes) => setSettings({ ...settings, ...changes })} />
      <div className="start-bar">
        <div className="inner" style={{ maxWidth: 528 }}>
          <p className="grow small muted">{settingsSummary(settings)}</p>
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
