import { randomInt } from "node:crypto";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@cube-racing/shared";
import type { LiveRoom } from "./liveRoom";

/**
 * All rooms live here, in memory. Restarting the server deletes them all.
 * (That's also why the app must run as ONE server: a second server would
 * have its own, different rooms. See DEPLOY.md.)
 */
export class RoomStore {
  private rooms = new Map<string, LiveRoom>();

  get(code: string): LiveRoom | undefined {
    return this.rooms.get(code);
  }

  add(room: LiveRoom): void {
    this.rooms.set(room.code, room);
  }

  remove(code: string): void {
    this.rooms.delete(code);
  }

  all(): LiveRoom[] {
    return [...this.rooms.values()];
  }

  /** A random 6-character code that no existing room is using. */
  generateUniqueCode(): string {
    while (true) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
  }
}
