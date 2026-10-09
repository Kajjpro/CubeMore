/*
 * PRACTICE STORE: signed-in players' analyzer sessions and solves.
 *
 * Two versions with the same methods (like the contact store):
 *   - MemoryPracticeStore: in memory, gone after a restart (no DATABASE_URL).
 *   - PostgresPracticeStore: in the database. The tables are made on first start.
 *
 * Every method takes the owner's user id: nobody can read or change another
 * player's sessions, even with their session id.
 */

import type { Pool } from "pg";
import type { PracticeKind, PracticeSessionInfo, PracticeSolve } from "@cube-racing/shared";
import { PRACTICE_SIZE } from "@cube-racing/shared";

export interface SessionRow {
  id: string;
  userId: string;
  kind: PracticeKind;
  createdAt: number;
  coach: string | null;
}

export interface PracticeStore {
  /** Makes the session if it's new. Returns it (it may belong to someone else: check userId). */
  ensureSession(session: Omit<SessionRow, "coach">): Promise<SessionRow>;
  /** Adds a solve; false if that index is already taken. */
  addSolve(solve: PracticeSolve): Promise<boolean>;
  /** The user's sessions, newest first, made before `before`. */
  listSessions(userId: string, before: number, limit: number): Promise<PracticeSessionInfo[]>;
  getSession(userId: string, id: string): Promise<{ session: SessionRow; solves: PracticeSolve[] } | null>;
  deleteSession(userId: string, id: string): Promise<void>;
  setCoach(userId: string, id: string, text: string, model: string): Promise<void>;
}

/** The single's time, or the ao5 (best and worst dropped) once complete. */
export function sessionResult(kind: PracticeKind, times: number[]): number | null {
  if (times.length < PRACTICE_SIZE[kind]) return null;
  if (kind === "single") return times[0];
  const sorted = [...times].sort((a, b) => a - b).slice(1, -1);
  return Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
}

export class MemoryPracticeStore implements PracticeStore {
  private sessions = new Map<string, SessionRow>();
  private solves = new Map<string, PracticeSolve[]>();

  async ensureSession(session: Omit<SessionRow, "coach">): Promise<SessionRow> {
    const existing = this.sessions.get(session.id);
    if (existing) return existing;
    const row = { ...session, coach: null };
    this.sessions.set(session.id, row);
    this.solves.set(session.id, []);
    return row;
  }

  async addSolve(solve: PracticeSolve): Promise<boolean> {
    const list = this.solves.get(solve.sessionId) ?? [];
    if (list.some((s) => s.index === solve.index)) return false;
    list.push(solve);
    list.sort((a, b) => a.index - b.index);
    this.solves.set(solve.sessionId, list);
    return true;
  }

  async listSessions(userId: string, before: number, limit: number): Promise<PracticeSessionInfo[]> {
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId && s.createdAt < before)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((s) => {
        const times = (this.solves.get(s.id) ?? []).map((solve) => solve.timeMs);
        return { id: s.id, kind: s.kind, createdAt: s.createdAt, times, resultMs: sessionResult(s.kind, times) };
      });
  }

  async getSession(userId: string, id: string) {
    const session = this.sessions.get(id);
    if (!session || session.userId !== userId) return null;
    return { session, solves: [...(this.solves.get(id) ?? [])] };
  }

  async deleteSession(userId: string, id: string): Promise<void> {
    if (this.sessions.get(id)?.userId !== userId) return;
    this.sessions.delete(id);
    this.solves.delete(id);
  }

  async setCoach(userId: string, id: string, text: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session?.userId === userId) session.coach = text;
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS practice_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    coach_text TEXT,
    coach_model TEXT
  );
  CREATE INDEX IF NOT EXISTS practice_sessions_by_user ON practice_sessions (user_id, created_at);
  CREATE TABLE IF NOT EXISTS practice_solves (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    created_at BIGINT NOT NULL,
    scramble TEXT NOT NULL,
    time_ms INTEGER NOT NULL,
    moves JSONB NOT NULL,
    times JSONB NOT NULL,
    analysis JSONB NOT NULL,
    UNIQUE (session_id, idx)
  );
`;

interface SessionDbRow {
  id: string;
  user_id: string;
  kind: PracticeKind;
  created_at: string | number;
  coach_text: string | null;
}

interface SolveDbRow {
  id: string;
  session_id: string;
  idx: number;
  created_at: string | number;
  scramble: string;
  time_ms: number;
  moves: string[] | string;
  times: number[] | string;
  analysis: PracticeSolve["analysis"] | string;
}

/** JSONB normally comes back parsed, but be safe if a driver returns text. */
const json = <T>(value: T | string): T => (typeof value === "string" ? (JSON.parse(value) as T) : value);

const toSession = (row: SessionDbRow): SessionRow => ({
  id: row.id,
  userId: row.user_id,
  kind: row.kind,
  createdAt: Number(row.created_at),
  coach: row.coach_text,
});

const toSolve = (row: SolveDbRow): PracticeSolve => ({
  id: row.id,
  sessionId: row.session_id,
  index: row.idx,
  createdAt: Number(row.created_at),
  scramble: row.scramble,
  timeMs: row.time_ms,
  moves: json(row.moves),
  times: json(row.times),
  analysis: json(row.analysis),
});

export class PostgresPracticeStore implements PracticeStore {
  private constructor(private readonly pool: Pool) {}

  static async open(pool: Pool): Promise<PostgresPracticeStore> {
    await pool.query(SCHEMA);
    return new PostgresPracticeStore(pool);
  }

  async ensureSession(session: Omit<SessionRow, "coach">): Promise<SessionRow> {
    await this.pool.query(
      "INSERT INTO practice_sessions (id, user_id, kind, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
      [session.id, session.userId, session.kind, session.createdAt],
    );
    const { rows } = await this.pool.query<SessionDbRow>("SELECT * FROM practice_sessions WHERE id = $1", [session.id]);
    return toSession(rows[0]);
  }

  async addSolve(s: PracticeSolve): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO practice_solves (id, session_id, idx, created_at, scramble, time_ms, moves, times, analysis)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (session_id, idx) DO NOTHING`,
      [s.id, s.sessionId, s.index, s.createdAt, s.scramble, s.timeMs, JSON.stringify(s.moves), JSON.stringify(s.times), JSON.stringify(s.analysis)],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listSessions(userId: string, before: number, limit: number): Promise<PracticeSessionInfo[]> {
    const { rows } = await this.pool.query<SessionDbRow>(
      "SELECT * FROM practice_sessions WHERE user_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3",
      [userId, before, limit],
    );
    if (rows.length === 0) return [];
    const { rows: times } = await this.pool.query<{ session_id: string; idx: number; time_ms: number }>(
      "SELECT session_id, idx, time_ms FROM practice_solves WHERE session_id = ANY($1) ORDER BY idx",
      [rows.map((r) => r.id)],
    );
    return rows.map((row) => {
      const session = toSession(row);
      const list = times.filter((t) => t.session_id === row.id).map((t) => t.time_ms);
      return { id: session.id, kind: session.kind, createdAt: session.createdAt, times: list, resultMs: sessionResult(session.kind, list) };
    });
  }

  async getSession(userId: string, id: string) {
    const { rows } = await this.pool.query<SessionDbRow>("SELECT * FROM practice_sessions WHERE id = $1 AND user_id = $2", [id, userId]);
    if (rows.length === 0) return null;
    const { rows: solves } = await this.pool.query<SolveDbRow>("SELECT * FROM practice_solves WHERE session_id = $1 ORDER BY idx", [id]);
    return { session: toSession(rows[0]), solves: solves.map(toSolve) };
  }

  async deleteSession(userId: string, id: string): Promise<void> {
    const { rowCount } = await this.pool.query("DELETE FROM practice_sessions WHERE id = $1 AND user_id = $2", [id, userId]);
    if (rowCount) await this.pool.query("DELETE FROM practice_solves WHERE session_id = $1", [id]);
  }

  async setCoach(userId: string, id: string, text: string, model: string): Promise<void> {
    await this.pool.query("UPDATE practice_sessions SET coach_text = $1, coach_model = $2 WHERE id = $3 AND user_id = $4", [text, model, id, userId]);
  }
}
