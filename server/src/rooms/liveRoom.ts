/*
 * LIVE ROOM: one running room on the server.
 *
 * roomLogic.ts decides WHAT happens (pure functions). This class decides WHEN,
 * and makes sure things happen safely one after another:
 *
 * 1. ONE QUEUE PER ROOM
 *    Every action for a room (join, submit, start, a timer firing...) goes
 *    through `run()`, which waits for the previous action to finish first.
 *    Some actions wait for scrambles (async). Without the queue, a submit could
 *    sneak in while "start next set" is waiting, and one of them would
 *    overwrite the other. With the queue, two actions can never interleave.
 *
 * 2. TIMERS THAT CAN'T SKIP A SOLVE
 *    Deadlines (review screen ends, time limit, 30 s reconnect, empty room) are
 *    stored IN the room state, not in timers. The one timer per room is only a
 *    reminder: "something may be due, check now". When it fires, `processDue()`
 *    looks at the CURRENT state and does only what is really due. So a timer
 *    left over from an earlier phase does nothing: the phase it was set for has
 *    moved on, and its deadline is no longer in the state. A room that is
 *    deleted clears its timers.
 *
 * 3. AT MOST ONE BROADCAST EVERY 50 ms
 *    `commit()` saves a new state; the full snapshot goes out a moment later.
 *    If 50 players submit at once, clients get 1-2 snapshots, not 50.
 *
 * 4. SCRAMBLES ARE READY BEFORE THEY'RE NEEDED
 *    While a set is played, the next set's scrambles are made in the
 *    background. They are never sent to clients until their solve starts.
 */

import { randomUUID } from "node:crypto";
import {
  CHAT_HISTORY_LENGTH,
  type ChatMessage,
  type CubeEventId,
  type RoomSettings,
  type RoomSnapshot,
  type Scramble,
} from "@cube-racing/shared";
import { solvesPerSet } from "../match/scoring";
import type { MatchTiming } from "../match/types";
import { RateLimiter } from "../rateLimit";
import { chatNotices } from "./chatNotices";
import {
  autoStart,
  autoStartDue,
  needsNextSet,
  nextDeadline,
  shouldDeleteRoom,
  startNextSet,
  tickRoom,
  toSnapshot,
} from "./roomLogic";
import type { ServerRoom } from "./types";

export interface LiveRoomDeps {
  /** Sends a snapshot to everyone in the room. */
  broadcast: (snapshot: RoomSnapshot) => void;
  /** Makes the scrambles for one set (may be slow, may fail). */
  makeScrambles: (cubeEvent: CubeEventId, count: number) => Promise<Scramble[]>;
  /** Called once when the room is deleted. */
  onDelete: (code: string) => void;
  log: (code: string, message: string) => void;
  timing: MatchTiming;
  broadcastIntervalMs: number;
  /** Sends one new chat line to everyone in the room (right away, not batched). */
  sendChat?: (message: ChatMessage) => void;
  /** Called after every saved change (used to keep the database up to date). */
  onCommit?: (before: ServerRoom, next: ServerRoom) => void;
}

/** The chat of a room restored after a restart. */
export interface RestoredChat {
  log: ChatMessage[];
  count: number;
}

/** If making scrambles failed, wait this long before trying again. */
const SCRAMBLE_RETRY_MS = 2_000;

export class LiveRoom {
  readonly code: string;
  private current: ServerRoom;
  private isDeleted = false;

  private queue: Promise<unknown> = Promise.resolve();
  private wakeUpTimer: NodeJS.Timeout | null = null;
  private notBefore = 0; // after a scramble failure: don't retry before this time

  private broadcastTimer: NodeJS.Timeout | null = null;
  private lastBroadcastAt = 0;

  /** Scrambles being made in the background for the next set. */
  private upcoming: { key: string; scrambles: Promise<Scramble[]> } | null = null;

  /**
   * The room chat: the last 100 lines. Kept here, outside the synced room state,
   * so chat never makes the (frequent) room snapshots bigger.
   */
  private chatLog: ChatMessage[] = [];
  private chatCount = 0;

  /**
   * Wrong PINs for this room: 10, then one more every 6 seconds. Private rooms
   * are listed with their code, so this stops anyone from trying all 10,000 PINs.
   */
  readonly wrongPins = new RateLimiter(10, 1 / 6);

  constructor(
    initial: ServerRoom,
    private readonly deps: LiveRoomDeps,
    chat?: RestoredChat,
  ) {
    this.code = initial.code;
    this.current = initial;
    if (chat) {
      this.chatLog = chat.log.slice(-CHAT_HISTORY_LENGTH);
      this.chatCount = chat.count;
    }
    this.prepareScrambles();
    this.scheduleBroadcast();
  }

  /** The latest state. Read it inside run() to be sure it doesn't change under you. */
  get state(): ServerRoom {
    return this.current;
  }

  get deleted(): boolean {
    return this.isDeleted;
  }

  get timing(): MatchTiming {
    return this.deps.timing;
  }

  snapshot(): RoomSnapshot {
    return toSnapshot(this.current, Date.now());
  }

  /** Everything needed to restore this room after a restart. */
  saveable(): { room: ServerRoom; chat: ChatMessage[]; chatCount: number } {
    return { room: this.current, chat: [...this.chatLog], chatCount: this.chatCount };
  }

  /**
   * Runs `action` after every earlier action for this room has finished.
   * Before the action, anything that is due (time limits, review ending...)
   * is applied first, so the action always sees an up-to-date room.
   */
  run<T>(action: () => T | Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      if (!this.isDeleted) this.catchUp();
      try {
        return await action();
      } finally {
        this.afterAction();
      }
    });
    this.queue = result.catch(() => {}); // one failed action must not block the queue
    return result;
  }

  /**
   * Saves a new state. If it changed, a snapshot will be broadcast soon.
   * Refuses a state built from an old copy of the room (it would undo a newer change).
   */
  commit(next: ServerRoom): void {
    if (next === this.current || this.isDeleted) return;
    if (next.version <= this.current.version) {
      throw new Error(`Room ${this.code}: tried to save an outdated copy of the room`);
    }
    const before = this.current;
    this.current = next;
    this.scheduleBroadcast();
    this.deps.onCommit?.(before, next);

    if (next.match?.phase === "match_over" && before.match?.phase !== "match_over") {
      const winners = next.match.winnerIds.map((id) => next.players.find((p) => p.publicId === id)?.nickname ?? id);
      this.deps.log(this.code, `match over, winner: ${winners.join(" & ") || "nobody"}`);
    }

    // "Anu joined the room", "Nomin submitted 9.12", "Nomin wins set 2"...
    for (const notice of chatNotices(before, next)) {
      this.addChat("system", notice);
    }
  }

  /** The recent chat, oldest first (sent to someone who joins or comes back). */
  chatHistory(): ChatMessage[] {
    return [...this.chatLog];
  }

  /** Adds a chat line and sends it to everyone in the room right away. */
  addChat(
    kind: ChatMessage["kind"],
    text: string,
    sender?: { name: string; publicId: string },
    targetId: string | null = null,
  ): ChatMessage | null {
    if (this.isDeleted) return null;
    const message: ChatMessage = {
      id: `${Date.now().toString(36)}-${(this.chatCount++).toString(36)}`,
      at: Date.now(),
      kind,
      name: sender?.name ?? null,
      senderId: sender?.publicId ?? null,
      targetId,
      text,
    };
    this.chatLog.push(message);
    if (this.chatLog.length > CHAT_HISTORY_LENGTH) {
      this.chatLog.splice(0, this.chatLog.length - CHAT_HISTORY_LENGTH);
    }
    this.deps.sendChat?.(message);
    return message;
  }

  /**
   * Does whatever is due right now. Called when the wake-up timer fires and by
   * the once-a-second safety sweep. Must be called through run().
   */
  async processDue(): Promise<void> {
    if (this.isDeleted) return;
    const now = Date.now();

    if (shouldDeleteRoom(this.current, now)) {
      this.delete();
      this.deps.log(this.code, "deleted (empty for 10 minutes)");
      return;
    }

    // The lobby countdown (someone joined) is over: the race starts.
    if (autoStartDue(this.current, now) && now >= this.notBefore) {
      let scrambles: Scramble[];
      try {
        scrambles = await this.takeScrambles(this.current.settings);
      } catch (error) {
        this.deps.log(this.code, `could not make scrambles, retrying: ${String(error)}`);
        this.notBefore = Date.now() + SCRAMBLE_RETRY_MS;
        return;
      }
      const start = { matchId: randomUUID(), scrambles, timing: this.deps.timing };
      const result = autoStart(this.current, start, Date.now());
      if (result.ok) {
        this.commit(result.room);
        if (result.room.match) this.deps.log(this.code, "match started (someone joined), set 1 started");
      }
      return;
    }

    if (needsNextSet(this.current, now) && now >= this.notBefore) {
      let scrambles: Scramble[];
      try {
        scrambles = await this.takeScrambles(this.current.match!.settings);
      } catch (error) {
        // Never start solving without scrambles: stay on the set result and retry soon.
        this.deps.log(this.code, `could not make scrambles, retrying: ${String(error)}`);
        this.notBefore = Date.now() + SCRAMBLE_RETRY_MS;
        return;
      }
      const result = startNextSet(this.current, scrambles, Date.now());
      if (result.ok) {
        this.commit(result.room);
        this.deps.log(this.code, `set ${result.room.match!.setIndex + 1} started`);
      }
    }
  }

  /**
   * Gets the scrambles for a set: the ones prepared in the background if they
   * fit, otherwise new ones. Then starts preparing the batch after that.
   */
  async takeScrambles(settings: RoomSettings): Promise<Scramble[]> {
    const key = scrambleKey(settings);
    const prepared = this.upcoming?.key === key ? this.upcoming.scrambles : null;
    this.upcoming = null;

    let scrambles: Scramble[];
    try {
      scrambles = prepared ? await prepared : await this.makeScrambles(settings);
    } catch {
      scrambles = await this.makeScrambles(settings); // the prepared batch failed: one fresh try
    }
    this.prepareScrambles();
    return scrambles;
  }

  /** Deletes the room: stops it for good, and tells the server (which forgets its saved copy). */
  delete(): void {
    if (this.isDeleted) return;
    this.stop();
    this.deps.onDelete(this.code);
  }

  /**
   * Stops all its timers (server shutdown). Anything still queued sees `deleted`.
   * Unlike delete(), the room's saved copy stays, so it comes back after the restart.
   */
  stop(): void {
    this.isDeleted = true;
    if (this.wakeUpTimer) clearTimeout(this.wakeUpTimer);
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    this.wakeUpTimer = null;
    this.broadcastTimer = null;
    this.upcoming = null;
  }

  // -------------------------------------------------------------------------

  /** Applies everything that is due (pure tickRoom) before an action runs. */
  private catchUp(): void {
    const before = this.current;
    this.commit(tickRoom(before, Date.now()));
    for (const player of before.players) {
      if (!this.current.players.some((p) => p.playerId === player.playerId)) {
        this.deps.log(this.code, `${player.nickname} removed (did not reconnect within 30 s)`);
      }
    }
  }

  private afterAction(): void {
    if (this.isDeleted) return;
    this.prepareScrambles();
    this.scheduleWakeUp();
  }

  /** Sets the one wake-up timer for the next deadline in the state. */
  private scheduleWakeUp(): void {
    if (this.wakeUpTimer) clearTimeout(this.wakeUpTimer);
    this.wakeUpTimer = null;
    const deadline = nextDeadline(this.current);
    if (deadline === null) return;

    const at = Math.max(deadline, this.notBefore);
    this.wakeUpTimer = setTimeout(() => {
      this.wakeUpTimer = null;
      void this.run(() => this.processDue());
    }, Math.max(0, at - Date.now()));
  }

  private scheduleBroadcast(): void {
    if (this.broadcastTimer || this.isDeleted) return;
    const wait = Math.max(0, this.lastBroadcastAt + this.deps.broadcastIntervalMs - Date.now());
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this.lastBroadcastAt = Date.now();
      // Always the LATEST state, so a burst of changes becomes one snapshot.
      this.deps.broadcast(toSnapshot(this.current, Date.now()));
    }, wait);
  }

  /** Starts making the next set's scrambles in the background (if not already). */
  private prepareScrambles(): void {
    const settings = this.current.match?.settings ?? this.current.settings;
    const key = scrambleKey(settings);
    if (this.upcoming?.key === key) return;

    const scrambles = this.makeScrambles(settings);
    scrambles.catch(() => {}); // a failure is dealt with when the scrambles are taken
    this.upcoming = { key, scrambles };
  }

  private makeScrambles(settings: RoomSettings): Promise<Scramble[]> {
    return this.deps.makeScrambles(settings.cubeEvent, solvesPerSet(settings.format));
  }
}

function scrambleKey(settings: RoomSettings): string {
  return `${settings.cubeEvent}x${solvesPerSet(settings.format)}`;
}
