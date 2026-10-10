import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CHAT_MAX_LENGTH, type ChatMessage } from "@cube-racing/shared";
import { Icon, playerColor } from "./ui";

interface Props {
  messages: ChatMessage[];
  youId: string | null;
  /** How many people are connected right now. */
  online: number;
  connected: boolean;
  /** False while the chat sits in a hidden tab. */
  active?: boolean;
  /** Returns an error to show, or null when sent. */
  onSend: (text: string) => Promise<string | null>;
  /** The voice and video call, above the messages. */
  call?: ReactNode;
}

/** "14:02" in the viewer's own time. */
function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * The room chat: a compact feed (player messages and system notices like
 * "Anu joined the room") and a slim input. Messages are plain text.
 */
export function ChatPanel({ messages, youId, online, connected, active = true, onSend, call }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const feed = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);

  // Follow new messages (and jump to the newest when the tab opens), unless you scrolled up to read older ones.
  useLayoutEffect(() => {
    const el = feed.current;
    if (el && active && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, active]);

  useEffect(() => {
    const el = feed.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  async function send(event: FormEvent): Promise<void> {
    event.preventDefault();
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    const problem = await onSend(message);
    setSending(false);
    setError(problem);
    if (!problem) {
      setText("");
      stickToBottom.current = true;
    }
  }

  return (
    <div className="chat">
      <div className="panel-head">
        <h3>Room Chat</h3>
        <span className="online">
          {online} online
        </span>
      </div>
      {call}

      <ol className="chat-feed" ref={feed} aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && <li className="chat-empty">No messages yet. Say hi!</li>}
        {messages.map((m) =>
          m.kind === "reaction" ? (
            <li key={m.id} className="chat-line chat-reaction">
              <time>{clock(m.at)}</time>
              <b className={m.senderId === youId ? "me" : ""} data-c={playerColor(m.senderId)}>
                {m.name}
              </b>
              <span className="chat-text">{m.text}</span>
            </li>
          ) : m.kind === "system" ? (
            <li key={m.id} className="chat-system">
              <span>{m.text}</span>
              <time>{clock(m.at)}</time>
            </li>
          ) : (
            <li key={m.id} className={`chat-line ${m.senderId === youId ? "mine" : ""}`}>
              <time>{clock(m.at)}</time>
              <b className={m.senderId === youId ? "me" : ""} data-c={playerColor(m.senderId)}>
                {m.name}
              </b>
              <span className="chat-text">{m.text}</span>
            </li>
          ),
        )}
      </ol>

      <form className="chat-input" onSubmit={send}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          // Escape leaves the chat, so the spacebar starts the timer again.
          onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={connected ? "Say something…" : "Reconnecting…"}
          disabled={!connected}
          aria-label="Chat message"
          enterKeyHint="send"
          autoComplete="off"
          data-dense
        />
        <button type="submit" className="send-button" disabled={!connected || sending || !text.trim()} aria-label="Send" data-dense>
          <Icon name="send" size={15} />
        </button>
      </form>
      {error && <p className="chat-error">{error}</p>}
    </div>
  );
}
