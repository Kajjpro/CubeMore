import { useEffect, useState, type FormEvent } from "react";
import {
  answerMacAddress,
  bluetoothSupported,
  connectSmartCube,
  disconnectSmartCube,
  keyboardCubeAllowed,
  markSmartCubeSolved,
  preloadCubeDrivers,
  useSmartCube,
} from "../smartCube";

/** iPhone or iPad (iPads can say they're a Mac): their browsers have no Bluetooth for websites. */
const isAppleMobile =
  typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const isAndroid = typeof navigator !== "undefined" && /Android/.test(navigator.userAgent);

const BLUEFY_URL = "https://apps.apple.com/app/id1492822055";

/**
 * Connect a smart cube, and what to do once it's connected. Used in the menu,
 * and in place of the timer in smart-cube rooms when no cube is connected yet.
 */
export function SmartCubeControls() {
  const cube = useSmartCube();
  // Ready before the tap: the browser opens its Bluetooth list only right after one.
  useEffect(() => {
    if (bluetoothSupported) preloadCubeDrivers();
  }, []);
  if (!bluetoothSupported && !keyboardCubeAllowed) {
    return isAppleMobile ? (
      <p className="tiny muted">
        iPhone and iPad browsers can't use Bluetooth. Open this page in the free{" "}
        <a href={BLUEFY_URL} target="_blank" rel="noopener noreferrer">
          Bluefy browser
        </a>{" "}
        to connect your cube.
      </p>
    ) : (
      <p className="tiny muted">This browser can't use Bluetooth. Use Chrome or Edge on a computer or an Android phone.</p>
    );
  }
  if (cube.askingMac) return <MacForm deviceName={cube.askingMac} brand={cube.askingMacBrand ?? "gan"} />;

  if (cube.status === "on") {
    return (
      <>
        <p className="tiny muted">
          {cube.name} connected{cube.battery !== null ? `, battery ${cube.battery}%` : ""}. On 3x3, follow the
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
  const label = (kind: "gan" | "qiyi" | "other", text: string) => (connecting && cube.kind === kind ? "Connecting…" : text);
  return (
    <>
      <p className="tiny muted">Solve your cube, then pick its brand.</p>
      {cube.error && <p className="error-text">{cube.error}</p>}
      <div className="row cube-brands">
        {bluetoothSupported && (
          <>
            <button type="button" className="grow" disabled={connecting} onClick={() => void connectSmartCube("gan")}>
              {label("gan", "GAN")}
            </button>
            <button type="button" className="grow" disabled={connecting} onClick={() => void connectSmartCube("qiyi")}>
              {label("qiyi", "QiYi")}
            </button>
            <button type="button" className="grow" disabled={connecting} onClick={() => void connectSmartCube("other")}>
              {label("other", "GoCube, Giiker")}
            </button>
          </>
        )}
        {keyboardCubeAllowed && (
          <button type="button" className="grow" disabled={connecting} onClick={() => void connectSmartCube("keyboard")}>
            Keyboard cube (test)
          </button>
        )}
      </div>
      {isAndroid && (
        <p className="tiny muted">
          Cube not in the list? Turn on Bluetooth and Location, allow Chrome to find nearby devices, and close the cube's own app.
        </p>
      )}
    </>
  );
}

/** Some GAN and QiYi cubes need their MAC address, and phones can't always read it. */
function MacForm({ deviceName, brand }: { deviceName: string; brand: "gan" | "qiyi" }) {
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
        {brand === "gan" ? "Find it in the GAN app (cube settings). " : "Find it in the QiYi app (cube info). "}
        Or let Chrome read it: open chrome://flags, turn on "Experimental Web Platform features", restart Chrome and connect
        again. It's asked once, then remembered.
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
