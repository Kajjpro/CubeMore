/*
 * WHAT THE MAIN PAGES SAY, as data and plain HTML.
 *
 * The server sends this HTML inside the page (search engines read it without
 * running the app); the app then draws its own interactive page with the same
 * text (the FAQs below are used by both). The Mongolian page (/mn) is only
 * this HTML.
 */

import { EVENT_PAGES, eventPageBySlug, type EventPage } from "../seo";

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Faq {
  q: string;
  a: string;
}

export const HOME_FAQ: Faq[] = [
  { q: "Is CubeMore free?", a: "Yes. You can race as a guest with just a nickname, or create an account to keep your name and stats." },
  { q: "How do I race my friends?", a: "Create a room, set the event and format, open it and send the link. Private rooms need a PIN; the invite link includes it." },
  { q: "Is it a csTimer alternative?", a: "It's a timer you share: the same scramble and a live race with other cubers, instead of timing alone. Your session ao5 and ao12 are there too." },
  { q: "Can CubeMore analyze my solves?", a: "Yes, with a smart cube. The solve analyzer times your cross, F2L, OLL and PLL and shows what to practice. Free." },
  { q: "Which events can I race?", a: "All 17 WCA events: 3x3, 2x2, 4x4 to 7x7, 3x3 one-handed, blindfolded, Fewest Moves, Megaminx, Pyraminx, Skewb, Square-1 and Clock. And FTO." },
];

export const HOME_FAQ_MN: Faq[] = [
  { q: "Үнэгүй юу?", a: "Тийм. Бүртгэлгүйгээр зочноор уралдаж болно." },
  { q: "Найзуудтайгаа яаж уралдах вэ?", a: "Өрөө үүсгээд холбоосоо найзууддаа илгээгээрэй. Хувийн өрөөнд PIN код хэрэгтэй." },
  { q: "Шийдлээ шинжлүүлж болох уу?", a: "Тийм, ухаалаг шоогоор. Шийдлийн шинжээч cross, F2L, OLL, PLL-ийн хугацааг хэмжиж, юун дээр дасгал хийхийг харуулна. Үнэгүй." },
  { q: "Цаг хэмжигч яаж ажилладаг вэ?", a: "Space товчийг (утсан дээр дэлгэцийг) дараад суллахад цаг эхэлнэ, дурын товч дарахад зогсоно. Хугацаагаа гараар оруулж ч болно." },
];

export const ANALYZER_FAQ: Faq[] = [
  { q: "Which smart cubes work?", a: "GAN (356 i3, i Carry 2, 12 ui, 14 ui and more), QiYi (QY-QYSC smart cubes, X-Man Tornado V4 AI), GoCube and Giiker." },
  { q: "Does it work on a phone?", a: "Yes, in Chrome on Android. iPhone browsers can't use Bluetooth: open CubeMore in the free Bluefy browser instead." },
  { q: "What does it measure?", a: "Each stage of a CFOP solve: the cross, each F2L pair, OLL and PLL, with the time you looked and the time you turned, your moves and turns per second." },
  { q: "How does it know what to practice?", a: "It finds the shortest cross for your scramble and the shortest way for each pair, recognizes your OLL and PLL cases, and compares each stage with typical times one level faster than you." },
  { q: "Is it free?", a: "Yes. Sign in to keep your solves and see your sessions later." },
];

function faqHtml(faqs: Faq[], heading: string): string {
  return `<section class="about-block faq"><h2>${esc(heading)}</h2><dl>${faqs.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("")}</dl></section>`;
}

const eventLinks = (except?: string) =>
  `<ul class="event-links">${EVENT_PAGES.filter((p) => p.id !== except)
    .map((p) => `<li><a href="/race/${p.slug}">${esc(p.name)}</a></li>`)
    .join("")}</ul>`;

function home(): string {
  return `<h1>CubeMore: online speedcubing races</h1>
<p class="intro">Race other cubers live: the same scramble for everyone, a live timer, WCA averages. Create a room and send the link, join an open room, or practise alone.</p>
<section class="about-block"><h2>Online speedcubing races, live</h2><p>CubeMore (also written Cube More) is a free online speedcubing race. Everyone in a room gets the same random-state WCA scramble, solves it on a real cube and stops a stackmat-style timer. Your times, ao5 and ao12 averages and points show up live next to everyone else's, so you know who's ahead before the last solve. It works in your browser on a phone or a computer, with a keyboard, a touch screen, a Bluetooth timer or a smart cube.</p></section>
<section class="about-block"><h2>See where your solve loses time</h2><p>With a smart cube, the <a href="/analyze">solve analyzer</a> times every stage of your solve and shows what to practice next. Learn the cases with the <a href="/algorithms">OLL and PLL algorithms</a>, and try the <a href="/daily">daily scramble</a>.</p></section>
<section class="about-block"><h2>Race any WCA event</h2>${eventLinks()}</section>
${faqHtml(HOME_FAQ, "Questions")}
<p class="small"><a href="/mn" hreflang="mn" lang="mn">Монгол хэлээр</a></p>`;
}

function analyzer(): string {
  return `<h1>Solve analyzer</h1>
<p class="intro">Solve with your smart cube. See every stage timed, and what to practice next.</p>
<section class="about-block"><h2>What you get after each solve</h2><ul>
<li>Your cross, each F2L pair, OLL and PLL timed, with looking and turning apart.</li>
<li>The shortest cross for your scramble, and the shortest way for each pair.</li>
<li>Your OLL and PLL case, with the algorithm (see all <a href="/algorithms">OLL and PLL algorithms</a>).</li>
<li>Your solve replayed on a 3D cube at its real speed.</li>
<li>For an average of 5: your average stages and the three things to work on.</li>
</ul></section>
${faqHtml(ANALYZER_FAQ, "Questions")}`;
}

function event(page: EventPage): string {
  return `<nav class="crumbs small muted" aria-label="Breadcrumb"><a href="/">CubeMore</a><span aria-hidden="true">/</span><span>${esc(page.name)} race</span></nav>
<h1>${esc(page.name)} race online</h1>
<p class="intro">${esc(page.blurb)}</p>
<section class="about-block"><h2>About the ${esc(page.short)}</h2><p>${esc(page.guide)}</p></section>
<section class="about-block"><h2>How a ${esc(page.short)} race works</h2><ol>
<li>Create a room (or join one), and send the link to your friends.</li>
<li>Everyone gets the same ${esc(page.name)} scramble. Solve it and stop the timer.</li>
<li>The best result of each set (a single, ao5 or ao12, as the room is set) wins a point; first to the target wins the match.</li>
</ol></section>
${page.id === "333" || page.id === "333oh" ? `<p>Have a smart cube? Try the <a href="/analyze">solve analyzer</a>, and learn the <a href="/algorithms">OLL and PLL algorithms</a>.</p>` : ""}
<section class="about-block"><h2>Other events</h2>${eventLinks(page.id)}</section>`;
}

function daily(): string {
  return `<h1>Daily scramble</h1>
<p class="intro">One 3x3 scramble a day, the same for everyone. You get one attempt; then see where you rank on today's leaderboard.</p>
<ul><li>Everyone in the world gets the same scramble today.</li><li>The scramble shows when you start; then you have 10 minutes to scramble your cube and solve.</li></ul>`;
}

function mongolian(): string {
  return `<h1>Рубик шоогоор онлайн уралдаарай</h1>
<p class="intro">CubeMore бол спидкубинг сонирхогчдод зориулсан үнэгүй сайт. Өрөөнд байгаа бүх хүн ижил холилтоор (scramble) шоогоо эвлүүлж, цагаа хэмжинэ. Хэн түрүүлж байгааг шууд харна.</p>
<section class="about-block"><h2>Юу хийж болох вэ</h2><ul>
<li><a href="/">Найзуудтайгаа эсвэл дэлхийн кубикчидтэй шууд уралдах</a>: WCA-ийн бүх 17 төрөл.</li>
<li><a href="/analyze">Ухаалаг шоогоо холбоод шийдэл бүрээ шинжлүүлэх</a>: cross, F2L, OLL, PLL-ийн хугацаа, юун дээр дасгал хийх вэ.</li>
<li><a href="/algorithms">OLL, PLL-ийн 78 алгоритмыг зурагтай нь үзэх</a>.</li>
<li><a href="/daily">Өдөр бүрийн холилт</a>: нэг оролдлого, дэлхийн жагсаалт.</li>
</ul></section>
${faqHtml(HOME_FAQ_MN, "Түгээмэл асуулт")}
<p class="small"><a href="/" hreflang="en" lang="en">English</a></p>`;
}

/** The main content of a page, or null when it has none of its own here. */
export function sitePageHtml(path: string): string | null {
  if (path === "/") return home();
  if (path === "/analyze") return analyzer();
  if (path === "/daily") return daily();
  if (path === "/mn") return mongolian();
  const race = path.match(/^\/race\/([\w-]+)$/);
  const page = race ? eventPageBySlug(race[1]) : undefined;
  return page ? event(page) : null;
}
