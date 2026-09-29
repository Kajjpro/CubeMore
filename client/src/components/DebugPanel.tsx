import { useEffect, useState } from "react";
import { ClientEvents, type RoomSnapshot } from "@cube-racing/shared";
import { serverOffset } from "../clock";
import { useOutbox } from "../outbox";
import { request, socket, useIsConnected } from "../socket";

/** Only shown with ?debug=1 in the URL. */
export const DEBUG = new URLSearchParams(window.location.search).get("debug") === "1";

/** Connection details for testing: connection, latency, snapshot version, outbox size. */
export function DebugPanel({ room }: { room: RoomSnapshot | null }) {
  const connected = useIsConnected();
  const outbox = useOutbox();
  const [latency, setLatency] = useState<number | null>(null);

  // Measure the round trip to the server every 2 seconds.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!socket.connected) return;
      const sent = performance.now();
      const response = await request(ClientEvents.PING, {});
      if (response.ok) setLatency(Math.round(performance.now() - sent));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="debug-panel">
      <div>connection: {connected ? `connected (${socket.io.engine?.transport.name})` : "disconnected"}</div>
      <div>latency: {latency === null ? "…" : `${latency} ms`}</div>
      <div>snapshot version: {room?.version ?? "–"}</div>
      <div>phase: {room?.match ? `${room.match.phase} (set ${room.match.setIndex + 1}, solve ${room.match.solveIndex + 1})` : "lobby"}</div>
      <div>outbox: {outbox.length} ({outbox.filter((e) => !e.confirmed).length} unconfirmed)</div>
      <div>clock offset: {serverOffset()} ms</div>
    </aside>
  );
}
