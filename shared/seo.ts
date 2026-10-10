// SEARCH ENGINES: each page's title and description, in one place.
//
// The server writes them into the HTML it sends (crawlers and link previews
// read that, often without running any JavaScript); the website uses the same
// ones for the browser tab while you move around. Keywords go where search
// engines read them: titles, descriptions, headings and the visible text.

import type { CubeEventId } from "./cubeEvents";
import { algorithmPaths } from "./analysis/caseSlugs";

export interface PageMeta {
  title: string;
  description: string;
  /** The page's own address (no site part), for the canonical link. */
  path: string;
  /** Rooms, the admin page...: fine to visit and share, but not for search results. */
  noindex?: boolean;
  /** The page's language when it isn't English ("mn"). */
  lang?: string;
}

export const SITE_NAME = "CubeMore";

/** How else people may type the name into Google ("cube more", "cubemore"). */
export const SITE_ALIASES = ["Cube More", "Cubemore"];

/** One event's page: /race/<slug>. */
export interface EventPage {
  id: CubeEventId;
  /** How people search for it: "3x3 Rubik's Cube", "3x3 One-Handed (OH)". */
  name: string;
  slug: string;
  /** What cubers call it: "Pyraminx", "3x3", "Square-1". */
  short: string;
  /** Unique text for this event's page (also its description). */
  blurb: string;
  /** A few sentences about the event itself: how it's solved, the WCA format. */
  guide: string;
}

export const EVENT_PAGES: readonly EventPage[] = [
  { id: "333", name: "3x3 Rubik's Cube", slug: "3x3", short: "3x3", blurb: "Race the 3x3 Rubik's Cube online against other speedcubers. Random-state WCA scrambles, a stackmat-style timer, ao5 and ao12 averages, best-of-3 matches.", guide: "The classic Rubik's Cube. Most fast solvers use CFOP: the cross, the first two layers (F2L), then OLL and PLL; beginners usually start layer by layer. WCA rounds are an average of 5: the best and worst times are dropped and the middle three averaged." },
  { id: "222", name: "2x2 Cube", slug: "2x2", short: "2x2", blurb: "Fast 2x2 races online: everyone gets the same 2x2 scramble, sub-5 solves count to the hundredth, and the best ao5 wins the set.", guide: "Only eight corners, so solves are short: good solvers average under 5 seconds. Popular methods are Ortega and CLL. Scrambles are random-state, so every position is equally likely. WCA rounds are an average of 5." },
  { id: "444", name: "4x4 Cube", slug: "4x4", short: "4x4", blurb: "Race the 4x4 Rubik's Revenge online. Official random-state 4x4 scrambles with a picture, a live timer and WCA averages.", guide: "The 4x4 (Rubik's Revenge) has no fixed centers. Most solvers use reduction: build the centers, pair the edges, then finish like a 3x3, with two parity cases to know. WCA rounds are an average of 5." },
  { id: "555", name: "5x5 Cube", slug: "5x5", short: "5x5", blurb: "5x5 races online with friends or other cubers: the same 5x5 scramble for everyone, live clocks while others solve, ao5 averages.", guide: "Solved like the 4x4 by reduction (centers, then edges, then a 3x3 finish), but with fixed middle centers and no parity. WCA rounds are an average of 5." },
  { id: "666", name: "6x6 Cube", slug: "6x6", short: "6x6", blurb: "Race the 6x6 cube online. Long scrambles with a picture, a solve time limit if you want one, and mean-of-results style averages.", guide: "Long solves, often one to three minutes, where good centers and edge pairing matter most. WCA rounds are a mean of 3: all three times count." },
  { id: "777", name: "7x7 Cube", slug: "7x7", short: "7x7", blurb: "7x7 races online: big-cube scrambles generated like the WCA's, a live timer, and everyone's times side by side.", guide: "The biggest WCA cube, solved by reduction like the 5x5. WCA rounds are a mean of 3, so every solve counts." },
  { id: "333bf", name: "3x3 Blindfolded (3BLD)", slug: "3x3-blindfolded", short: "3BLD", blurb: "3x3 blindfolded races online (3BLD): memorise, solve, stop the timer. DNFs count like at a competition.", guide: "Memorize the cube, put on the blindfold, solve. The time includes the memorization. WCA ranks the best of 3 attempts, and a single wrong piece makes a DNF, so accuracy comes first." },
  { id: "333fm", name: "Fewest Moves (FMC)", slug: "fewest-moves", short: "FMC", blurb: "Fewest Moves (FMC) online with the same scramble for everyone. Find the shortest solution and compare.", guide: "Find the shortest solution you can, on paper, in 60 minutes. The result is the number of moves, not the time. WCA rounds are a mean of 3 attempts." },
  { id: "333oh", name: "3x3 One-Handed (OH)", slug: "3x3-one-handed", short: "OH", blurb: "3x3 one-handed races online (OH): the same scramble for everyone, a stackmat-style timer, OH averages.", guide: "The 3x3 with one hand. Most one-handed solvers use CFOP or Roux, with algorithms picked for one hand and a loose cube. WCA rounds are an average of 5." },
  { id: "clock", name: "Rubik's Clock", slug: "clock", short: "Clock", blurb: "Rubik's Clock races online with WCA clock scrambles. Short solves, so every hundredth counts.", guide: "Turn all nine dials on both sides to 12 o'clock with the pins and wheels. Solves take a few seconds, so look-ahead and a good grip matter. WCA rounds are an average of 5." },
  { id: "minx", name: "Megaminx", slug: "megaminx", short: "Megaminx", blurb: "Megaminx races online: WCA-style megaminx scrambles line by line, a live timer and ao5 averages.", guide: "Twelve faces. Solved much like a 3x3 with more F2L-style steps, and a last layer with its own OLL and PLL. WCA rounds are an average of 5." },
  { id: "pyram", name: "Pyraminx", slug: "pyraminx", short: "Pyraminx", blurb: "Pyraminx races online: the same pyraminx scramble for everyone, a stackmat-style timer, and the best ao5 wins. Sub-3 solvers welcome.", guide: "Four faces, and tips that turn on their own. Top solvers average under 3 seconds with methods like L4E and top-first. WCA rounds are an average of 5." },
  { id: "skewb", name: "Skewb", slug: "skewb", short: "Skewb", blurb: "Skewb races online against other cubers: random-state skewb scrambles, a live timer and WCA ao5 averages.", guide: "Eight corners turning around the centers, so solves take a few seconds. Popular methods are Sarah's and Ranzha. WCA rounds are an average of 5." },
  { id: "sq1", name: "Square-1", slug: "square-1", short: "Square-1", blurb: "Square-1 races online (SQ1): official square-1 scrambles with a picture, a live timer and averages.", guide: "It changes shape as you turn. First bring it back to a cube shape, then solve the corners and edges, with parity as a common last step. WCA rounds are an average of 5." },
  { id: "444bf", name: "4x4 Blindfolded (4BLD)", slug: "4x4-blindfolded", short: "4BLD", blurb: "4x4 blindfolded races online (4BLD) with WCA scrambles and a generous time limit.", guide: "The 4x4 blindfolded: memorize the centers, the edge wings and the corners, then solve without looking. WCA ranks the best of 3 attempts." },
  { id: "555bf", name: "5x5 Blindfolded (5BLD)", slug: "5x5-blindfolded", short: "5BLD", blurb: "5x5 blindfolded races online (5BLD): the same scramble for everyone, a timer and results like at a competition.", guide: "The 5x5 blindfolded, with long memorization of centers, wings, midges and corners. WCA ranks the best of 3 attempts." },
  { id: "333mbf", name: "3x3 Multi-Blind", slug: "multi-blind", short: "Multi-BLD", blurb: "Multi-blind practice online: everyone gets the same 3x3 scrambles and races the clock.", guide: "Solve as many 3x3s as you can blindfolded in one go, up to an hour. The score is cubes solved minus cubes unsolved." },
];

export function eventPageBySlug(slug: string): EventPage | undefined {
  return EVENT_PAGES.find((page) => page.slug === slug.toLowerCase());
}

export function eventPageFor(id: CubeEventId): EventPage {
  return EVENT_PAGES.find((page) => page.id === id)!;
}

export const HOME_META: PageMeta = {
  path: "/",
  title: "CubeMore: Online Speedcubing Races and Rubik's Cube Timer",
  description:
    "CubeMore: race other cubers online in real time, and analyze your smart cube solves. The same scramble for everyone, a stackmat-style timer, WCA averages for all 17 events, and a free CFOP solve analyzer.",
};

/**
 * Titles that need more than this file knows (the algorithm pages: odds, moves).
 * The server sets it (content/algorithmPages.ts); the website's algorithm page
 * sets its own title, so the main script stays small.
 */
let extraMeta: ((path: string) => PageMeta | null) | null = null;
export function setExtraPageMeta(fn: (path: string) => PageMeta | null): void {
  extraMeta = fn;
}

/** Every page search engines should know about (for the sitemap). */
export function indexablePaths(): string[] {
  return ["/", "/mn", "/analyze", "/algorithms", "/daily", "/contact", "/privacy", ...EVENT_PAGES.map((page) => `/race/${page.slug}`), ...algorithmPaths().slice(1)];
}

/**
 * The title and description for a path. Rooms can pass what's known about
 * the room, for a nicer link preview ("Join Sunday practice on CubeMore").
 */
export function pageMeta(path: string, room?: { name: string; summary: string } | null): PageMeta {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/") return HOME_META;
  if (clean === "/daily") {
    return {
      path: clean,
      title: "Daily Scramble: One 3x3 Scramble a Day | CubeMore",
      description: "The same 3x3 Rubik's Cube scramble for everyone, every day. One attempt, then see where you rank on today's leaderboard.",
    };
  }
  if (clean.startsWith("/algorithms") && isKnownPage(clean)) {
    return extraMeta?.(clean) ?? { path: clean, title: `OLL and PLL Algorithms | ${SITE_NAME}`, description: HOME_META.description };
  }
  if (clean === "/mn") {
    return {
      path: clean,
      title: "CubeMore: Рубик шоогоор онлайн уралдаарай",
      description: "Бусад кубикчидтэй шууд уралдаарай: бүгдэд ижил холилт, цаг хэмжигч, WCA дундаж. Ухаалаг шооны шийдлийн шинжээч, OLL, PLL алгоритмууд. Үнэгүй.",
      lang: "mn",
    };
  }
  if (clean === "/analyze") {
    return {
      path: clean,
      title: "Smart Cube Solve Analyzer: CFOP Splits, OLL and PLL | CubeMore",
      description:
        "Solve with your smart cube (GAN, GoCube, Giiker, QiYi) and see every stage: cross, F2L pairs, OLL and PLL times, the shortest cross, the cases you got and what to practice next. Free.",
    };
  }
  if (clean === "/contact") {
    return { path: clean, title: "Contact | CubeMore", description: "Questions, ideas or a bug? Write to the CubeMore team." };
  }
  if (clean === "/privacy") {
    return {
      path: clean,
      title: "Privacy | CubeMore",
      description: "What CubeMore keeps about you and why: no ads, no tracking cookies, only what the site needs.",
    };
  }
  const race = clean.match(/^\/race\/([\w-]+)$/);
  const page = race ? eventPageBySlug(race[1]) : undefined;
  if (page) {
    return { path: `/race/${page.slug}`, title: `${page.name} Race Online | CubeMore`, description: page.blurb };
  }
  const roomMatch = clean.match(/^\/room\/([A-Za-z0-9]+)/);
  if (roomMatch) {
    return {
      path: clean,
      noindex: true,
      title: room ? `${room.name}: race on CubeMore` : "Join a race | CubeMore",
      description: room ? `${room.summary}. Join the race on CubeMore: the same scramble for everyone, live.` : HOME_META.description,
    };
  }
  const title = isKnownPage(clean) ? SITE_NAME : `Page not found | ${SITE_NAME}`;
  return { path: clean, noindex: true, title, description: HOME_META.description };
}

/** Pages that exist (everything else is a 404: still the app, but marked so search engines drop it). */
export function isKnownPage(path: string): boolean {
  const clean = path.replace(/\/+$/, "") || "/";
  if (["/", "/mn", "/analyze", "/daily", "/contact", "/privacy", "/admin", "/dev/states"].includes(clean)) return true;
  if (/^\/room\/[A-Za-z0-9]+(\/overlay)?$/.test(clean)) return true;
  if (clean.startsWith("/algorithms")) return algorithmPaths().includes(clean);
  const race = clean.match(/^\/race\/([\w-]+)$/);
  return race ? eventPageBySlug(race[1]) !== undefined : false;
}

