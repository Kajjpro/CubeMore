/*
 * Connect a real timer: a GAN Smart Timer / Halo over Bluetooth, or a Stackmat
 * with a cable into the headset / mic jack. Used in the room menu and the trainer.
 */

import { audioInputSupported, chooseStackmatInput, connectBtTimer, connectStackmat, disconnectBtTimer, useBtTimer } from "../btTimer";
import { bluetoothSupported } from "../smartCube";

export function CompetitionTimerControls() {
  const timer = useBtTimer();

  if (timer.status === "on" && timer.kind === "stackmat") {
    return (
      <div className="timer-connect">
        <p className="tiny">
          {timer.signal ? (
            <span className="ok-text">Stackmat connected.</span>
          ) : (
            <span className="warn-text">Listening, but no signal yet. Turn the Stackmat on, and check the cable is in the headset or mic jack.</span>
          )}
        </p>
        {timer.inputs.length > 1 && (
          <label className="tiny muted timer-input">
            Sound input
            <select value={timer.inputId ?? ""} onChange={(event) => void chooseStackmatInput(event.target.value)}>
              {timer.inputs.map((input) => (
                <option key={input.id} value={input.id}>
                  {input.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="tiny muted">Hands on to get ready, lift to start, stop it like at a competition: the time is the timer's own.</p>
        <button type="button" onClick={disconnectBtTimer}>
          Disconnect
        </button>
      </div>
    );
  }

  if (timer.status === "on") {
    return (
      <div className="timer-connect">
        <p className="tiny muted">
          {timer.name} connected. Hands on to get ready, lift to start, stop it like at a competition: the time is the timer's own.
        </p>
        <button type="button" onClick={disconnectBtTimer}>
          Disconnect
        </button>
      </div>
    );
  }

  const connecting = timer.status === "connecting";
  return (
    <div className="timer-connect">
      {timer.error && <p className="error-text tiny">{timer.error}</p>}
      <div className="timer-connect-buttons">
        <button type="button" disabled={connecting || !audioInputSupported} onClick={() => void connectStackmat()}>
          {connecting && timer.kind === "stackmat" ? "Connecting…" : "Stackmat (cable)"}
        </button>
        <button type="button" disabled={connecting || !bluetoothSupported} onClick={() => void connectBtTimer()}>
          {connecting && timer.kind === "gan" ? "Connecting…" : "GAN timer (Bluetooth)"}
        </button>
      </div>
      <p className="tiny muted">
        Stackmat: a 3.5 mm cable from its data port into the headset or mic jack (phones and most laptops need a headset adapter). Works on iPhone too.
        {!bluetoothSupported && " GAN timers need Chrome or Edge with Bluetooth."}
      </p>
    </div>
  );
}
