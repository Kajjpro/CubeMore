/*
 * ROOM PERSISTENCE: keeps the store up to date while rooms run.
 *
 * Racing never waits for the database. After every change to a room:
 *   - its history events (set finished, match over...) are written right away
 *   - its saved copy is refreshed at most every 0.5 s, always with the latest state
 * All writes for one room code go through one chain, so they happen in order
 * (a closed room's row is removed before a new room with the same code is saved).
 * If the database is down, a write fails with a log line and racing carries on.
 */

import type { LiveRoom } from "../rooms/liveRoom";
import type { ServerRoom } from "../rooms/types";
import { historyEvents } from "./history";
import type { PersistenceStore } from "./store";

const SAVE_EVERY_MS = 500;

interface RoomWrites {
  chain: Promise<void>;
  /** Waiting to save the room's copy. */
  timer: NodeJS.Timeout | null;
  /** A save is in the chain and hasn't started yet (it will save the latest state anyway). */
  saveQueued: boolean;
}

export class RoomPersistence {
  private rooms = new Map<string, RoomWrites>();

  constructor(
    private readonly store: PersistenceStore,
    private readonly log: (code: string, message: string) => void,
  ) {}

  /** A room changed (LiveRoom's onCommit). */
  changed(live: LiveRoom, before: ServerRoom, next: ServerRoom): void {
    for (const event of historyEvents(before, next, Date.now())) {
      this.enqueue(live.code, () => this.store.record(event));
    }
    this.saveSoon(live);
  }

  /** Something outside the room state changed (a chat line), or the room was just restored. */
  saveSoon(live: LiveRoom): void {
    const writes = this.writesFor(live.code);
    if (writes.timer || live.deleted) return;
    writes.timer = setTimeout(() => {
      writes.timer = null;
      this.queueSave(live);
    }, SAVE_EVERY_MS);
    writes.timer.unref?.();
  }

  /** Saves the room now; resolves once it's written (used on shutdown). */
  saveNow(live: LiveRoom): Promise<void> {
    const writes = this.writesFor(live.code);
    if (writes.timer) clearTimeout(writes.timer);
    writes.timer = null;
    this.queueSave(live);
    return writes.chain;
  }

  /** The room closed: forget its saved copy. */
  deleted(code: string): void {
    const writes = this.writesFor(code);
    if (writes.timer) clearTimeout(writes.timer);
    writes.timer = null;
    this.enqueue(code, () => this.store.removeRoom(code));
    // Once removed, forget the code (unless a new room with that code has started writing).
    const chain = writes.chain;
    void chain.then(() => {
      if (this.rooms.get(code) === writes && writes.chain === chain && !writes.timer && !writes.saveQueued) {
        this.rooms.delete(code);
      }
    });
  }

  // -------------------------------------------------------------------------

  private queueSave(live: LiveRoom): void {
    const writes = this.writesFor(live.code);
    if (writes.saveQueued) return;
    writes.saveQueued = true;
    this.enqueue(live.code, () => {
      writes.saveQueued = false;
      // A room deleted in the meantime must not be saved again.
      return live.deleted ? Promise.resolve() : this.store.saveRoom({ ...live.saveable(), savedAt: Date.now() });
    });
  }

  private enqueue(code: string, write: () => Promise<void>): void {
    const writes = this.writesFor(code);
    writes.chain = writes.chain.then(write).catch((error: unknown) => {
      this.log(code, `could not write to the database: ${String(error)}`);
    });
  }

  private writesFor(code: string): RoomWrites {
    let writes = this.rooms.get(code);
    if (!writes) {
      writes = { chain: Promise.resolve(), timer: null, saveQueued: false };
      this.rooms.set(code, writes);
    }
    return writes;
  }
}
