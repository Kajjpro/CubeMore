/*
 * VOICE AND VIDEO IN A ROOM (WebRTC, browser to browser).
 *
 * The server only passes the connection messages between the browsers in the
 * call (offers, answers, network candidates) and keeps the list of who's in
 * it; the sound and the picture go straight between the players.
 */

/** At most this many people in one room's call (each browser sends to every other one). */
export const MAX_CALL_SIZE = 8;

export interface CallParticipant {
  /** This connection's id in the call (one per browser tab). */
  peerId: string;
  /** The player's public id (for their name and colour). */
  playerId: string;
  name: string;
  audio: boolean;
  video: boolean;
}

/** A description (offer / answer) or a network candidate, between two peers. */
export interface CallSignal {
  description?: { type: "offer" | "answer"; sdp: string };
  candidate?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } | null;
}

/** How browsers find a way to reach each other (STUN, and TURN when it's set up). */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
