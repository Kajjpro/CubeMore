/*
 * The room's voice and video call, on screen:
 *   CallPanel  at the top of the room chat: who's in the call (a tile each, with
 *              their camera or their initial), and Join / Mic / Camera / Leave.
 *   CallAudio  the other players' voices: always mounted in the room, so you
 *              keep hearing them while racing or with the chat closed.
 */

import { useEffect, useRef } from "react";
import { MAX_CALL_SIZE, type CallParticipant } from "@cube-racing/shared";
import { callsSupported, joinCall, leaveCall, toggleCamera, toggleMic, useCall } from "../call/call";
import { Avatar } from "./ui";

/** A <video> or <audio> showing a stream (React can't set srcObject by itself). */
function useStream<T extends HTMLMediaElement>(stream: MediaStream | null | undefined) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== (stream ?? null)) ref.current.srcObject = stream ?? null;
  }, [stream]);
  return ref;
}

export function CallAudio() {
  const call = useCall();
  if (call.status !== "on") return null;
  return (
    <div className="call-audio" aria-hidden>
      {Object.entries(call.streams).map(([peerId, stream]) => (
        <RemoteAudio key={peerId} stream={stream} />
      ))}
    </div>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useStream<HTMLAudioElement>(stream);
  return <audio ref={ref} autoPlay />;
}

/** Runs `action` and drops the focus: the spacebar must start the timer, not press this button again. */
const tap = (action: () => void) => (event: { currentTarget: HTMLElement }) => {
  action();
  event.currentTarget.blur();
};

export function CallPanel() {
  const call = useCall();
  if (!callsSupported) return null;
  const inCall = call.status === "on";
  const others = call.participants.filter((p) => p.peerId !== call.peerId);
  const full = !inCall && call.participants.length >= MAX_CALL_SIZE;

  return (
    <section className="call-panel" aria-label="Voice and video">
      {(inCall || others.length > 0) && (
        <ul className="call-tiles">
          {inCall && <Tile name="You" playerId={call.participants.find((p) => p.peerId === call.peerId)?.playerId ?? null} video={call.localVideo} audio={call.audio} self />}
          {others.map((p) => (
            <RemoteTile key={p.peerId} participant={p} stream={call.streams[p.peerId]} listening={inCall} />
          ))}
        </ul>
      )}
      {call.error && <p className="tiny error-text">{call.error}</p>}
      <div className="call-controls">
        {inCall ? (
          <>
            <button type="button" aria-pressed={!call.audio} onClick={tap(toggleMic)} data-dense>
              {call.audio ? "Mute" : "Unmute"}
            </button>
            <button type="button" aria-pressed={call.video} onClick={tap(() => void toggleCamera())} data-dense>
              {call.video ? "Camera off" : "Camera on"}
            </button>
            <button type="button" className="call-leave" onClick={tap(leaveCall)} data-dense>
              Leave call
            </button>
          </>
        ) : (
          <>
            <span className="tiny muted grow">
              {others.length > 0 ? `${others.length} in the call` : "Talk while you race"}
              {full ? ` (full, ${MAX_CALL_SIZE} max)` : ""}
            </span>
            <button type="button" onClick={tap(() => void joinCall(false))} disabled={call.status === "joining" || full} data-dense>
              {call.status === "joining" ? "Joining…" : "Join with mic"}
            </button>
            <button type="button" onClick={tap(() => void joinCall(true))} disabled={call.status === "joining" || full} data-dense>
              With camera
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function RemoteTile({ participant, stream, listening }: { participant: CallParticipant; stream: MediaStream | undefined; listening: boolean }) {
  // The picture shows once you're in the call too (you only receive while in it).
  const video = listening && participant.video && stream && stream.getVideoTracks().length > 0 ? stream : null;
  return <Tile name={participant.name} playerId={participant.playerId} video={video} audio={participant.audio} />;
}

function Tile({ name, playerId, video, audio, self = false }: { name: string; playerId: string | null; video: MediaStream | null; audio: boolean; self?: boolean }) {
  const ref = useStream<HTMLVideoElement>(video);
  return (
    <li className="call-tile" data-self={self}>
      {video ? <video ref={ref} autoPlay playsInline muted /> : <Avatar id={playerId} name={name} size="md" />}
      <span className="call-name">
        {name}
        {!audio && <span className="call-muted"> (muted)</span>}
      </span>
    </li>
  );
}
