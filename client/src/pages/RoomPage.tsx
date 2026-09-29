import { useMemo, useRef, useState, type FormEvent } from "react";
import { ClientEvents, NICKNAME_MAX_LENGTH, type ClientRequests, type MatchSnapshot } from "@cube-racing/shared";
import { RoomView, type RoomActions } from "../components/RoomView";
import { navigate } from "../router";
import { request, useIsConnected } from "../socket";
import { loadIdentity, saveNickname } from "../storage";
import { useRoom } from "../useRoom";

/** /room/CODE. Asks for a nickname first if we don't have one saved. */
export function RoomPage({ code }: { code: string }) {
  const [nickname, setNickname] = useState(() => loadIdentity().nickname);
  if (!nickname) return <NicknameForm code={code} onDone={setNickname} />;
  return <Room code={code} nickname={nickname} />;
}

function Room({ code, nickname }: { code: string; nickname: string }) {
  const { room, youId, joinError, notice } = useRoom(code, nickname);
  const connected = useIsConnected();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // The latest match, read by changePenalty (the actions below are created once).
  const matchRef = useRef<MatchSnapshot | null>(null);
  matchRef.current = room?.match ?? null;

  const actions = useMemo<RoomActions>(() => {
    /** Sends a request; if the server says no, the reason appears in a slim banner. */
    async function send<Event extends keyof ClientRequests>(
      event: Event,
      payload: ClientRequests[Event]["payload"],
    ): Promise<void> {
      setError(null);
      const response = await request(event, payload);
      if (!response.ok) setError(response.error);
    }

    /** Start and Rematch make scrambles first, which can take a moment. */
    async function startWith(event: typeof ClientEvents.START_MATCH | typeof ClientEvents.REMATCH): Promise<void> {
      setStarting(true);
      await send(event, {});
      setStarting(false);
    }

    return {
      leave: async () => {
        await request(ClientEvents.LEAVE_ROOM, {});
        navigate("/");
      },
      start: () => void startWith(ClientEvents.START_MATCH),
      rematch: () => void startWith(ClientEvents.REMATCH),
      backToLobby: () => void send(ClientEvents.BACK_TO_LOBBY, {}),
      updateSettings: (settings) => void send(ClientEvents.UPDATE_SETTINGS, { settings }),
      kick: (player) => void send(ClientEvents.KICK_PLAYER, { targetId: player.id }),
      skip: (player) => void send(ClientEvents.SKIP_PLAYER, { targetId: player.id }),
      endMatch: () => void send(ClientEvents.END_MATCH, {}),
      changePenalty: (solveIndex, penalty) => {
        const match = matchRef.current;
        if (match) void send(ClientEvents.CHANGE_PENALTY, { matchId: match.matchId, setIndex: match.setIndex, solveIndex, penalty });
      },
      dismissError: () => setError(null),
    };
  }, []);

  if (joinError) return <JoinError code={code} error={joinError} />;

  if (!room) {
    return (
      <main className="page">
        <p className="muted">{connected ? `Joining room ${code}…` : "Connecting…"}</p>
      </main>
    );
  }

  return (
    <RoomView
      room={room}
      youId={youId}
      connected={connected}
      notice={notice}
      error={error}
      starting={starting}
      actions={actions}
    />
  );
}

/** "Room not found", "You were removed…": you can't be in this room. */
export function JoinError({ code, error }: { code: string; error: string }) {
  return (
    <main className="page">
      <div className="page-head">
        <h1>Room {code}</h1>
      </div>
      <p className="banner banner-error">{error}</p>
      <button type="button" className="primary" onClick={() => navigate("/")}>
        Back to home
      </button>
    </main>
  );
}

function NicknameForm({ code, onDone }: { code: string; onDone: (nickname: string) => void }) {
  const [nickname, setNickname] = useState("");

  function submit(event: FormEvent): void {
    event.preventDefault();
    const name = nickname.trim();
    if (!name) return;
    saveNickname(name);
    onDone(name);
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Join room {code}</h1>
      </div>
      <form className="field" onSubmit={submit} style={{ gap: 12 }}>
        <label className="field">
          <span className="field-label">Nickname</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            autoComplete="nickname"
            autoFocus
          />
        </label>
        <button className="primary" type="submit" disabled={!nickname.trim()}>
          Join
        </button>
      </form>
    </main>
  );
}
