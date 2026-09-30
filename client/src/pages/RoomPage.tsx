import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ClientEvents, NICKNAME_MAX_LENGTH, PIN_LENGTH, type ClientRequests, type MatchSnapshot } from "@cube-racing/shared";
import { RoomView, type RoomActions } from "../components/RoomView";
import { navigate } from "../router";
import { request, useIsConnected } from "../socket";
import { loadIdentity, loadRoomPin, saveNickname, saveRoomPin } from "../storage";
import { useRoom } from "../useRoom";

/** /room/CODE. Asks for a nickname first if we don't have one saved. */
export function RoomPage({ code }: { code: string }) {
  const [nickname, setNickname] = useState(() => loadIdentity().nickname);
  if (!nickname) return <NicknameForm code={code} onDone={setNickname} />;
  return <Room code={code} nickname={nickname} />;
}

/**
 * The PIN of a private room: from an invite link (?pin=1234, then removed from
 * the address bar) or the one you used here before.
 */
function initialPin(code: string): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const fromLink = params.get("pin");
  if (fromLink) {
    params.delete("pin");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    return fromLink;
  }
  return loadRoomPin(code);
}

function Room({ code, nickname }: { code: string; nickname: string }) {
  const [pin, setPin] = useState<string | undefined>(() => initialPin(code));
  const { room, youId, joinError, needsPin, notice, chat, cubeMoves } = useRoom(code, nickname, pin);

  // Joined with a PIN: remember it for this room.
  useEffect(() => {
    if (room?.pin && pin === room.pin) saveRoomPin(code, pin);
  }, [room?.pin, pin, code]);
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
    async function withStarting(work: () => Promise<void>): Promise<void> {
      setStarting(true);
      await work();
      setStarting(false);
    }

    return {
      leave: async () => {
        await request(ClientEvents.LEAVE_ROOM, {});
        navigate("/");
      },
      start: () => void withStarting(() => send(ClientEvents.START_MATCH, {})),
      rematch: (settings = {}) => void withStarting(() => send(ClientEvents.REMATCH, { settings })),
      backToLobby: () => void send(ClientEvents.BACK_TO_LOBBY, {}),
      updateSettings: (settings, pin) => void send(ClientEvents.UPDATE_SETTINGS, { settings, ...(pin ? { pin } : {}) }),
      kick: (player) => void send(ClientEvents.KICK_PLAYER, { targetId: player.id }),
      skip: (player) => void send(ClientEvents.SKIP_PLAYER, { targetId: player.id }),
      endMatch: () => void send(ClientEvents.END_MATCH, {}),
      changePenalty: (solveIndex, penalty) => {
        const match = matchRef.current;
        if (match) void send(ClientEvents.CHANGE_PENALTY, { matchId: match.matchId, setIndex: match.setIndex, solveIndex, penalty });
      },
      dismissError: () => setError(null),
      react: (targetId, emoji) => void request(ClientEvents.REACT, { targetId, emoji }),
      sendChat: async (text) => {
        const response = await request(ClientEvents.SEND_CHAT, { text });
        return response.ok ? null : response.error;
      },
    };
  }, []);

  if (needsPin) return <PinForm code={code} error={pin ? joinError : null} onSubmit={setPin} />;
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
      chat={chat}
      cubeMoves={cubeMoves}
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

/** A private room: ask for its PIN. */
export function PinForm(props: { code: string; error: string | null; onSubmit: (pin: string) => void }) {
  const [value, setValue] = useState("");

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (value.length === PIN_LENGTH) props.onSubmit(value);
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Private room</h1>
      </div>
      <p className="intro">
        Room <span className="mono">{props.code}</span> is private. Enter its {PIN_LENGTH}-digit PIN.
      </p>
      {props.error && <p className="banner banner-error">{props.error}</p>}
      <form className="field" onSubmit={submit} style={{ gap: 12 }}>
        <label className="field">
          <span className="field-label">PIN</span>
          <input
            className="pin-input"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="0000"
            autoFocus
          />
        </label>
        <button className="primary" type="submit" disabled={value.length !== PIN_LENGTH}>
          Join
        </button>
        <button type="button" className="quiet" onClick={() => navigate("/")}>
          Back to home
        </button>
      </form>
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
