// Remembers who you are (playerId + nickname) in localStorage, so the server
// recognises you after a page refresh.
//
// TESTING TIP: every tab in the same browser shares localStorage, which means
// every tab would be the SAME player. Add ?profile=2 (or any name) to the URL
// to give that tab its own separate identity, e.g.
//   http://localhost:5173/?profile=2
// The profile is remembered for that tab (sessionStorage), so it survives
// page changes and refreshes.

interface Identity {
  playerId: string;
  nickname: string;
}

function getProfile(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("profile");
  if (fromUrl) {
    sessionStorage.setItem("cube-racing:profile", fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem("cube-racing:profile");
}

const profile = getProfile();

/** A localStorage key that is separate for each ?profile= (so test players don't share data). */
export function profileKey(name: string): string {
  return profile ? `cube-racing:${name}:${profile}` : `cube-racing:${name}`;
}

const STORAGE_KEY = profileKey("identity");

export function loadIdentity(): Identity {
  let saved: Partial<Identity> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    // Broken data in storage: start fresh.
  }

  const identity: Identity = {
    playerId: typeof saved.playerId === "string" ? saved.playerId : makeUuid(),
    nickname: typeof saved.nickname === "string" ? saved.nickname : "",
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function saveNickname(nickname: string): void {
  const identity = loadIdentity();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...identity, nickname }));
}

/**
 * A random UUID (v4). We don't use crypto.randomUUID() because browsers only
 * allow it on https or localhost, and phones testing over your Wi-Fi use plain http.
 */
function makeUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
