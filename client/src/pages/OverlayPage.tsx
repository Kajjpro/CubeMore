/*
 * /room/CODE/overlay: live standings for streamers, on a transparent page.
 * Add it in OBS as a Browser Source. It watches the room without taking a
 * seat, so the streamer's own browser tab can race as usual.
 *   ?pin=1234      needed for a private room (the Menu's link includes it)
 *   ?theme=light   light text colours (dark is the default)
 */

import { useEffect, useState } from "react";
import { ClientEvents, ServerEvents, type RoomSnapshot } from "@cube-racing/shared";
import { updateServerOffset } from "../clock";
import { EventIcon } from "../components/ui";
import { LiveClock, ranks, rowOrder } from "../components/Standings";
import { EVENT_SHORT, FORMAT_LABELS, nameList } from "../labels";
import { applyTheme } from "../prefs";
import { request, socket } from "../socket";
import { formatMark, formatResult } from "../time";

/** Watches a room: the latest snapshot, or an error to show. Reconnects by itself. */
function useWatchRoom(code: string, pin: string | undefined): { room: RoomSnapshot | null; error: string | null } {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let latestVersion = -1;
    const apply = (snapshot: RoomSnapshot) => {
      if (snapshot.code !== code || snapshot.version < latestVersion) return;
      latestVersion = snapshot.version;
      updateServerOffset(snapshot.serverTime);
      setRoom(snapshot);
    };
    const watch = async () => {
      const response = await request(ClientEvents.WATCH_ROOM, { code, ...(pin ? { pin } : {}) });
      if (response.ok) {
        setError(null);
        apply(response.room);
      } else {
        setError(response.error);
      }
    };
    socket.on(ServerEvents.ROOM_STATE, apply);
    socket.on("connect", watch);
    if (socket.connected) void watch();
    return () => {
      socket.off(ServerEvents.ROOM_STATE, apply);
      socket.off("connect", watch);
    };
  }, [code, pin]);

  return { room, error };
}

export function OverlayPage({ code }: { code: string }) {
  const params = new URLSearchParams(window.location.search);
  const pin = params.get("pin") ?? undefined;
  const theme = params.get("theme") === "light" ? "light" : "dark";
  const { room, error } = useWatchRoom(code, pin);

  // A transparent page, so only the panel shows on stream.
  useEffect(() => {
    document.documentElement.classList.add("overlay-mode");
    applyTheme(theme);
    return () => document.documentElement.classList.remove("overlay-mode");
  }, [theme]);

  if (error) return <main className="overlay-panel overlay-message">{error}</main>;
  if (!room) return <main className="overlay-panel overlay-message">Connecting to room {code}…</main>;
  return <OverlayView room={room} />;
}

/** The overlay panel for a room snapshot (also used by /dev/states). */
export function OverlayView({ room }: { room: RoomSnapshot }) {
  const { settings, match } = room;
  const bestOf = settings.winCondition === "unlimited" ? "Unlimited" : `Bo${settings.winCondition.slice(2)}`;
  return (
    <main className="overlay-panel">
      <header className="overlay-head">
        <EventIcon id={settings.cubeEvent} />
        <span className="overlay-title">
          {EVENT_SHORT[settings.cubeEvent]}, {FORMAT_LABELS[settings.format]}, {bestOf}
          {settings.scoring === "handicap" ? ", Handicap" : ""}
        </span>
        <span className="overlay-where">
          {!match
            ? "Lobby"
            : match.phase === "match_over"
              ? "Final"
              : `Set ${match.setIndex + 1}${match.solvesPerSet > 1 ? `, ${match.solveIndex + 1}/${match.solvesPerSet}` : ""}`}
        </span>
      </header>
      {!match ? <OverlayLobby room={room} /> : <OverlayStandings room={room} />}
    </main>
  );
}

function OverlayLobby({ room }: { room: RoomSnapshot }) {
  return (
    <p className="overlay-note">
      {room.players.length > 1 ? `${nameList(room.players.map((p) => p.nickname))} are getting ready` : "Waiting for racers"}
    </p>
  );
}

function OverlayStandings({ room }: { room: RoomSnapshot }) {
  const match = room.match!;
  const ids = rowOrder(room, match, null, false).filter((id) => match.roster.includes(id));
  const rankOf = ranks(ids, match.points);
  const players = new Map(room.players.map((p) => [p.id, p]));
  const hasAverage = match.solvesPerSet > 1;
  const winners = match.phase === "match_over" ? match.winnerIds.map((id) => players.get(id)?.nickname ?? "?") : [];

  return (
    <>
      {winners.length > 0 && <p className="overlay-note">{nameList(winners)} {winners.length > 1 ? "win" : "wins"} the match</p>}
      <ol className="overlay-rows">
        {ids.map((id) => {
          const player = players.get(id);
          const result = match.results[id]?.[match.solveIndex] ?? null;
          const solving = match.phase === "solving" && !result && player?.timerStatus === "solving" && player.solvingSince !== null;
          return (
            <li key={id} className={winners.length && match.winnerIds.includes(id) ? "winner" : ""}>
              <span className="rank">{rankOf.get(id)}</span>
              <span className="name">{player?.nickname ?? "Left"}</span>
              <span className="now">
                {result ? (
                  <span className={result.penalty === "DNF" ? "t-red" : ""}>{formatResult(result)}</span>
                ) : solving ? (
                  <LiveClock since={player!.solvingSince!} />
                ) : (
                  <span className="muted">–</span>
                )}
              </span>
              {hasAverage && <span className="avg">{formatMark(match.standings[id]?.result)}</span>}
              <span className="pts">{match.points[id] ?? 0}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
