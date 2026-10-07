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
  CHAT_MAX_LENGTH,
  REACTIONS,
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
import { SMART_SOLVE_LIMITS } from "./smartSolve";
import { PENALTIES, ROOM_FORMATS, ROOM_VISIBILITIES, SCORING_MODES, SOLVE_TIME_LIMITS, WIN_CONDITIONS } from "./types";

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

const cubeEventSchema = z.enum(CUBE_EVENT_IDS as [CubeEventId, ...CubeEventId[]]);

/** Every field optional: { format: "ao12" } changes just the format. */
export const settingsChangesSchema = z.object({
  cubeEvent: cubeEventSchema.optional(),
  format: z.enum(ROOM_FORMATS).optional(),
  winCondition: z.enum(WIN_CONDITIONS).optional(),
  maxPlayers: z.number().int().min(MIN_PLAYERS_LIMIT).max(MAX_PLAYERS_LIMIT).optional(),
  solveTimeLimit: z.literal(SOLVE_TIME_LIMITS).optional(),
  scoring: z.enum(SCORING_MODES).optional(),
  smartOnly: z.boolean().optional(),
  mixedEvents: z.boolean().optional(),
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
    /** The event you race if the room is mixed (your last pick). */
    cubeEvent: cubeEventSchema.optional(),
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
  /** The event you race if the room is mixed (your last pick). Ignored when coming back to your seat. */
  cubeEvent: cubeEventSchema.optional(),
});

/** Step away and only watch (true), or race again from the next set (false). */
export const watchSchema = z.object({
  watching: z.boolean(),
});

/** Mixed rooms: the event you race (from the next match, or the next set if you're new). */
export const chooseEventSchema = z.object({
  cubeEvent: cubeEventSchema,
});

/**
 * Host: start a new match right away (after a match, or in the middle of one),
 * optionally with another event, format or time limit. The win condition stays.
 */
export const restartSchema = z.object({
  settings: z
    .object({
      cubeEvent: cubeEventSchema.optional(),
      format: z.enum(ROOM_FORMATS).optional(),
      solveTimeLimit: z.literal(SOLVE_TIME_LIMITS).optional(),
    })
    .default({}),
});

/**
 * Host, in the lobby. Besides the race settings: the room name, public/private
 * (a private room needs a PIN: a new one, or the one it already has), and
 * Best of until the first race starts.
 */
export const updateSettingsSchema = z.object({
  settings: settingsChangesSchema.extend({
    name: roomNameSchema.optional(),
    visibility: z.enum(ROOM_VISIBILITIES).optional(),
  }),
  pin: pinSchema.optional(),
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
    /** A smart cube solve: every move and when it happened (ms from the start). The server verifies it. */
    smart: z
      .object({
        moves: z.array(z.string().max(3)).max(SMART_SOLVE_LIMITS.maxMoves),
        times: z.array(z.number().int().min(0).max(MAX_SOLVE_TIME_MS)).max(SMART_SOLVE_LIMITS.maxMoves),
      })
      .optional(),
  })
  .refine((solve) => solve.penalty === "DNF" || solve.timeMs > 0, {
    message: "A time must be longer than 0.",
  });

export const changePenaltySchema = z.object({
  ...solveIdFields,
  penalty: z.enum(PENALTIES),
});

/** Watch a room without playing (the streamer overlay). Private rooms need the PIN. */
export const watchRoomSchema = z.object({
  code: roomCodeSchema,
  pin: z.string().max(10).optional(),
});

/** The daily scramble: who's asking (the secret player id, so one attempt per player). */
/** The verified leaderboard: this week's or all time. */
export const leaderboardSchema = z.object({
  period: z.enum(["week", "all"]),
});

/** One verified solve to watch again: "matchId/setIndex/solveIndex/publicId" (from a leaderboard row). */
export const replaySchema = z.object({
  id: z.string().max(200).regex(/^[\w-]+\/\d+\/\d+\/[\w-]+$/, "Invalid replay id."),
});

export const dailySchema = z.object({
  playerId: playerIdSchema,
});

/** Starting today's attempt (shows the scramble; the 10 minutes start). */
export const dailyStartSchema = z.object({
  playerId: playerIdSchema,
  nickname: nicknameSchema,
});

/** Today's time. */
export const dailySubmitSchema = z.object({
  playerId: playerIdSchema,
  timeMs: z.number().int().min(0).max(MAX_SOLVE_TIME_MS),
  penalty: z.enum(PENALTIES),
});

/** Smart cube: moves made during a solve ("R", "U'", "F2"...), sent in small batches. */
export const cubeMovesSchema = z.object({
  moves: z
    .array(z.string().regex(/^[URFDLBMESxyzurfdlb]w?['2]?$/))
    .min(1)
    .max(30),
});

/** "Race now": the event you want to race. */
export const quickRaceSchema = z.object({
  cubeEvent: cubeEventSchema,
});

/** A reaction to another player's latest time. */
export const reactSchema = z.object({
  targetId: publicIdSchema,
  emoji: z.enum(REACTIONS),
});

/** A chat message: line breaks and control characters become spaces; 1-200 characters. */
export const chatSchema = z.object({
  text: z
    .string()
    .max(2000)
    .transform((text) => text.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim())
    .refine((text) => text.length >= 1 && [...text].length <= CHAT_MAX_LENGTH, {
      message: `Messages can be 1 to ${CHAT_MAX_LENGTH} characters.`,
    }),
});

export const timerStatusSchema = z.object({
  status: z.enum(["solving", "idle"]),
});

/** Cleans a line of text: no control characters, single spaces, trimmed. */
const oneLine = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((text) => text.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim());

/** The contact form. `website` is a trap for bots: people never see that field, so it stays empty. */
export const contactSchema = z.object({
  name: oneLine(60).refine((name) => [...name].length >= 1 && [...name].length <= 60, {
    message: "Please write your name (up to 60 characters).",
  }),
  email: oneLine(200).refine((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200, {
    message: "Please check your email address, so we can write back.",
  }),
  message: z
    .string()
    .max(8000)
    .transform((text) => text.replace(/[^\P{Cc}\n]/gu, "").trim())
    .refine((text) => [...text].length >= 10 && [...text].length <= 2000, {
      message: "Messages can be 10 to 2000 characters.",
    }),
  website: z.string().max(200).optional(),
});

/** The site owner deletes a contact message. */
export const contactIdSchema = z.object({
  id: z.string().min(1).max(64),
});

/** Turns zod's list of problems into one short message for the user. */
export function describeProblem(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request.";
  // Our own messages (nickname, room code...) are already written for people.
  if (issue.code === "custom" || issue.path.length === 0) return issue.message;
  return `Invalid request (${issue.path.join(".")}: ${issue.message}).`;
}
