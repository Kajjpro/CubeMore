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
 */

import { useSyncExternalStore } from "react";
import { ClientEvents, ServerEvents, type CallParticipant, type CallSignal, type IceServer } from "@cube-racing/shared";
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
}

const OFF: CallView = { status: "off", error: null, audio: true, video: false, peerId: null, participants: [], streams: {}, localVideo: null };
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
  const peer: Peer = { pc, polite: (view.peerId ?? "") < peerId, makingOffer: false, ignoreOffer: false };
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
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") pc.restartIce();
  };
  // Send them what we have.
  if (localStream) for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  return peer;
}

function closePeer(peerId: string): void {
  peers.get(peerId)?.pc.close();
  peers.delete(peerId);
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

const CAMERA: MediaTrackConstraints = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 }, facingMode: "user" };

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
}

/** Joins the room's call: asks for the mic (and camera when `video`). */
export async function joinCall(video: boolean): Promise<void> {
  if (view.status !== "off") return;
  set({ status: "joining", error: null });
  try {
    const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? CAMERA : false });
    localStream = media;
    micTrack = media.getAudioTracks()[0] ?? null;
    cameraTrack = media.getVideoTracks()[0] ?? null;
  } catch (error) {
    set({ status: "off", error: mediaError(error) });
    return;
  }
  const answer = await request(ClientEvents.CALL_JOIN, { audio: true, video: !!cameraTrack });
  if (!answer.ok) {
    stopEverything();
    set({ status: "off", error: answer.error });
    return;
  }
  iceServers = answer.iceServers;
  set({ status: "on", peerId: answer.peerId, audio: true, video: !!cameraTrack, localVideo: cameraTrack ? new MediaStream([cameraTrack]) : null });
  onState({ participants: answer.participants });
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
  void request(ClientEvents.CALL_MEDIA, { audio: micTrack.enabled, video: view.video });
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
      const media = await navigator.mediaDevices.getUserMedia({ video: CAMERA });
      cameraTrack = media.getVideoTracks()[0];
    } catch (error) {
      set({ error: mediaError(error) });
      return;
    }
    localStream.addTrack(cameraTrack);
    for (const { pc } of peers.values()) pc.addTrack(cameraTrack, localStream);
    set({ video: true, localVideo: new MediaStream([cameraTrack]), error: null });
  }
  void request(ClientEvents.CALL_MEDIA, { audio: view.audio, video: view.video });
}

/** Leaving the room: leave its call, and forget its list. */
export function resetCall(): void {
  leaveCall();
  set(OFF);
}
