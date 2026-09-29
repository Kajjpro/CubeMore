import { memo, useEffect, useRef, useState } from "react";
import { setPref, usePrefs, type Prefs } from "../prefs";
import { Segmented } from "./ui";

/**
 * Copies the room link. Where the clipboard API isn't allowed (plain http on a
 * local network), it falls back to the older copy command. No dialogs.
 */
export async function copyRoomLink(code: string): Promise<boolean> {
  const link = `${window.location.origin}/room/${code}`;
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

/** "Copied" for a moment after copying. */
export function useCopy(code: string): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);
  return [
    copied,
    () => {
      void copyRoomLink(code).then((ok) => {
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
  summary: string;
  connected: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onLeave: () => void;
}

export const TopBar = memo(function TopBar(props: TopBarProps) {
  const [copied, copy] = useCopy(props.code);
  return (
    <header className="topbar">
      <button type="button" className="code-button" onClick={copy} aria-label={`Room ${props.code}. Copy link`}>
        {copied ? "Copied" : props.code}
      </button>
      <p className="summary" title={props.summary}>
        <span>{props.summary}</span>
      </p>
      <span className="connection" role="status" title={props.connected ? "Connected" : "Reconnecting"}>
        <span className={`dot ${props.connected ? "ok" : "warn"}`} aria-hidden />
        <span className="sr-only">{props.connected ? "Connected" : "Reconnecting"}</span>
      </span>
      <button
        type="button"
        className="quiet menu-button"
        aria-expanded={props.menuOpen}
        aria-controls="room-menu"
        onClick={props.onToggleMenu}
      >
        Menu
      </button>
      {props.menuOpen && <Menu onClose={props.onCloseMenu} onLeave={props.onLeave} />}
    </header>
  );
});

function Menu({ onClose, onLeave }: { onClose: () => void; onLeave: () => void }) {
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
