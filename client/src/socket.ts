import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  SIGN_IN_REFUSED,
  type AckResponse,
  type ClientRequests,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@cube-racing/shared";
import { sessionToken } from "./auth";

/**
 * Where the game server is. Set VITE_SERVER_URL when the website and the server
 * are on different addresses (website on Vercel, server on Fly.io), e.g.
 *   VITE_SERVER_URL=https://cube-racing-khaliun.fly.dev
 * Empty = the same address the page came from (development, where Vite forwards
 * it to the Node server, and the one-service setup on Fly.io).
 */
const SERVER_URL: string | undefined = import.meta.env.VITE_SERVER_URL || undefined;

/** After the server refused our sign-in token: get a fresh one on the next try. */
let freshToken = false;

const options = {
  // Signed in: every (re)connect carries the current session token, so the
  // server knows who we are. Guests send nothing.
  auth: (callback: (data: object) => void) => {
    void sessionToken(freshToken).then((token) => {
      freshToken = false;
      callback(token ? { token } : {});
    });
  },
};

/**
 * The ONE connection to the server, shared by the whole app.
 * If the connection drops, Socket.IO keeps retrying automatically.
 */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = SERVER_URL ? io(SERVER_URL, options) : io(options);

// The server refused our sign-in token (usually: it had just expired). Socket.IO
// doesn't retry after a refusal by itself, so try again with a fresh token.
let refusals = 0;
socket.on("connect_error", (error) => {
  if (error.message !== SIGN_IN_REFUSED) return;
  refusals += 1;
  freshToken = true;
  setTimeout(() => socket.connect(), Math.min(10_000, 500 * refusals));
});
socket.on("connect", () => {
  refusals = 0;
});

/** Signed in or out: connect again, so the server sees the new identity (rooms rejoin by themselves). */
export function reconnectAsCurrentUser(): void {
  socket.disconnect();
  socket.connect();
}

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Sends a request to the server and waits for its answer.
 * Always resolves to { ok: true, ... } or { ok: false, error }, never throws,
 * so the caller can just show `error` to the user.
 *
 *   const response = await request(ClientEvents.START_MATCH, {});
 *   if (!response.ok) showError(response.error);
 */
export function request<Event extends keyof ClientRequests>(
  event: Event,
  payload: ClientRequests[Event]["payload"],
): Promise<AckResponse<ClientRequests[Event]["response"]>> {
  type Response = AckResponse<ClientRequests[Event]["response"]>;

  if (!socket.connected) {
    return Promise.resolve({
      ok: false,
      error: "Not connected to the server. Please wait a moment and try again.",
    });
  }

  // Socket.IO's types can't follow our generic `Event` here, so we use an
  // untyped view of the same socket. The function signature above keeps callers type-safe.
  const untypedSocket = socket as unknown as Socket;

  return new Promise((resolve) => {
    // timeout(): if the server doesn't answer in 5s, the callback gets an error.
    untypedSocket.timeout(REQUEST_TIMEOUT_MS).emit(event, payload, (error: Error | null, response: Response) => {
      if (error) {
        resolve({ ok: false, error: "The server did not answer. Please try again." });
      } else {
        resolve(response);
      }
    });
  });
}

/** True while the socket is connected. Re-renders when it changes. */
export function useIsConnected(): boolean {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    // The socket may have connected between the first render and now; we'd have missed that event.
    setConnected(socket.connected);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return connected;
}
