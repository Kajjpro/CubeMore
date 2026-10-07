// Who you race as, on the pages outside a room (home, event pages): your
// username once signed in, otherwise a nickname. And making a room as you.

import { useEffect, useState } from "react";
import { ClientEvents, NICKNAME_MAX_LENGTH, type RoomSettings } from "@cube-racing/shared";
import { useAccount } from "../auth";
import { getPrefs } from "../prefs";
import { navigate } from "../router";
import { request } from "../socket";
import { loadIdentity, saveNickname } from "../storage";
import { GuestHint } from "./Account";
import { Avatar } from "./ui";

export interface Racer {
  nickname: string;
  setNickname: (nickname: string) => void;
  /** Your username when signed in, else null (then the nickname box shows). */
  accountName: string | null;
  showGuestHint: boolean;
  publicId: string | null;
  error: string | null;
  setError: (error: string | null) => void;
  /** Your name for a room, or null (and an error, the nickname box focused) if there's none yet. */
  check: () => string | null;
  creating: boolean;
  /** Makes a room (it opens in setup, only you in it) and goes there. */
  createRoom: (settings?: Partial<RoomSettings>) => Promise<void>;
}

export function useRacer(demoNickname?: string): Racer {
  const [nickname, setNickname] = useState(() => demoNickname ?? loadIdentity().nickname);
  const account = useAccount();
  const accountName = account.signedIn ? account.username : null;
  const publicId = usePublicId(account.playerId ?? loadIdentity().playerId);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function check(): string | null {
    if (accountName) {
      setError(null);
      return accountName;
    }
    const name = nickname.trim();
    if (!name) {
      setError("Enter a nickname first.");
      document.getElementById("racer-nickname")?.focus();
      return null;
    }
    setError(null);
    saveNickname(name);
    return name;
  }

  async function createRoom(settings: Partial<RoomSettings> = {}): Promise<void> {
    if (creating) return;
    const name = check();
    if (!name) return;
    setCreating(true);
    const response = await request(ClientEvents.CREATE_ROOM, {
      playerId: loadIdentity().playerId,
      nickname: name,
      settings,
      cubeEvent: getPrefs().mixedEvent,
    });
    setCreating(false);
    if (response.ok) navigate(`/room/${response.room.code}`);
    else setError(response.error);
  }

  return {
    nickname,
    setNickname,
    accountName,
    showGuestHint: account.loaded && !account.signedIn,
    publicId,
    error,
    setError,
    check,
    creating,
    createRoom,
  };
}

/** "Racing as": your avatar and username, or a nickname box (with the guest hint under it). */
export function YouBar({ racer }: { racer: Racer }) {
  return (
    <>
      <div className="you-bar">
        <Avatar id={racer.publicId} name={racer.accountName ?? (racer.nickname || "?")} size="sm" />
        {racer.accountName ? (
          <span className="you-bar-name">
            Racing as <b>{racer.accountName}</b>
          </span>
        ) : (
          <label className="you-bar-field">
            <span className="you-bar-label">Racing as</span>
            <input
              id="racer-nickname"
              value={racer.nickname}
              onChange={(e) => racer.setNickname(e.target.value)}
              maxLength={NICKNAME_MAX_LENGTH}
              placeholder="Your nickname"
              autoComplete="nickname"
            />
          </label>
        )}
      </div>
      {racer.showGuestHint && <GuestHint />}
      {racer.error && <p className="banner banner-error">{racer.error}</p>}
    </>
  );
}

/**
 * Your public id, worked out like the server does (the first 12 hex digits of
 * SHA-256 of your secret id), so your avatar has the same colour here as in a
 * room. null where Web Crypto isn't available (plain http on a local network).
 */
function usePublicId(playerId: string): string | null {
  const [publicId, setPublicId] = useState<string | null>(null);
  useEffect(() => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return;
    let cancelled = false;
    void subtle.digest("SHA-256", new TextEncoder().encode(playerId)).then((hash) => {
      const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (!cancelled) setPublicId(hex.slice(0, 12));
    });
    return () => {
      cancelled = true;
    };
  }, [playerId]);
  return publicId;
}
