import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  AckResponse,
  ClientRequests,
  ClientToServerEvents,
  ServerToClientEvents,
} from "@cube-racing/shared";

/**
 * The ONE connection to the server, shared by the whole app.
 * With no URL, it connects to the same address the page came from, and
 * Vite forwards it to the Node server (see vite.config.ts).
 * If the connection drops, Socket.IO keeps retrying automatically.
 */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();

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
