import { memo, useEffect, useRef, useState } from "react";
import { getCubeEvent, type RoomSettings } from "@cube-racing/shared";
import { FORMAT_LABELS, roomEventShort, WIN_CONDITION_LABELS } from "../labels";
import { setPref, usePrefs, type Prefs } from "../prefs";
import { connectBtTimer, disconnectBtTimer, useBtTimer } from "../btTimer";
import { bluetoothSupported } from "../smartCube";
import { ConfirmButton } from "./ConfirmButton";
import { SmartCubeControls } from "./SmartCube";
import { Icon, LogoMark, RoomEventIcon, Segmented } from "./ui";

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
  /** The host is still setting the room up: no code or link anywhere until it's opened. */
  setup: boolean;
  /** Stepping away: you're only watching (null = you're not in the room). */
  watching: boolean | null;
  /** True if stepping away now turns your remaining solves in this set into DNFs. */
  awayCostsSolves: boolean;
  onSetWatching: (watching: boolean) => void;
}

/**
 * The compact 40 px header. Left: event, room code (tap to copy the link;
 * public rooms show no code, just "Link"), format. Right: the live room status and the Menu. Phones get short forms.
 */
export const TopBar = memo(function TopBar(props: TopBarProps) {
  const [copied, copy] = useCopy(props.code, props.pin);
  const { settings } = props;
  const bestOf = settings.winCondition === "unlimited" ? "Unlimited" : `Bo${settings.winCondition.slice(2)}`;
  return (
    <header className="topbar">
      <span className="topbar-logo">
        <LogoMark size={26} />
      </span>
      <span className="event-badge" title={settings.mixedEvents ? "Mixed events: everyone races their own" : getCubeEvent(settings.cubeEvent).name}>
        <RoomEventIcon settings={settings} />
        <span className="long">{settings.mixedEvents ? "Mixed events" : getCubeEvent(settings.cubeEvent).name}</span>
        <span className="short">{roomEventShort(settings)}</span>
      </span>
      {!props.setup && (
        <button
          type="button"
          className="code-button"
          onClick={copy}
          aria-label={props.pin ? `Room ${props.code}. Copy link` : "Copy link"}
          data-copied={copied}
          data-dense
        >
          <span className="code-text">{copied ? "Copied" : props.pin ? props.code : "Link"}</span>
          <Icon name={copied ? "check" : "copy"} size={14} />
        </button>
      )}
      <span className="format">
        <span className="long">
          {FORMAT_LABELS[settings.format]}, {WIN_CONDITION_LABELS[settings.winCondition]}
          {settings.scoring === "handicap" && ", Handicap"}
        </span>
        <span className="short">
          {FORMAT_LABELS[settings.format]}, {bestOf}
        </span>
      </span>
      <span className="grow" />
      <span className="room-status" role="status">
        {props.status}
      </span>
      {!props.connected && <span className="connection">offline</span>}
      <button
        type="button"
        className="quiet menu-button"
        aria-expanded={props.menuOpen}
        aria-controls="room-menu"
        aria-label="Menu"
        onClick={props.onToggleMenu}
        data-dense
      >
        <Icon name={props.menuOpen ? "x" : "menu"} />
        <span className="menu-label">Menu</span>
      </button>
      {props.menuOpen && (
        <Menu
          name={props.name}
          code={props.code}
          pin={props.pin}
          onCopy={copy}
          copied={copied}
          onClose={props.onCloseMenu}
          onLeave={props.onLeave}
          setup={props.setup}
          watching={props.watching}
          awayCostsSolves={props.awayCostsSolves}
          onSetWatching={(watching) => {
            props.onSetWatching(watching);
            props.onCloseMenu();
          }}
        />
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
  setup: boolean;
  watching: boolean | null;
  awayCostsSolves: boolean;
  onSetWatching: (watching: boolean) => void;
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
        {props.setup ? (
          <p className="small muted">Only you can see this room until you open it.</p>
        ) : (
          <>
            {props.pin && (
              <p className="small muted">
                Room <span className="mono">{props.code}</span>, PIN <span className="mono">{props.pin}</span>
              </p>
            )}
            <button type="button" className="with-icon" onClick={props.onCopy}>
              <Icon name={props.copied ? "check" : "link"} />
              {props.copied ? "Copied" : props.pin ? "Copy invite link" : "Copy link"}
            </button>
          </>
        )}
        {props.watching === false &&
          (props.awayCostsSolves ? (
            <ConfirmButton
              className="with-icon"
              label="Step away, just watch"
              confirmLabel="Tap again: the rest of this set is DNF"
              onConfirm={() => props.onSetWatching(true)}
            />
          ) : (
            <button type="button" className="with-icon" onClick={() => props.onSetWatching(true)}>
              <Icon name="eye" />
              Step away, just watch
            </button>
          ))}
        {props.watching === true && (
          <button type="button" className="primary with-icon" onClick={() => props.onSetWatching(false)}>
            Race again
          </button>
        )}
        {props.watching !== null && (
          <p className="tiny muted">
            {props.watching
              ? "You're watching: you stay in the room and chat, but nobody waits for you."
              : "Need a break? Watch for a while; nobody waits for you, and your points stay."}
          </p>
        )}
      </div>
      <SmartCubeSection />
      <BtTimerSection />
      <OverlaySection code={props.code} pin={props.pin} />
      <div className="section">
        <h3>Preferences</h3>
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
          <kbd>Space</kbd>
          <span>hold, then let go to start</span>
          <kbd>any key</kbd>
          <span>stop</span>
          <span className="kbd-group">
            <kbd>1</kbd>
            <kbd>2</kbd>
            <kbd>3</kbd>
          </span>
          <span>OK, +2, DNF after a solve</span>
          <kbd>Esc</kbd>
          <span>cancel holding, close this menu</span>
        </div>
      </div>
      <div className="section">
        <button type="button" className="danger with-icon" onClick={onLeave}>
          <Icon name="logout" />
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
      <button type="button" className="with-icon" onClick={copy}>
        <Icon name={copied ? "check" : "copy"} />
        {copied ? "Copied" : "Copy overlay link"}
      </button>
    </div>
  );
}

/** Bluetooth timer: a GAN Smart Timer or Halo times your solves, like at a competition. */
function BtTimerSection() {
  const timer = useBtTimer();
  return (
    <div className="section">
      <h3>Bluetooth timer <span className="tag">beta</span></h3>
      {!bluetoothSupported ? (
        <p className="tiny muted">Needs Chrome or Edge with Bluetooth (not on iPhone).</p>
      ) : timer.status === "on" ? (
        <>
          <p className="tiny muted">
            {timer.name} connected. Hands on to get ready, lift to start, stop it like at a competition: the time is the
            timer's own.
          </p>
          <button type="button" onClick={disconnectBtTimer}>
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="tiny muted">GAN Smart Timer and GAN Halo Smart Timer.</p>
          {timer.error && <p className="error-text">{timer.error}</p>}
          <button type="button" disabled={timer.status === "connecting"} onClick={() => void connectBtTimer()}>
            {timer.status === "connecting" ? "Connecting…" : "Connect timer"}
          </button>
        </>
      )}
    </div>
  );
}

/** Smart cube (beta): connect a Bluetooth cube; it then times 3x3 solves by itself. */
function SmartCubeSection() {
  return (
    <div className="section">
      <h3>Smart cube <span className="tag">beta</span></h3>
      <SmartCubeControls />
    </div>
  );
}
