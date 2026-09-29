// Makes official-style WCA random-state scrambles with cubing.js (https://js.cubing.net/cubing/).
// Scrambles are ALWAYS made on the server, so every player gets the same ones.

import type { CubeEventId, Scramble } from "@cube-racing/shared";
import { randomScrambleForEvent } from "cubing/scramble";
import { setSearchDebug } from "cubing/search";

// cubing.js prints how long each scramble took. We don't need that in our logs.
setSearchDebug({ logPerf: false });

/**
 * Makes one random scramble. Usually takes a few milliseconds, but the
 * first 4x4x4 scramble after the server starts takes about a second.
 */
export async function generateScramble(cubeEvent: CubeEventId): Promise<Scramble> {
  const alg = await randomScrambleForEvent(cubeEvent);
  return { cubeEvent, text: alg.toString() };
}

/**
 * Makes all the scrambles for one set (1, 5 or 12). If something goes wrong,
 * it tries again (up to `attempts` times, waiting a little longer each time).
 */
export async function generateSetScrambles(cubeEvent: CubeEventId, count: number, attempts = 3): Promise<Scramble[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const scrambles: Scramble[] = [];
      for (let i = 0; i < count; i++) {
        scrambles.push(await generateScramble(cubeEvent));
      }
      return scrambles;
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}
