/*
 * CONTACT MESSAGES: what people send with the contact form.
 *
 * Two versions with the same methods (like the daily store):
 *   - MemoryContactStore: in memory, gone after a restart (fine for trying it out).
 *   - PostgresContactStore: in the database (DATABASE_URL). The table is made on first start.
 *
 * The site owner reads them on /admin (signed in with an account listed in
 * ADMIN_USER_IDS). Nobody else can read them.
 */

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ContactMessage } from "@cube-racing/shared";

export interface ContactStore {
  add(message: ContactMessage): Promise<void>;
  /** Newest first. */
  list(limit: number): Promise<ContactMessage[]>;
  remove(id: string): Promise<void>;
}

export function newContactMessage(fields: Omit<ContactMessage, "id" | "at">, now: number): ContactMessage {
  return { id: randomUUID(), at: now, ...fields };
}

export class MemoryContactStore implements ContactStore {
  private messages: ContactMessage[] = [];

  async add(message: ContactMessage): Promise<void> {
    this.messages.push(message);
  }

  async list(limit: number): Promise<ContactMessage[]> {
    return [...this.messages].sort((a, b) => b.at - a.at).slice(0, limit);
  }

  async remove(id: string): Promise<void> {
    this.messages = this.messages.filter((m) => m.id !== id);
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS contact_messages (
    id TEXT PRIMARY KEY,
    at BIGINT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    username TEXT
  );
`;

interface MessageRow {
  id: string;
  at: string | number;
  name: string;
  email: string;
  message: string;
  username: string | null;
}

export class PostgresContactStore implements ContactStore {
  private constructor(private readonly pool: Pool) {}

  static async open(pool: Pool): Promise<PostgresContactStore> {
    await pool.query(SCHEMA);
    return new PostgresContactStore(pool);
  }

  async add(m: ContactMessage): Promise<void> {
    await this.pool.query(
      "INSERT INTO contact_messages (id, at, name, email, message, username) VALUES ($1, $2, $3, $4, $5, $6)",
      [m.id, m.at, m.name, m.email, m.message, m.username],
    );
  }

  async list(limit: number): Promise<ContactMessage[]> {
    const { rows } = await this.pool.query<MessageRow>(
      "SELECT id, at, name, email, message, username FROM contact_messages ORDER BY at DESC LIMIT $1",
      [limit],
    );
    // BIGINT comes back as a string from Postgres.
    return rows.map((row) => ({ ...row, at: Number(row.at) }));
  }

  async remove(id: string): Promise<void> {
    await this.pool.query("DELETE FROM contact_messages WHERE id = $1", [id]);
  }
}
