/*
 * VOICE AND VIDEO IN A ROOM, browser to browser (WebRTC).
 *
 * Each browser in the call connects to every other one ("mesh", fine up to the
 * 8 people a call allows). The server only passes the connection messages
 * along (call:signal) and keeps the list of who's in the call (call:state).
 * Connections are set up with the "perfect negotiation" pattern: either side
 * may start, and when both do at once, the "polite" one gives way.
 *
 * Mic and camera are off until you join; joining asks the browser for the mic
 * (and the camera, if you turn it on).
 *
 * In a team match you can talk to your team only: your mic is then simply not
 * sent to the other team's browsers (replaceTrack(null)), so they can't hear it.
 * Who is talking right now is measured from the sound (useSpeaking).
 */

import { useSyncExternalStore } from "react";
import { ClientEvents, ServerEvents, type CallParticipant, type CallSignal, type IceServer, type TeamId } from "@cube-racing/shared";
import { request, socket } from "../socket";

export interface CallView {
  status: "off" | "joining" | "on";
  error: string | null;
  audio: boolean;
  video: boolean;
  /** Your own peer id while in the call. */
  peerId: string | null;
  /** Everyone in the room's call (you included), from the server. */
  participants: CallParticipant[];
  /** The sound and picture from each other peer. */
  streams: Record<string, MediaStream>;
  /** Your own camera picture (for your tile), or null. */
  localVideo: MediaStream | null;
  /** In a team match: your voice only goes to your team. */
  teamOnly: boolean;
  /** The microphones to choose from (known once the browser allowed one), and the one in use. */
  mics: { id: string; label: string }[];
  micId: string | null;
  /** The cameras to choose from, and the one picked (used whenever your camera is on). */
  cameras: { id: string; label: string }[];
  cameraId: string | null;
  /** Peers you muted for yourself only. */
  silenced: Record<string, true>;
}

const OFF: CallView = {
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
  cameras: [],
  cameraId: null,
  silenced: {},
};
let view: CallView = OFF;
const listeners = new Set<() => void>();
function set(next: Partial<CallView>): void {
  view = { ...view, ...next };
  listeners.forEach((l) => l());
}

export function useCall(): CallView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => view,
  );
}

/** True when this browser can make calls (every current browser, on https). */
export const callsSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== "undefined";

// ---------------------------------------------------------------------------
// Connections to the other peers

interface Peer {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  /** Where your mic goes to this peer (its track is null while they shouldn't hear you). */
  audioSender: RTCRtpSender | null;
}

const peers = new Map<string, Peer>();
let iceServers: IceServer[] = [];
let micTrack: MediaStreamTrack | null = null;
let cameraTrack: MediaStreamTrack | null = null;
/** Your mic and camera, as one stream (the tracks are added to every connection). */
let localStream: MediaStream | null = null;

const signal = (to: string, data: CallSignal) => void request(ClientEvents.CALL_SIGNAL, { to, ...data });

function peerFor(peerId: string): Peer {
  const existing = peers.get(peerId);
  if (existing) return existing;
  const pc = new RTCPeerConnection({ iceServers });
  // The one with the "smaller" id gives way when both start at once.
  const peer: Peer = { pc, polite: (view.peerId ?? "") < peerId, makingOffer: false, ignoreOffer: false, audioSender: null };
  peers.set(peerId, peer);

  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      if (pc.localDescription) signal(peerId, { description: pc.localDescription.toJSON() as CallSignal["description"] });
    } catch {
      // A newer negotiation took over.
    } finally {
      peer.makingOffer = false;
    }
  };
  pc.onicecandidate = ({ candidate }) => signal(peerId, { candidate: candidate ? (candidate.toJSON() as CallSignal["candidate"]) : null });
  pc.ontrack = ({ track, streams }) => {
    const stream = streams[0] ?? new MediaStream([track]);
    // A camera turned off removes its track: show the tile without the picture again.
    stream.onremovetrack = () => set({ streams: { ...view.streams } });
    track.onunmute = () => set({ streams: { ...view.streams } });
    set({ streams: { ...view.streams, [peerId]: stream } });
    if (track.kind === "audio") meter(peerId, stream);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") pc.restartIce();
  };
  // Send them what we have (your mic only if they may hear you).
  if (localStream) {
    for (const track of localStream.getTracks()) {
      const sender = pc.addTrack(track, localStream);
      if (track.kind === "audio") peer.audioSender = sender;
    }
  }
  if (peer.audioSender && !hears(peerId)) void peer.audioSender.replaceTrack(null).catch(() => {});
  return peer;
}

function closePeer(peerId: string): void {
  peers.get(peerId)?.pc.close();
  peers.delete(peerId);
  meter(peerId, null);
  if (view.streams[peerId]) {
    const streams = { ...view.streams };
    delete streams[peerId];
    set({ streams });
  }
}

async function onSignal(message: CallSignal & { from: string }): Promise<void> {
  if (view.status !== "on") return;
  const peer = peerFor(message.from);
  const { pc } = peer;
  try {
    if (message.description) {
      const collision = message.description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;
      await pc.setRemoteDescription(message.description);
      if (message.description.type === "offer") {
        await pc.setLocalDescription();
        if (pc.localDescription) signal(message.from, { description: pc.localDescription.toJSON() as CallSignal["description"] });
      }
    } else if (message.candidate !== undefined) {
      try {
        await pc.addIceCandidate(message.candidate ?? undefined);
      } catch (error) {
        if (!peer.ignoreOffer) throw error;
      }
    }
  } catch {
    // One bad message shouldn't end the call; the connection repairs itself.
  }
}

function onState({ participants }: { participants: CallParticipant[] }): void {
  set({ participants });
  if (view.status !== "on") return;
  const here = new Set(participants.map((p) => p.peerId));
  for (const peerId of [...peers.keys()]) if (!here.has(peerId)) closePeer(peerId);
  // Connect to everyone already in the call (they answer our offers).
  for (const p of participants) if (p.peerId !== view.peerId) peerFor(p.peerId);
  applyAudience();
}

socket.on(ServerEvents.CALL_STATE, onState);
socket.on(ServerEvents.CALL_SIGNAL, (message) => void onSignal(message));
// A dropped connection: the server took us out of the call.
socket.on("disconnect", () => {
  if (view.status === "off") return;
  stopEverything();
  set({ ...OFF, participants: view.participants, error: "The connection dropped, so you left the call. Join again when you're back." });
});

// ---------------------------------------------------------------------------
// Your mic and camera

const CAMERA: MediaTrackConstraints = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } };
const CAMERA_KEY = "cube-racing:call-camera";

/** The camera you picked last time if it's still there ("ideal": another one otherwise), else the front one. */
function cameraConstraints(deviceId = localStorage.getItem(CAMERA_KEY)): MediaTrackConstraints {
  return deviceId ? { ...CAMERA, deviceId: { ideal: deviceId } } : { ...CAMERA, facingMode: "user" };
}

function mediaError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "The browser wasn't allowed to use your microphone or camera. Allow it in the address bar, then try again.";
  if (name === "NotFoundError") return "No microphone or camera was found.";
  if (name === "NotReadableError") return "Your microphone or camera is being used by another app.";
  return "Couldn't start your microphone or camera.";
}

function stopEverything(): void {
  for (const peerId of [...peers.keys()]) closePeer(peerId);
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = micTrack = cameraTrack = null;
  stopMeters();
}

const MIC_KEY = "cube-racing:call-mic";
const VOICE = { echoCancellation: true, noiseSuppression: true };

/** The mic you picked last time, if it's still there; otherwise the default one. */
async function openMic(video: boolean): Promise<MediaStream> {
  const saved = localStorage.getItem(MIC_KEY);
  const ask = (audio: MediaTrackConstraints) => navigator.mediaDevices.getUserMedia({ audio, video: video ? cameraConstraints() : false });
  if (!saved) return ask(VOICE);
  return ask({ ...VOICE, deviceId: { exact: saved } }).catch((error: unknown) => {
    if (error instanceof Error && (error.name === "OverconstrainedError" || error.name === "NotFoundError")) return ask(VOICE);
    throw error;
  });
}

/** The microphones and cameras there are (their names are only known once the browser allowed them). */
async function refreshDevices(): Promise<void> {
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
  const list = (kind: MediaDeviceKind, name: string) =>
    devices
      .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== "communications")
      .map((d, i) => ({ id: d.deviceId, label: d.label || `${name} ${i + 1}` }));
  set({
    mics: list("audioinput", "Microphone"),
    micId: micTrack?.getSettings().deviceId ?? view.micId,
    cameras: list("videoinput", "Camera"),
    cameraId: cameraTrack?.getSettings().deviceId ?? localStorage.getItem(CAMERA_KEY) ?? view.cameraId,
  });
}
if (typeof navigator !== "undefined") navigator.mediaDevices?.addEventListener?.("devicechange", () => void (view.status === "on" && refreshDevices()));

/** Joins the room's call: asks for the mic (and camera when `video`). */
export async function joinCall(video: boolean): Promise<void> {
  if (view.status !== "off") return;
  set({ status: "joining", error: null });
  startMeters();
  try {
    const media = await openMic(video);
    localStream = media;
    micTrack = media.getAudioTracks()[0] ?? null;
    cameraTrack = media.getVideoTracks()[0] ?? null;
  } catch (error) {
    set({ status: "off", error: mediaError(error) });
    return;
  }
  const answer = await request(ClientEvents.CALL_JOIN, { audio: true, video: !!cameraTrack, teamOnly: false });
  if (!answer.ok) {
    stopEverything();
    set({ status: "off", error: answer.error });
    return;
  }
  iceServers = answer.iceServers;
  set({ status: "on", peerId: answer.peerId, audio: true, video: !!cameraTrack, localVideo: cameraTrack ? new MediaStream([cameraTrack]) : null, teamOnly: false });
  if (micTrack) meter(answer.peerId, new MediaStream([micTrack]));
  onState({ participants: answer.participants });
  void refreshDevices();
}

export function leaveCall(): void {
  if (view.status === "off") return;
  void request(ClientEvents.CALL_LEAVE, {});
  stopEverything();
  set({ ...OFF, participants: view.participants });
}

/** Mic on or off (the track stays, so turning it back on is instant). */
export function toggleMic(): void {
  if (!micTrack) return;
  micTrack.enabled = !micTrack.enabled;
  set({ audio: micTrack.enabled });
  sendMedia();
}

function sendMedia(): void {
  void request(ClientEvents.CALL_MEDIA, { audio: view.audio, video: view.video, teamOnly: view.teamOnly });
}

/** Use another microphone (remembered for next time); the call goes on. */
export async function chooseMic(deviceId: string): Promise<void> {
  if (view.status !== "on" || !localStream || deviceId === view.micId) return;
  let track: MediaStreamTrack;
  try {
    const media = await navigator.mediaDevices.getUserMedia({ audio: { ...VOICE, deviceId: { exact: deviceId } } });
    track = media.getAudioTracks()[0];
  } catch (error) {
    set({ error: mediaError(error) });
    return;
  }
  track.enabled = view.audio;
  const old = micTrack;
  if (old) {
    localStream.removeTrack(old);
    old.stop();
  }
  localStream.addTrack(track);
  micTrack = track;
  localStorage.setItem(MIC_KEY, deviceId);
  applyAudience();
  if (view.peerId) meter(view.peerId, new MediaStream([track]));
  set({ micId: deviceId, error: null });
}

// ---------------------------------------------------------------------------
// Team talk

let teamOf: Record<string, TeamId> | null = null;
let myPlayerId: string | null = null;

/**
 * The room tells the call who is on which team (null outside a team match).
 * Without teams, "team only" switches off by itself.
 */
export function setCallTeams(teams: Record<string, TeamId> | null, youId: string | null): void {
  teamOf = teams && youId && teams[youId] ? teams : null;
  myPlayerId = youId;
  if (!teamOf && view.teamOnly) {
    set({ teamOnly: false });
    if (view.status === "on") sendMedia();
  }
  applyAudience();
}

/** True while team talk is possible (you're in a team match). */
export function teamTalkPossible(): boolean {
  return teamOf !== null;
}

/** Talk to your team only, or to everyone. */
export function toggleTeamOnly(): void {
  if (view.status !== "on" || !teamOf) return;
  set({ teamOnly: !view.teamOnly });
  applyAudience();
  sendMedia();
}

/** May this peer hear you? */
function hears(peerId: string): boolean {
  if (!view.teamOnly || !teamOf || !myPlayerId) return true;
  const player = view.participants.find((p) => p.peerId === peerId)?.playerId;
  return !!player && teamOf[player] === teamOf[myPlayerId];
}

/** Sends your mic to exactly the peers who may hear it. */
function applyAudience(): void {
  for (const [peerId, peer] of peers) {
    if (!peer.audioSender) continue;
    const track = hears(peerId) ? micTrack : null;
    if (peer.audioSender.track !== track) void peer.audioSender.replaceTrack(track).catch(() => {});
  }
}

/** Mute someone for yourself only (they don't know), or hear them again. */
export function toggleSilenced(peerId: string): void {
  const silenced = { ...view.silenced };
  if (silenced[peerId]) delete silenced[peerId];
  else silenced[peerId] = true;
  set({ silenced });
}

// ---------------------------------------------------------------------------
// Who is talking: the loudness of each voice, measured a few times a second

let speaking = new Set<string>();
const speakingListeners = new Set<() => void>();
let audioContext: AudioContext | null = null;
let meterTimer: ReturnType<typeof setInterval> | null = null;
const meters = new Map<string, { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; data: Float32Array<ArrayBuffer>; loudAt: number }>();
/** Louder than this (RMS) counts as talking; it stays "talking" a moment after. */
const TALKING_LEVEL = 0.02;
const TALKING_HOLD_MS = 400;

/** The peer ids talking right now (your own included). */
export function useSpeaking(): Set<string> {
  return useSyncExternalStore(
    (l) => {
      speakingListeners.add(l);
      return () => speakingListeners.delete(l);
    },
    () => speaking,
  );
}

function startMeters(): void {
  if (typeof AudioContext === "undefined") return;
  // Made while joining (a tap), so the browser lets it run.
  audioContext ??= new AudioContext();
  void audioContext.resume().catch(() => {});
  meterTimer ??= setInterval(measure, 120);
}

function stopMeters(): void {
  for (const key of [...meters.keys()]) meter(key, null);
  if (meterTimer) clearInterval(meterTimer);
  meterTimer = null;
  if (speaking.size) {
    speaking = new Set();
    speakingListeners.forEach((l) => l());
  }
}

/** Listen to one voice (or stop, with null). */
function meter(key: string, stream: MediaStream | null): void {
  const old = meters.get(key);
  if (old) {
    old.source.disconnect();
    meters.delete(key);
  }
  if (!stream || !audioContext || stream.getAudioTracks().length === 0) return;
  try {
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    meters.set(key, { source, analyser, data: new Float32Array(analyser.fftSize), loudAt: 0 });
  } catch {
    // No meter for this one: they just never show as talking.
  }
}

function measure(): void {
  const now = performance.now();
  const next = new Set<string>();
  for (const [key, m] of meters) {
    m.analyser.getFloatTimeDomainData(m.data);
    let sum = 0;
    for (const x of m.data) sum += x * x;
    if (Math.sqrt(sum / m.data.length) > TALKING_LEVEL) m.loudAt = now;
    if (now - m.loudAt < TALKING_HOLD_MS) next.add(key);
  }
  // Your own voice doesn't count while you're muted.
  if (!view.audio && view.peerId) next.delete(view.peerId);
  if (next.size === speaking.size && [...next].every((k) => speaking.has(k))) return;
  speaking = next;
  speakingListeners.forEach((l) => l());
}

/** Camera on or off: the camera is really released when off (its light goes out). */
export async function toggleCamera(): Promise<void> {
  if (view.status !== "on" || !localStream) return;
  if (cameraTrack) {
    const track = cameraTrack;
    for (const { pc } of peers.values()) {
      const sender = pc.getSenders().find((s) => s.track === track);
      if (sender) pc.removeTrack(sender);
    }
    localStream.removeTrack(track);
    track.stop();
    cameraTrack = null;
    set({ video: false, localVideo: null });
  } else {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: cameraConstraints() });
      cameraTrack = media.getVideoTracks()[0];
    } catch (error) {
      set({ error: mediaError(error) });
      return;
    }
    localStream.addTrack(cameraTrack);
    for (const { pc } of peers.values()) pc.addTrack(cameraTrack, localStream);
    set({ video: true, localVideo: new MediaStream([cameraTrack]), error: null });
    // The cameras' names are known now that one is allowed.
    void refreshDevices();
  }
  sendMedia();
}

/** Use another camera (remembered for next time). With the camera on, the picture switches right away. */
export async function chooseCamera(deviceId: string): Promise<void> {
  if (view.status !== "on" || !localStream || deviceId === view.cameraId) return;
  localStorage.setItem(CAMERA_KEY, deviceId);
  if (!cameraTrack) {
    set({ cameraId: deviceId });
    return;
  }
  let track: MediaStreamTrack;
  try {
    const media = await navigator.mediaDevices.getUserMedia({ video: { ...CAMERA, deviceId: { exact: deviceId } } });
    track = media.getVideoTracks()[0];
  } catch (error) {
    set({ error: mediaError(error) });
    return;
  }
  const old = cameraTrack;
  // Same connections, new picture: no renegotiation needed.
  for (const { pc } of peers.values()) {
    const sender = pc.getSenders().find((s) => s.track === old);
    if (sender) void sender.replaceTrack(track).catch(() => {});
  }
  localStream.removeTrack(old);
  old.stop();
  localStream.addTrack(track);
  cameraTrack = track;
  set({ cameraId: deviceId, localVideo: new MediaStream([track]), error: null });
}

/** Leaving the room: leave its call, and forget its list. */
export function resetCall(): void {
  leaveCall();
  set(OFF);
}
