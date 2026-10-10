// The puzzle events: the 17 official WCA events, and FTO (not a WCA event, but
// popular, with official-style random-state scrambles in cubing.js).
// (Called "cube events" in the code, so they don't get mixed up with Socket.IO events.)
//
//   id     - the official WCA event id ("fto" for FTO). The scramble library (cubing.js) uses the same ids.
//   name   - what the user sees.
//   puzzle - which puzzle to draw for the scramble picture.

export const CUBE_EVENTS = [
  { id: "333", name: "3x3x3", puzzle: "3x3x3" },
  { id: "222", name: "2x2x2", puzzle: "2x2x2" },
  { id: "444", name: "4x4x4", puzzle: "4x4x4" },
  { id: "555", name: "5x5x5", puzzle: "5x5x5" },
  { id: "666", name: "6x6x6", puzzle: "6x6x6" },
  { id: "777", name: "7x7x7", puzzle: "7x7x7" },
  { id: "333bf", name: "3x3x3 Blindfolded", puzzle: "3x3x3" },
  { id: "333fm", name: "3x3x3 Fewest Moves", puzzle: "3x3x3" },
  { id: "333oh", name: "3x3x3 One-Handed", puzzle: "3x3x3" },
  { id: "clock", name: "Clock", puzzle: "clock" },
  { id: "minx", name: "Megaminx", puzzle: "megaminx" },
  { id: "pyram", name: "Pyraminx", puzzle: "pyraminx" },
  { id: "skewb", name: "Skewb", puzzle: "skewb" },
  { id: "sq1", name: "Square-1", puzzle: "square1" },
  { id: "444bf", name: "4x4x4 Blindfolded", puzzle: "4x4x4" },
  { id: "555bf", name: "5x5x5 Blindfolded", puzzle: "5x5x5" },
  { id: "333mbf", name: "3x3x3 Multi-Blind", puzzle: "3x3x3" },
  { id: "fto", name: "FTO (Face-Turning Octahedron)", puzzle: "fto" },
] as const;

export type CubeEvent = (typeof CUBE_EVENTS)[number];
export type CubeEventId = CubeEvent["id"];

export const CUBE_EVENT_IDS: readonly CubeEventId[] = CUBE_EVENTS.map((e) => e.id);

/** Looks up an event by id, e.g. getCubeEvent("333oh").name === "3x3x3 One-Handed". */
export function getCubeEvent(id: CubeEventId): CubeEvent {
  return CUBE_EVENTS.find((e) => e.id === id)!;
}
