/*
 * VOICE AND VIDEO CALLS: who is in each room's call (pure bookkeeping).
 *
 * One entry per browser tab (its socket id is its peer id in the call). The
 * socket layer relays the WebRTC messages between peers of the same call and
 * sends the list to the room whenever it changes.
 */

import { MAX_CALL_SIZE, type CallParticipant } from "@cube-racing/shared";

export class CallRegistry {
  private calls = new Map<string, Map<string, CallParticipant>>();

  participants(roomCode: string): CallParticipant[] {
    return [...(this.calls.get(roomCode)?.values() ?? [])];
  }

  /** Adds (or updates) a peer; false when the call is full. */
  join(roomCode: string, participant: CallParticipant): boolean {
    let call = this.calls.get(roomCode);
    if (!call) this.calls.set(roomCode, (call = new Map()));
    if (!call.has(participant.peerId) && call.size >= MAX_CALL_SIZE) return false;
    call.set(participant.peerId, participant);
    return true;
  }

  /** Mic / camera on or off. False when the peer isn't in the call. */
  setMedia(roomCode: string, peerId: string, audio: boolean, video: boolean): boolean {
    const peer = this.calls.get(roomCode)?.get(peerId);
    if (!peer) return false;
    peer.audio = audio;
    peer.video = video;
    return true;
  }

  /** Removes a peer; true when they were in the call. */
  leave(roomCode: string, peerId: string): boolean {
    const call = this.calls.get(roomCode);
    if (!call?.delete(peerId)) return false;
    if (call.size === 0) this.calls.delete(roomCode);
    return true;
  }

  /** Both peers are in this room's call (messages are only passed between them). */
  together(roomCode: string, a: string, b: string): boolean {
    const call = this.calls.get(roomCode);
    return Boolean(call?.has(a) && call.has(b));
  }
}
