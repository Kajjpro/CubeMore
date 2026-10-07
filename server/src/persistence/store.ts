/*
 * PERSISTENCE STORE: rooms and match history in Postgres (e.g. Neon).
 *
 *   live_rooms     the latest copy of every open room (state + chat), so rooms
 *                  survive a restart or deploy. Deleted when the room closes.
 *   matches        one row per match: settings, when, how it ended, winners
 *   match_players  who played in each match, with their nickname and points
 *   match_sets     each finished set: winners, standings, paces
 *   solves         every solve of every finished set, with its scramble
 *
 * Players are kept by their PUBLIC id. The tables are created on first start.
 */

import type { Pool, PoolClient } from "pg";
import type { ChatMessage, LeaderboardRow, Penalty, Replay, SetStanding, WeeklyRow } from "@cube-racing/shared";
import { scoredTime } from "../match/scoring";
import { rankWeekly } from "../weekly/results";
import type { ServerRoom } from "../rooms/types";
import type { HistoryEvent } from "./history";

/** A room as it was saved: its state and its chat. */
export interface SavedRoom {
  room: ServerRoom;
  chat: ChatMessage[];
  chatCount: number;
  savedAt: number;
}

export interface PersistenceStore {
  saveRoom(saved: SavedRoom): Promise<void>;
  removeRoom(code: string): Promise<void>;
  loadRooms(): Promise<SavedRoom[]>;
  record(event: HistoryEvent): Promise<void>;
}

/** Reading the history back: weekly results, the verified leaderboard, replays. */
export interface HistoryReader {
  weeklyResults(weeklyId: string): Promise<WeeklyRow[]>;
  /** Each player's best verified single since `since` (ms), best first. */
  leaderboard(cubeEvent: string, since: number, limit: number): Promise<LeaderboardRow[]>;
  /** "matchId/setIndex/solveIndex/publicId" -> every move of that verified solve. */
  replay(id: string): Promise<Replay | null>;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS live_rooms (
    code TEXT PRIMARY KEY,
    state JSONB NOT NULL,
    chat JSONB NOT NULL,
    chat_count INTEGER NOT NULL,
    saved_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    room_name TEXT NOT NULL,
    cube_event TEXT NOT NULL,
    format TEXT NOT NULL,
    win_condition TEXT NOT NULL,
    scoring TEXT NOT NULL,
    started_at BIGINT NOT NULL,
    ended_at BIGINT,
    status TEXT NOT NULL DEFAULT 'running',
    winner_ids JSONB NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS match_players (
    match_id TEXT NOT NULL,
    public_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, public_id)
  );
  CREATE TABLE IF NOT EXISTS match_sets (
    match_id TEXT NOT NULL,
    set_index INTEGER NOT NULL,
    winner_ids JSONB NOT NULL,
    standings JSONB NOT NULL,
    paces JSONB,
    finished_at BIGINT NOT NULL,
    PRIMARY KEY (match_id, set_index)
  );
  CREATE TABLE IF NOT EXISTS solves (
    match_id TEXT NOT NULL,
    set_index INTEGER NOT NULL,
    solve_index INTEGER NOT NULL,
    public_id TEXT NOT NULL,
    cube_event TEXT NOT NULL,
    scramble TEXT,
    time_ms INTEGER NOT NULL,
    penalty TEXT NOT NULL,
    source TEXT NOT NULL,
    scored_ms INTEGER,
    finished_at BIGINT NOT NULL,
    PRIMARY KEY (match_id, set_index, solve_index, public_id)
  );
  CREATE INDEX IF NOT EXISTS match_players_by_player ON match_players (public_id);
  CREATE INDEX IF NOT EXISTS solves_by_player ON solves (public_id, cube_event, scored_ms);

  -- Verified smart cube solves: every move and its time (ms from the start), for replays.
  ALTER TABLE solves ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE solves ADD COLUMN IF NOT EXISTS tps REAL;
  ALTER TABLE solves ADD COLUMN IF NOT EXISTS moves JSONB;
  ALTER TABLE solves ADD COLUMN IF NOT EXISTS times JSONB;
  CREATE INDEX IF NOT EXISTS solves_verified ON solves (cube_event, verified, scored_ms);

  -- Matches of the weekly race carry its date ("2026-10-10").
  ALTER TABLE matches ADD COLUMN IF NOT EXISTS weekly_id TEXT;
  CREATE INDEX IF NOT EXISTS matches_weekly ON matches (weekly_id);
`;

interface RoomRow {
  state: ServerRoom | string;
  chat: ChatMessage[] | string;
  chat_count: number;
  saved_at: string | number;
}

interface SolveRow {
  match_id: string;
  set_index: number;
  solve_index: number;
  public_id: string;
  scored_ms: number;
  tps: number | string | null;
  moves: string[] | string | null;
  finished_at: string | number;
}

/** JSONB normally comes back parsed, but be safe if a driver returns text. */
function json<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

export class PostgresStore implements PersistenceStore, HistoryReader {
  private constructor(private readonly pool: Pool) {}

  /** Creates the tables if they don't exist yet. */
  static async open(pool: Pool): Promise<PostgresStore> {
    await pool.query(SCHEMA);
    return new PostgresStore(pool);
  }

  async saveRoom({ room, chat, chatCount, savedAt }: SavedRoom): Promise<void> {
    await this.pool.query(
      `INSERT INTO live_rooms (code, state, chat, chat_count, saved_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE SET state = EXCLUDED.state, chat = EXCLUDED.chat,
         chat_count = EXCLUDED.chat_count, saved_at = EXCLUDED.saved_at`,
      [room.code, JSON.stringify(room), JSON.stringify(chat), chatCount, savedAt],
    );
  }

  async removeRoom(code: string): Promise<void> {
    await this.pool.query("DELETE FROM live_rooms WHERE code = $1", [code]);
  }

  async loadRooms(): Promise<SavedRoom[]> {
    const { rows } = await this.pool.query<RoomRow>("SELECT state, chat, chat_count, saved_at FROM live_rooms");
    return rows.map((row) => ({
      room: json(row.state),
      chat: json(row.chat),
      chatCount: row.chat_count,
      // BIGINT comes back as a string from Postgres.
      savedAt: Number(row.saved_at),
    }));
  }

  async record(event: HistoryEvent): Promise<void> {
    switch (event.kind) {
      case "match_started": {
        const s = event.settings;
        await this.pool.query(
          `INSERT INTO matches (match_id, room_code, room_name, cube_event, format, win_condition, scoring, started_at, weekly_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (match_id) DO NOTHING`,
          [event.matchId, event.roomCode, s.name, s.mixedEvents ? "mixed" : s.cubeEvent, s.format, s.winCondition, s.scoring, event.at, event.weeklyId],
        );
        return;
      }

      case "set_started": {
        if (event.players.length === 0) return;
        const params: unknown[] = [event.matchId];
        const values = event.players.map((p) => {
          params.push(p.publicId, p.nickname);
          return `($1, $${params.length - 1}, $${params.length})`;
        });
        await this.pool.query(
          `INSERT INTO match_players (match_id, public_id, nickname) VALUES ${values.join(", ")}
           ON CONFLICT (match_id, public_id) DO UPDATE SET nickname = EXCLUDED.nickname`,
          params,
        );
        return;
      }

      case "set_finished": {
        const { set } = event;
        await this.transaction(async (client) => {
          await client.query(
            `INSERT INTO match_sets (match_id, set_index, winner_ids, standings, paces, finished_at)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (match_id, set_index) DO NOTHING`,
            [event.matchId, set.setIndex, JSON.stringify(set.winnerIds), JSON.stringify(set.standings),
              set.paces === null ? null : JSON.stringify(set.paces), event.at],
          );
          const params: unknown[] = [event.matchId, set.setIndex, event.at];
          const values: string[] = [];
          for (const [publicId, results] of Object.entries(set.results)) {
            const cubeEvent = event.events[publicId];
            if (!cubeEvent) continue;
            results.forEach((result, solveIndex) => {
              const scored = scoredTime(result);
              const replay = result.verified ? event.replays[`${publicId}/${solveIndex}`] : undefined;
              const b = params.length; // this row's own values are $b+1 ... $b+12
              params.push(solveIndex, publicId, cubeEvent, event.scrambles[cubeEvent]?.[solveIndex] ?? null,
                result.timeMs, result.penalty, result.source, scored === "DNF" ? null : scored,
                Boolean(replay), replay ? result.verified!.tps : null,
                replay ? JSON.stringify(replay.moves) : null, replay ? JSON.stringify(replay.times) : null);
              const own = Array.from({ length: 12 }, (_, i) => `$${b + i + 1}`);
              values.push(`($1, $2, ${own.join(", ")}, $3)`);
            });
          }
          if (values.length === 0) return;
          await client.query(
            `INSERT INTO solves (match_id, set_index, solve_index, public_id, cube_event, scramble,
               time_ms, penalty, source, scored_ms, verified, tps, moves, times, finished_at)
             VALUES ${values.join(", ")} ON CONFLICT DO NOTHING`,
            params,
          );
        });
        return;
      }

      case "match_ended": {
        await this.transaction(async (client) => {
          await client.query(
            `UPDATE matches SET status = $2, ended_at = $3, winner_ids = $4 WHERE match_id = $1 AND status = 'running'`,
            [event.matchId, event.status, event.at, JSON.stringify(event.winnerIds)],
          );
          for (const [publicId, points] of Object.entries(event.points)) {
            await client.query("UPDATE match_players SET points = $3 WHERE match_id = $1 AND public_id = $2", [
              event.matchId,
              publicId,
              points,
            ]);
          }
        });
        return;
      }
    }
  }

  // ---- Reading ----

  async weeklyResults(weeklyId: string): Promise<WeeklyRow[]> {
    const { rows } = await this.pool.query<{ match_id: string; standings: Record<string, SetStanding> | string }>(
      `SELECT m.match_id, ms.standings FROM matches m JOIN match_sets ms ON ms.match_id = m.match_id
       WHERE m.weekly_id = $1 AND ms.set_index = 0 ORDER BY m.started_at DESC LIMIT 1`,
      [weeklyId],
    );
    if (!rows[0]) return [];
    return rankWeekly(json(rows[0].standings), await this.nicknames([rows[0].match_id]));
  }

  async leaderboard(cubeEvent: string, since: number, limit: number): Promise<LeaderboardRow[]> {
    const { rows } = await this.pool.query<SolveRow>(
      `SELECT match_id, set_index, solve_index, public_id, scored_ms, tps, moves, finished_at FROM solves
       WHERE verified AND cube_event = $1 AND scored_ms IS NOT NULL AND finished_at >= $2
       ORDER BY scored_ms ASC, finished_at ASC LIMIT 500`,
      [cubeEvent, since],
    );
    // Each player once, with their best.
    const best: SolveRow[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.public_id)) continue;
      seen.add(row.public_id);
      best.push(row);
      if (best.length === limit) break;
    }
    const names = await this.nicknames(best.map((r) => r.match_id));
    return best.map((r, i) => ({
      rank: i + 1,
      name: names[`${r.match_id}/${r.public_id}`] ?? "Player",
      playerId: r.public_id,
      timeMs: r.scored_ms,
      moves: json(r.moves ?? []).length,
      tps: Number(r.tps ?? 0),
      at: Number(r.finished_at),
      replayId: `${r.match_id}/${r.set_index}/${r.solve_index}/${r.public_id}`,
    }));
  }

  async replay(id: string): Promise<Replay | null> {
    const [matchId, setIndex, solveIndex, publicId] = id.split("/");
    const { rows } = await this.pool.query(
      `SELECT s.scramble, s.moves, s.times, s.time_ms, s.penalty, s.tps, p.nickname FROM solves s
       JOIN match_players p ON p.match_id = s.match_id AND p.public_id = s.public_id
       WHERE s.match_id = $1 AND s.set_index = $2 AND s.solve_index = $3 AND s.public_id = $4 AND s.verified`,
      [matchId, Number(setIndex), Number(solveIndex), publicId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      name: row.nickname,
      scramble: row.scramble ?? "",
      moves: json(row.moves),
      times: json(row.times),
      timeMs: row.time_ms,
      penalty: row.penalty as Penalty,
      tps: Number(row.tps),
    };
  }

  /** Nicknames by "matchId/publicId" (and by publicId for one match). */
  private async nicknames(matchIds: string[]): Promise<Record<string, string>> {
    if (matchIds.length === 0) return {};
    const unique = [...new Set(matchIds)];
    const { rows } = await this.pool.query<{ match_id: string; public_id: string; nickname: string }>(
      `SELECT match_id, public_id, nickname FROM match_players WHERE match_id IN (${unique.map((_, i) => `$${i + 1}`).join(", ")})`,
      unique,
    );
    const names: Record<string, string> = {};
    for (const row of rows) {
      names[`${row.match_id}/${row.public_id}`] = row.nickname;
      names[row.public_id] = row.nickname;
    }
    return names;
  }

  private async transaction(work: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await work(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
