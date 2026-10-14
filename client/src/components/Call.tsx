/*
 * The room's voice and video call, on screen:
 *   CallBar    a bar under the room header, always in sight (it only fades
 *              while you solve): who's in the call and who is talking, and
 *              one tap to join, mute, turn the camera on, talk to your team
 *              only, pick the microphone or leave. M mutes and unmutes.
 *   CallAudio  the other players' voices: always mounted in the room, so you
 *              keep hearing them while racing.
 */

import { useEffect, useRef, useState } from "react";
import { MAX_CALL_SIZE, TEAM_NAMES, type CallParticipant, type TeamId } from "@cube-racing/shared";
import {
  callsSupported,
  chooseMic,
  joinCall,
  leaveCall,
  setCallTeams,
  toggleCamera,
  toggleMic,
  toggleSilenced,
  toggleTeamOnly,
  useCall,
  useSpeaking,
  type CallView,
} from "../call/call";
import { Avatar, Icon } from "./ui";

/** /dev/states: a call in some state, and who is talking. */
export interface CallDemo {
  call?: Partial<CallView>;
  speaking?: Set<string>;
}

const DEMO_OFF: CallView = {
  status: "off",
  error: null,
  audio: true,
  video: false,
  peerId: null,
  participants: [],
  streams: {},
  localVideo: null,
  teamOnly: false,
  mics: [],
  micId: null,
  silenced: {},
};

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
        <RemoteAudio key={peerId} stream={stream} muted={!!call.silenced[peerId]} />
      ))}
    </div>
  );
}

function RemoteAudio({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = useStream<HTMLAudioElement>(stream);
  return <audio ref={ref} autoPlay muted={muted} />;
}

/** Runs `action` and drops the focus: the spacebar must start the timer, not press this button again. */
const tap = (action: () => void) => (event: { currentTarget: HTMLElement }) => {
  action();
  event.currentTarget.blur();
};

/** M mutes and unmutes, unless you're typing (or solving: the bar is hidden then). */
function useMuteKey(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key !== "m" && event.key !== "M") return;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      toggleMic();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

export function CallBar(props: {
  youId: string | null;
  /** Team matches: everyone's team (for team talk and the tiles), else null. */
  teams: Record<string, TeamId> | null;
  /** Holding or solving: the bar is hidden and M does nothing. */
  focus: boolean;
  /** Only for /dev/states: a made-up call. */
  demo?: CallDemo;
}) {
  const liveCall = useCall();
  const liveSpeaking = useSpeaking();
  const call = props.demo ? { ...DEMO_OFF, ...props.demo.call } : liveCall;
  const speaking = props.demo?.speaking ?? liveSpeaking;
  const [picked, setPicked] = useState<string | null>(null);
  const [micsOpen, setMicsOpen] = useState(false);
  const inCall = call.status === "on";
  useMuteKey(inCall && !props.focus);

  const { teams, youId } = props;
  const demo = !!props.demo;
  useEffect(() => {
    if (!demo) setCallTeams(teams, youId);
  }, [teams, youId, demo]);
  const teamTalk = inCall && !!teams && !!youId && !!teams[youId];

  if (!callsSupported && !demo) return null;
  const me = call.participants.find((p) => p.peerId === call.peerId) ?? null;
  const others = call.participants.filter((p) => p.peerId !== call.peerId);
  const full = !inCall && call.participants.length >= MAX_CALL_SIZE;
  const anyVideo = (inCall && call.video) || others.some((p) => p.video);
  const pickedPeer = others.find((p) => p.peerId === picked) ?? null;

  return (
    <section className="call-bar" data-in-call={inCall} data-video={anyVideo} aria-label="Voice and video chat">
      <div className="call-row">
        {(inCall || others.length > 0) && (
          <ul className="call-people" aria-label="In the call">
            {inCall && me && (
              <Tile participant={me} name="You" video={call.localVideo} talking={speaking.has(me.peerId)} team={teams?.[me.playerId] ?? null} self />
            )}
            {others.map((p) => (
              <Tile
                key={p.peerId}
                participant={p}
                name={p.name}
                video={inCall && p.video ? (call.streams[p.peerId] ?? null) : null}
                talking={speaking.has(p.peerId)}
                silenced={!!call.silenced[p.peerId]}
                team={teams?.[p.playerId] ?? null}
                picked={picked === p.peerId}
                onPick={inCall ? () => setPicked(picked === p.peerId ? null : p.peerId) : undefined}
              />
            ))}
          </ul>
        )}

        {inCall ? (
          <div className="call-buttons" role="group" aria-label="Your mic and camera">
            <button
              type="button"
              className="call-button"
              data-off={!call.audio}
              aria-pressed={!call.audio}
              onClick={tap(toggleMic)}
              title={call.audio ? "Mute (M)" : "Unmute (M)"}
              aria-label={call.audio ? "Mute your mic" : "Unmute your mic"}
              data-dense
            >
              <Icon name={call.audio ? "mic" : "micOff"} size={17} />
              <span className="call-button-label">{call.audio ? "Mute" : "Unmute"}</span>
            </button>
            <button
              type="button"
              className="call-button"
              aria-pressed={call.video}
              onClick={tap(() => void toggleCamera())}
              title={call.video ? "Turn your camera off" : "Turn your camera on"}
              aria-label={call.video ? "Turn your camera off" : "Turn your camera on"}
              data-dense
            >
              <Icon name={call.video ? "video" : "videoOff"} size={17} />
              <span className="call-button-label">{call.video ? "Camera off" : "Camera"}</span>
            </button>
            {teamTalk && (
              <button
                type="button"
                className="call-button"
                aria-pressed={call.teamOnly}
                onClick={tap(toggleTeamOnly)}
                title={call.teamOnly ? "Only your team hears you. Tap to talk to everyone." : "Everyone hears you. Tap to talk to your team only."}
                aria-label={call.teamOnly ? "Only your team hears you. Talk to everyone" : "Everyone hears you. Talk to your team only"}
                data-dense
              >
                <Icon name="users" size={17} />
                <span className="call-button-label">{call.teamOnly ? "Team only" : "Everyone"}</span>
              </button>
            )}
            {call.mics.length > 1 && (
              <button
                type="button"
                className="call-button"
                aria-expanded={micsOpen}
                onClick={tap(() => setMicsOpen(!micsOpen))}
                title="Choose your microphone"
                aria-label="Choose your microphone"
                data-dense
              >
                <Icon name="sliders" size={17} />
              </button>
            )}
            <button type="button" className="call-button call-leave" onClick={tap(leaveCall)} title="Leave the call" aria-label="Leave the call" data-dense>
              <Icon name="hangUp" size={17} />
              <span className="call-button-label">Leave</span>
            </button>
          </div>
        ) : (
          <div className="call-join">
            <span className="call-join-text">
              <Icon name="mic" size={16} />
              <span>
                {others.length === 0 ? "Voice chat" : `${others.length} in voice chat`}
                {full && ` (full, ${MAX_CALL_SIZE} max)`}
              </span>
            </span>
            <button
              type="button"
              className={`call-button ${others.length > 0 ? "primary" : ""}`}
              onClick={tap(() => void joinCall(false))}
              disabled={call.status === "joining" || full}
              data-dense
            >
              {call.status === "joining" ? "Joining…" : "Join"}
            </button>
            <button
              type="button"
              className="call-button"
              onClick={tap(() => void joinCall(true))}
              disabled={call.status === "joining" || full}
              title="Join with your camera on"
              aria-label="Join with your camera on"
              data-dense
            >
              <Icon name="video" size={17} />
              <span className="call-button-label">With camera</span>
            </button>
          </div>
        )}
      </div>

      <div className="call-drops">
        {inCall && micsOpen && call.mics.length > 1 && (
          <label className="call-extra">
            <span className="tiny muted">Microphone</span>
            <select
              value={call.micId ?? ""}
              onChange={(event) => {
                void chooseMic(event.target.value);
                setMicsOpen(false);
              }}
            >
              {call.mics.map((mic) => (
                <option key={mic.id} value={mic.id}>
                  {mic.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {pickedPeer && (
          <div className="call-extra">
            <span className="tiny">{pickedPeer.name}</span>
            <button type="button" className="call-button" onClick={tap(() => toggleSilenced(pickedPeer.peerId))} data-dense>
              <Icon name={call.silenced[pickedPeer.peerId] ? "mic" : "volumeOff"} size={16} />
              {call.silenced[pickedPeer.peerId] ? "Hear again" : "Mute for me"}
            </button>
            <span className="tiny muted grow">Only you stop hearing them.</span>
            <button type="button" className="quiet" onClick={() => setPicked(null)} aria-label="Close" data-dense>
              <Icon name="x" size={16} />
            </button>
          </div>
        )}
        {call.teamOnly && teamTalk && youId && teams && (
          <p className="call-note call-team-note tiny">Only the {TEAM_NAMES[teams[youId]]} team hears you.</p>
        )}
        {call.error && <p className="call-note tiny error-text">{call.error}</p>}
      </div>
    </section>
  );
}

function Tile(props: {
  participant: CallParticipant;
  name: string;
  video: MediaStream | null;
  talking: boolean;
  team: TeamId | null;
  self?: boolean;
  silenced?: boolean;
  picked?: boolean;
  onPick?: () => void;
}) {
  const { participant: p } = props;
  const video = props.video && props.video.getVideoTracks().length > 0 ? props.video : null;
  const ref = useStream<HTMLVideoElement>(video);
  const state = [!p.audio && "muted", props.silenced && "muted for you", p.teamOnly && "talking to their team"].filter(Boolean).join(", ");
  const label = `${props.name}${props.talking ? ", talking" : ""}${state ? `, ${state}` : ""}`;
  const face = (
    <>
      <span className="call-face">
        {video ? <video ref={ref} autoPlay playsInline muted /> : <Avatar id={p.playerId} name={p.name} size="sm" />}
        {!p.audio && (
          <span className="call-badge">
            <Icon name="micOff" size={11} />
          </span>
        )}
        {props.silenced && p.audio && (
          <span className="call-badge">
            <Icon name="volumeOff" size={11} />
          </span>
        )}
        {props.team && <span className="team-swatch call-team" data-team={props.team} />}
      </span>
      <span className="call-name">{props.name}</span>
    </>
  );
  return (
    <li className="call-tile" data-talking={props.talking} data-self={!!props.self} data-video={!!video} title={label}>
      {props.onPick ? (
        <button type="button" className="call-tile-button" aria-pressed={props.picked} aria-label={label} onClick={props.onPick} data-dense>
          {face}
        </button>
      ) : (
        <span className="call-tile-button" role="img" aria-label={label}>
          {face}
        </span>
      )}
    </li>
  );
}
