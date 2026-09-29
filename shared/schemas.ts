/*
 * INPUT CHECKING with zod. Never trust the client.
 *
 * Anyone can open the browser console and send any data with any event name,
 * so the server checks every incoming payload against one of these schemas
 * before using it. A schema describes the exact shape a payload must have;
 * `schema.safeParse(data)` returns either clean data or a list of problems.
 *
 * They live in /shared so the payload TYPES the client sends come from the
 * very same definitions (see events.ts).
 *
 * Import from "@cube-racing/shared/schemas" (the browser doesn't need them).
 */

import { z } from "zod";
import {
  MAX_PLAYERS_LIMIT,
  MAX_SOLVE_TIME_MS,
  MIN_PLAYERS_LIMIT,
  NICKNAME_MAX_LENGTH,
  PIN_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_NAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
} from "./constants";
import { CUBE_EVENT_IDS, type CubeEventId } from "./cubeEvents";
import { PENALTIES, ROOM_FORMATS, ROOM_VISIBILITIES, SOLVE_TIME_LIMITS, WIN_CONDITIONS } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

// ---- Small building blocks ----

export const playerIdSchema = z
  .string()
  .regex(UUID_PATTERN, "Invalid player id. Try refreshing the page.")
  .transform((id) => id.toLowerCase());

/** Trims spaces, removes invisible control characters, and checks the length (1-20). */
export const nicknameSchema = z
  .string()
  .max(200)
  .transform((name) =>
    name
      .replace(/\p{Cc}/gu, "") // control characters (newlines, tabs, ...)
      .replace(/\s+/g, " ")
      .trim(),
  )
  // [...name].length counts an emoji as 1 character (name.length would count it as 2).
  .refine((name) => [...name].length >= 1 && [...name].length <= NICKNAME_MAX_LENGTH, {
    message: `Nickname must be 1 to ${NICKNAME_MAX_LENGTH} characters.`,
  });

/** A room name: cleaned like a nickname, 0-30 characters (empty = the server picks "<host>'s room"). */
export const roomNameSchema = z
  .string()
  .max(300)
  .transform((name) => name.replace(/\p{Cc}/gu, "").replace(/\s+/g, " ").trim())
  .refine((name) => [...name].length <= ROOM_NAME_MAX_LENGTH, {
    message: `Room names can be up to ${ROOM_NAME_MAX_LENGTH} characters.`,
  });

/** A private room's PIN: exactly 4 digits. */
export const pinSchema = z
  .string()
  .regex(new RegExp(`^\\d{${PIN_LENGTH}}$`), `The PIN must be ${PIN_LENGTH} digits.`);

/** Accepts lowercase too ("abc234" -> "ABC234"). */
export const roomCodeSchema = z
  .string()
  .max(20)
  .transform((code) => code.trim().toUpperCase())
  .refine((code) => ROOM_CODE_PATTERN.test(code), { message: "Invalid room code." });

const publicIdSchema = z.string().min(1).max(64);

/** Every field optional: { format: "ao12" } changes just the format. */
export const settingsChangesSchema = z.object({
  cubeEvent: z.enum(CUBE_EVENT_IDS as [CubeEventId, ...CubeEventId[]]).optional(),
  format: z.enum(ROOM_FORMATS).optional(),
  winCondition: z.enum(WIN_CONDITIONS).optional(),
  maxPlayers: z.number().int().min(MIN_PLAYERS_LIMIT).max(MAX_PLAYERS_LIMIT).optional(),
  solveTimeLimit: z.literal(SOLVE_TIME_LIMITS).optional(),
});

/** Which solve: (matchId, setIndex, solveIndex) identifies every solve exactly. */
const solveIdFields = {
  matchId: z.string().min(1).max(64),
  setIndex: z.number().int().min(0).max(100_000),
  solveIndex: z.number().int().min(0).max(11),
};

// ---- One schema per client event ----

export const emptySchema = z.object({});

export const createRoomSchema = z
  .object({
    playerId: playerIdSchema,
    nickname: nicknameSchema,
    settings: settingsChangesSchema
      .extend({
        name: roomNameSchema.optional(),
        visibility: z.enum(ROOM_VISIBILITIES).optional(),
      })
      .default({}),
    /** Required for a private room. */
    pin: pinSchema.optional(),
  })
  .refine((input) => input.settings.visibility !== "private" || input.pin !== undefined, {
    message: `A private room needs a ${PIN_LENGTH}-digit PIN.`,
  });

export const joinRoomSchema = z.object({
  playerId: playerIdSchema,
  nickname: nicknameSchema,
  code: roomCodeSchema,
  /** Only needed for private rooms (and not when coming back to your own seat). */
  pin: z.string().max(10).optional(),
});

/**
 * Host: start a new match right away (after a match, or in the middle of one),
 * optionally with another event, format or time limit. The win condition stays.
 */
export const restartSchema = z.object({
  settings: z
    .object({
      cubeEvent: z.enum(CUBE_EVENT_IDS as [CubeEventId, ...CubeEventId[]]).optional(),
      format: z.enum(ROOM_FORMATS).optional(),
      solveTimeLimit: z.literal(SOLVE_TIME_LIMITS).optional(),
    })
    .default({}),
});

export const updateSettingsSchema = z.object({
  settings: settingsChangesSchema,
});

export const targetPlayerSchema = z.object({
  /** The PUBLIC id of the player. */
  targetId: publicIdSchema,
});

export const submitSolveSchema = z
  .object({
    ...solveIdFields,
    /** Whole milliseconds, never decimals. */
    timeMs: z.number().int().min(0).max(MAX_SOLVE_TIME_MS),
    penalty: z.enum(PENALTIES),
  })
  .refine((solve) => solve.penalty === "DNF" || solve.timeMs > 0, {
    message: "A time must be longer than 0.",
  });

export const changePenaltySchema = z.object({
  ...solveIdFields,
  penalty: z.enum(PENALTIES),
});

export const warmUpSchema = z.object({
  cubeEvent: z.enum(CUBE_EVENT_IDS as [CubeEventId, ...CubeEventId[]]),
});

export const timerStatusSchema = z.object({
  status: z.enum(["solving", "idle"]),
});

/** Turns zod's list of problems into one short message for the user. */
export function describeProblem(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request.";
  // Our own messages (nickname, room code...) are already written for people.
  if (issue.code === "custom" || issue.path.length === 0) return issue.message;
  return `Invalid request (${issue.path.join(".")}: ${issue.message}).`;
}
