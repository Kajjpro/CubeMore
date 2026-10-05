import { useState, type FormEvent } from "react";
import {
  answerMacAddress,
  bluetoothSupported,
  connectSmartCube,
  disconnectSmartCube,
  keyboardCubeAllowed,
  markSmartCubeSolved,
  useSmartCube,
} from "../smartCube";

/**
 * Connect a smart cube, and what to do once it's connected. Used in the menu,
 * and in place of the timer in smart-cube rooms when no cube is connected yet.
 */
export function SmartCubeControls() {
  const cube = useSmartCube();
  if (!bluetoothSupported && !keyboardCubeAllowed) {
    return <p className="tiny muted">Smart cubes need Chrome or Edge with Bluetooth (not on iPhone).</p>;
  }
  if (cube.askingMac) return <MacForm deviceName={cube.askingMac} />;

  if (cube.status === "on") {
    return (
      <>
        <p className="tiny muted">
          {cube.name} connected{cube.battery !== null ? ` · battery ${cube.battery}%` : ""}. On 3x3, follow the
          scramble on your cube: 15 s of inspection start when it matches, your first turn starts the timer and
          solving stops it.
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
    );
  }

  const connecting = cube.status === "connecting";
  return (
    <>
      <p className="tiny muted">Solve your cube before connecting.</p>
      {cube.error && <p className="error-text">{cube.error}</p>}
      <div className="row">
        {bluetoothSupported && (
          <>
            <button type="button" className="grow" disabled={connecting} onClick={() => void connectSmartCube("gan")}>
              {connecting && cube.kind === "gan" ? "Connecting…" : "GAN cube"}
            </button>
            <button type="button" className="grow" disabled={connecting} onClick={() => void connectSmartCube("other")}>
              {connecting && cube.kind === "other" ? "Connecting…" : "Other smart cube"}
            </button>
          </>
        )}
        {keyboardCubeAllowed && (
          <button type="button" className="grow" disabled={connecting} onClick={() => void connectSmartCube("keyboard")}>
            Keyboard cube (test)
          </button>
        )}
      </div>
      <p className="tiny muted">GAN: 356 i3, i Carry 2, 12 ui, 14 ui… Other: GoCube, Giiker, QiYi, the first GAN 356i.</p>
    </>
  );
}

/** Some GAN cubes encrypt their data with their MAC address, and Chrome can't always read it. */
function MacForm({ deviceName }: { deviceName: string }) {
  const [mac, setMac] = useState("");
  function submit(event: FormEvent): void {
    event.preventDefault();
    answerMacAddress(mac);
  }
  return (
    <form className="mac-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">MAC address of {deviceName}</span>
        <input
          value={mac}
          onChange={(e) => setMac(e.target.value)}
          placeholder="AB:12:CD:34:EF:56"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
      </label>
      <p className="tiny muted">
        Find it in the GAN app (cube settings), or open chrome://bluetooth-internals while the cube is on.
        It's asked once, then remembered.
      </p>
      <div className="row">
        <button type="submit" className="grow primary" disabled={mac.trim().length < 17}>
          Connect
        </button>
        <button type="button" className="grow" onClick={() => answerMacAddress(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
