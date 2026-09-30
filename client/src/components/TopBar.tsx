import { memo, useEffect, useRef, useState } from "react";
import { getCubeEvent, type RoomSettings } from "@cube-racing/shared";
import { EVENT_SHORT, FORMAT_LABELS, WIN_CONDITION_LABELS } from "../labels";
import { setPref, usePrefs, type Prefs } from "../prefs";
import {
  bluetoothSupported,
  connectSmartCube,
  disconnectSmartCube,
  keyboardCubeAllowed,
  markSmartCubeSolved,
  useSmartCube,
} from "../smartCube";
import { EventIcon, Segmented } from "./ui";

/**
 * The room's links. A private room's links include the PIN, so friends just tap
 * the invite, and the overlay works in OBS without typing anything.
 */
export function roomLink(code: string, pin: string | null, kind: "invite" | "overlay" = "invite"): string {
  const path = kind === "overlay" ? `/room/${code}/overlay` : `/room/${code}`;
  return `${window.location.origin}${path}${pin ? `?pin=${pin}` : ""}`;
}

/** Copies the room's invite link (see copyText). */
export function copyRoomLink(code: string, pin: string | null = null): Promise<boolean> {
  return copyText(roomLink(code, pin));
}

/**
 * Copies text. Where the clipboard API isn't allowed (plain http on a local
 * network), it falls back to the older copy command. No dialogs.
 */
export async function copyText(link: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = link;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  }
}

/** "Copied" for a moment after copying a room link. */
export function useCopy(code: string, pin: string | null = null, kind: "invite" | "overlay" = "invite"): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);
  return [
    copied,
    () => {
      void copyText(roomLink(code, pin, kind)).then((ok) => {
        if (!ok) return;
        setCopied(true);
        clearTimeout(timeout.current);
        timeout.current = setTimeout(() => setCopied(false), 1500);
      });
    },
  ];
}

interface TopBarProps {
  code: string;
  pin: string | null;
  name: string;
  settings: RoomSettings;
  /** Right side: "3/5 Solved", "6 players", "Set 2 done"... */
  status: string;
  connected: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onLeave: () => void;
}

/**
 * The compact 40 px header. Left: event, room code (tap to copy the link),
 * format. Right: the live room status and the Menu. Phones get short forms.
 */
export const TopBar = memo(function TopBar(props: TopBarProps) {
  const [copied, copy] = useCopy(props.code, props.pin);
  const { settings } = props;
  const bestOf = settings.winCondition === "unlimited" ? "Unlimited" : `Bo${settings.winCondition.slice(2)}`;
  return (
    <header className="topbar">
      <span className="event-badge" title={getCubeEvent(settings.cubeEvent).name}>
        <EventIcon id={settings.cubeEvent} />
        <span className="long">{getCubeEvent(settings.cubeEvent).name}</span>
        <span className="short">{EVENT_SHORT[settings.cubeEvent]}</span>
      </span>
      <button type="button" className="code-button" onClick={copy} aria-label={`Room ${props.code}. Copy link`} data-dense>
        {copied ? "Copied" : props.code}
      </button>
      <span className="format">
        <span className="long">
          {FORMAT_LABELS[settings.format]} · {WIN_CONDITION_LABELS[settings.winCondition]}
          {settings.scoring === "handicap" && " · Handicap"}
        </span>
        <span className="short">
          {FORMAT_LABELS[settings.format]} · {bestOf}
        </span>
      </span>
      <span className="grow" />
      <span className="room-status" role="status">
        {props.status}
      </span>
      <span className="connection" title={props.connected ? "Connected" : "Reconnecting"}>
        <span className={`dot ${props.connected ? "ok" : "warn"}`} aria-hidden />
        <span className="sr-only">{props.connected ? "Connected" : "Reconnecting"}</span>
      </span>
      <button
        type="button"
        className="quiet menu-button"
        aria-expanded={props.menuOpen}
        aria-controls="room-menu"
        onClick={props.onToggleMenu}
        data-dense
      >
        Menu
      </button>
      {props.menuOpen && (
        <Menu name={props.name} code={props.code} pin={props.pin} onCopy={copy} copied={copied} onClose={props.onCloseMenu} onLeave={props.onLeave} />
      )}
    </header>
  );
});

function Menu(props: {
  name: string;
  code: string;
  pin: string | null;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
  onLeave: () => void;
}) {
  const { onClose, onLeave } = props;
  const prefs = usePrefs();
  const ref = useRef<HTMLDivElement>(null);

  // Close with Escape or a click outside (the Menu button toggles it itself).
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    function onPointer(event: PointerEvent): void {
      const target = event.target as Element;
      if (!ref.current?.contains(target) && !target.closest?.(".menu-button")) onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  const set = <K extends keyof Prefs>(key: K) => (value: Prefs[K]) => setPref(key, value);

  return (
    <div className="menu" id="room-menu" ref={ref}>
      <div className="section menu-room">
        <h2 title={props.name}>{props.name}</h2>
        <p className="small muted">
          Room <span className="mono">{props.code}</span>
          {props.pin && (
            <>
              {" "}
              · PIN <span className="mono">{props.pin}</span>
            </>
          )}
        </p>
        <button type="button" onClick={props.onCopy}>
          {props.copied ? "Copied" : props.pin ? "Copy invite link" : "Copy link"}
        </button>
      </div>
      <SmartCubeSection />
      <OverlaySection code={props.code} pin={props.pin} />
      <div className="section">
        <Segmented label="Theme" value={prefs.theme} onChange={set("theme")} options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]} />
        <Segmented label="Running time" value={prefs.runningDisplay} onChange={set("runningDisplay")} options={[
          { value: "full", label: "0.00" },
          { value: "seconds", label: "Seconds" },
          { value: "hidden", label: "Hidden" },
        ]} />
        <Segmented label="Input" value={prefs.inputMode} onChange={set("inputMode")} options={[
          { value: "timer", label: "Timer" },
          { value: "typing", label: "Type in" },
        ]} />
        <Segmented label="Scramble preview" value={prefs.preview} onChange={set("preview")} options={[
          { value: "2d", label: "2D" },
          { value: "3d", label: "3D" },
          { value: "off", label: "Off" },
        ]} />
        <Segmented label="New scramble sound" value={prefs.sound ? "on" : "off"} onChange={(v) => setPref("sound", v === "on")} options={[
          { value: "on", label: "On" },
          { value: "off", label: "Muted" },
        ]} />
      </div>
      <div className="section hint-keys">
        <h3>Keyboard</h3>
        <div className="shortcuts">
          <span className="mono">Space</span>
          <span>hold, then let go to start</span>
          <span className="mono">any key</span>
          <span>stop</span>
          <span className="mono">1 2 3</span>
          <span>OK, +2, DNF after a solve</span>
          <span className="mono">Esc</span>
          <span>cancel holding, close this menu</span>
        </div>
      </div>
      <div className="section">
        <button type="button" className="danger" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </div>
  );
}

/** For streamers: a link to a transparent live-standings page to add in OBS. */
function OverlaySection({ code, pin }: { code: string; pin: string | null }) {
  const [copied, copy] = useCopy(code, pin, "overlay");
  return (
    <div className="section">
      <h3>Streamer overlay</h3>
      <p className="tiny muted">
        Live standings with running clocks on a transparent page. In OBS: add a Browser Source with this link, about
        420 × 520.
      </p>
      <button type="button" onClick={copy}>
        {copied ? "Copied" : "Copy overlay link"}
      </button>
    </div>
  );
}

/** Smart cube (beta): connect a Bluetooth cube; it then times 3x3 solves by itself. */
function SmartCubeSection() {
  const cube = useSmartCube();
  if (!bluetoothSupported && !keyboardCubeAllowed) {
    return (
      <div className="section">
        <h3>Smart cube (beta)</h3>
        <p className="tiny muted">Needs Chrome or Edge with Bluetooth (not on iPhone).</p>
      </div>
    );
  }
  return (
    <div className="section">
      <h3>Smart cube (beta)</h3>
      {cube.status === "on" ? (
        <>
          <p className="tiny muted">
            <span className="dot ok" aria-hidden /> {cube.name} connected. On 3x3: turn it to match the scramble, then your first
            turn starts the timer and solving stops it. Others can watch your cube live.
          </p>
          <div className="row">
            <button type="button" className="grow" onClick={markSmartCubeSolved}>
              My cube is solved
            </button>
            <button type="button" className="grow" onClick={disconnectSmartCube}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="tiny muted">GAN, GoCube, Giiker and other Bluetooth cubes. Solve it before connecting.</p>
          {cube.error && <p className="error-text">{cube.error}</p>}
          <div className="row">
            {bluetoothSupported && (
              <button type="button" className="grow" disabled={cube.status === "connecting"} onClick={() => void connectSmartCube("bluetooth")}>
                {cube.status === "connecting" ? "Connecting…" : "Connect smart cube"}
              </button>
            )}
            {keyboardCubeAllowed && (
              <button type="button" className="grow" disabled={cube.status === "connecting"} onClick={() => void connectSmartCube("keyboard")}>
                Keyboard cube (test)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
