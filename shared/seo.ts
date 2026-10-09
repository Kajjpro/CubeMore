// SEARCH ENGINES: each page's title and description, in one place.
//
// The server writes them into the HTML it sends (crawlers and link previews
// read that, often without running any JavaScript); the website uses the same
// ones for the browser tab while you move around. Keywords go where search
// engines read them: titles, descriptions, headings and the visible text.

import type { CubeEventId } from "./cubeEvents";

export interface PageMeta {
  title: string;
  description: string;
  /** The page's own address (no site part), for the canonical link. */
  path: string;
  /** Rooms, the admin page...: fine to visit and share, but not for search results. */
  noindex?: boolean;
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
}

export const EVENT_PAGES: readonly EventPage[] = [
  { id: "333", name: "3x3 Rubik's Cube", slug: "3x3", short: "3x3", blurb: "Race the 3x3 Rubik's Cube online against other speedcubers. Random-state WCA scrambles, a stackmat-style timer, ao5 and ao12 averages, best-of-3 matches." },
  { id: "222", name: "2x2 Cube", slug: "2x2", short: "2x2", blurb: "Fast 2x2 races online: everyone gets the same 2x2 scramble, sub-5 solves count to the hundredth, and the best ao5 wins the set." },
  { id: "444", name: "4x4 Cube", slug: "4x4", short: "4x4", blurb: "Race the 4x4 Rubik's Revenge online. Official random-state 4x4 scrambles with a picture, a live timer and WCA averages." },
  { id: "555", name: "5x5 Cube", slug: "5x5", short: "5x5", blurb: "5x5 races online with friends or other cubers: the same 5x5 scramble for everyone, live clocks while others solve, ao5 averages." },
  { id: "666", name: "6x6 Cube", slug: "6x6", short: "6x6", blurb: "Race the 6x6 cube online. Long scrambles with a picture, a solve time limit if you want one, and mean-of-results style averages." },
  { id: "777", name: "7x7 Cube", slug: "7x7", short: "7x7", blurb: "7x7 races online: big-cube scrambles generated like the WCA's, a live timer, and everyone's times side by side." },
  { id: "333bf", name: "3x3 Blindfolded (3BLD)", slug: "3x3-blindfolded", short: "3BLD", blurb: "3x3 blindfolded races online (3BLD): memorise, solve, stop the timer. DNFs count like at a competition." },
  { id: "333fm", name: "Fewest Moves (FMC)", slug: "fewest-moves", short: "FMC", blurb: "Fewest Moves (FMC) online with the same scramble for everyone. Find the shortest solution and compare." },
  { id: "333oh", name: "3x3 One-Handed (OH)", slug: "3x3-one-handed", short: "OH", blurb: "3x3 one-handed races online (OH): the same scramble for everyone, a stackmat-style timer, OH averages." },
  { id: "clock", name: "Rubik's Clock", slug: "clock", short: "Clock", blurb: "Rubik's Clock races online with WCA clock scrambles. Short solves, so every hundredth counts." },
  { id: "minx", name: "Megaminx", slug: "megaminx", short: "Megaminx", blurb: "Megaminx races online: WCA-style megaminx scrambles line by line, a live timer and ao5 averages." },
  { id: "pyram", name: "Pyraminx", slug: "pyraminx", short: "Pyraminx", blurb: "Pyraminx races online: the same pyraminx scramble for everyone, a stackmat-style timer, and the best ao5 wins. Sub-3 solvers welcome." },
  { id: "skewb", name: "Skewb", slug: "skewb", short: "Skewb", blurb: "Skewb races online against other cubers: random-state skewb scrambles, a live timer and WCA ao5 averages." },
  { id: "sq1", name: "Square-1", slug: "square-1", short: "Square-1", blurb: "Square-1 races online (SQ1): official square-1 scrambles with a picture, a live timer and averages." },
  { id: "444bf", name: "4x4 Blindfolded (4BLD)", slug: "4x4-blindfolded", short: "4BLD", blurb: "4x4 blindfolded races online (4BLD) with WCA scrambles and a generous time limit." },
  { id: "555bf", name: "5x5 Blindfolded (5BLD)", slug: "5x5-blindfolded", short: "5BLD", blurb: "5x5 blindfolded races online (5BLD): the same scramble for everyone, a timer and results like at a competition." },
  { id: "333mbf", name: "3x3 Multi-Blind", slug: "multi-blind", short: "Multi-BLD", blurb: "Multi-blind practice online: everyone gets the same 3x3 scrambles and races the clock." },
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

/** Every page search engines should know about (for the sitemap). */
export function indexablePaths(): string[] {
  return ["/", "/analyze", "/daily", "/contact", "/privacy", ...EVENT_PAGES.map((page) => `/race/${page.slug}`)];
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
  if (["/", "/analyze", "/daily", "/contact", "/privacy", "/admin", "/dev/states"].includes(clean)) return true;
  if (/^\/room\/[A-Za-z0-9]+(\/overlay)?$/.test(clean)) return true;
  const race = clean.match(/^\/race\/([\w-]+)$/);
  return race ? eventPageBySlug(race[1]) !== undefined : false;
}

