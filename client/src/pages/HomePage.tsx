import { useEffect, useState, type FormEvent } from "react";
import { ClientEvents, EVENT_PAGES, ROOM_CODE_LENGTH, type DailyStatus, type PublicRoomInfo } from "@cube-racing/shared";
import { useRacer, YouBar } from "../components/Racer";
import { RoomTabs, useRooms } from "../components/RoomList";
import { Link, SiteFooter, SiteHeader } from "../components/Site";
import { AnalyzerPromo } from "../components/AnalyzerPromo";
import { SmartHome } from "../components/SmartHome";
import { EventIcon, Icon } from "../components/ui";
import { navigate } from "../router";
import { request, socket } from "../socket";
import { loadIdentity } from "../storage";
import { formatResult } from "../time";

/** Only for /dev/states. */
export interface HomeDemo {
  nickname?: string;
  rooms?: PublicRoomInfo[];
  daily?: DailyStatus;
  tab?: "public" | "private";
}

/**
 * The home page: the open rooms come first (Public | Private), with "Create a
 * room" and "Join with a code" right above them. Then the solve analyzer, the
 * daily scramble, contact, and smart cube racing.
 */
export function HomePage({ demo }: { demo?: HomeDemo }) {
  const racer = useRacer(demo?.nickname);
  const [code, setCode] = useState("");
  const { rooms, connected } = useRooms(demo?.rooms);
  const racingNow = rooms?.filter((room) => room.racing).length ?? 0;

  // If you got here with the browser's Back button, you were still in a room.
  // Tell the server you left (it does nothing if you weren't in one).
  useEffect(() => {
    if (!demo && socket.connected) void request(ClientEvents.LEAVE_ROOM, {});
  }, [demo]);

  function openRoom(roomCode: string): void {
    if (racer.check()) navigate(`/room/${roomCode}`);
  }

  function join(event: FormEvent): void {
    event.preventDefault();
    if (!racer.check()) return;
    const clean = code.trim().toUpperCase();
    if (clean.length !== ROOM_CODE_LENGTH) {
      racer.setError(`Room codes have ${ROOM_CODE_LENGTH} characters.`);
      return;
    }
    // The room page does the joining (and shows errors like "room not found").
    navigate(`/room/${clean}`);
  }

  return (
    <div className="home">
      <SiteHeader>
        {rooms && rooms.length > 0 && (
          <span className="live-pill">{racingNow ? `${racingNow} racing now` : `${rooms.length} open`}</span>
        )}
      </SiteHeader>

      <main className="home-main">
        <section className="panel rooms-hero" aria-labelledby="rooms-title">
          <div className="rooms-hero-head">
            <div className="rooms-hero-title">
              {/* The page's one h1: the name, in words people search for. */}
              <h1 className="hero-kicker">CubeMore: online speedcubing races</h1>
              <h2 id="rooms-title" className="rooms-title">
                Open rooms
              </h2>
              <p className="small muted">Race other cubers live: the same scramble for everyone, a live timer, WCA averages.</p>
            </div>
            <div className="rooms-actions">
              <button type="button" className="primary create-button" onClick={() => void racer.createRoom()} disabled={racer.creating}>
                <Icon name="plus" size={18} />
                {racer.creating ? "Creating…" : "Create a room"}
              </button>
              <form className="join-form" onSubmit={join}>
                <label className="sr-only" htmlFor="join-code">
                  Join with a room code
                </label>
                <input
                  id="join-code"
                  className="code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={ROOM_CODE_LENGTH}
                  placeholder="CODE"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="submit">Join</button>
              </form>
            </div>
          </div>

          <YouBar racer={racer} />

          <RoomTabs rooms={rooms} connected={connected} onJoin={openRoom} initialTab={demo?.tab} />
        </section>

        <AnalyzerPromo />

        <div className="home-cards">
          <DailyCard demo={demo?.daily} />
          <ContactCard />
        </div>
      </main>

      <SmartHome />
      <AboutCubeMore />

      <p className="tiny muted home-tip">
        Hold <kbd>Space</kbd> (or the timer on a phone), let go to start. Any key or tap stops it.
      </p>
      <SiteFooter />
    </div>
  );
}

/**
 * What CubeMore is, in words people search for: English, the events (each a
 * link to its own page), a short FAQ, and the same in Mongolian.
 */
function AboutCubeMore() {
  return (
    <section className="about" aria-labelledby="about-title">
      <div className="about-block">
        <h2 id="about-title">Online speedcubing races, live</h2>
        <p>
          CubeMore (also written Cube More) is a free online speedcubing race. Everyone in a room gets the same random-state WCA scramble, solves it on a
          real cube and stops a stackmat-style timer. Your times, ao5 and ao12 averages and points show up live next to
          everyone else's, so you know who's ahead before the last solve. Race friends in a private room with a PIN, join a
          public room, or practise alone. It works in your browser on a phone or a computer, with a keyboard, a touch screen,
          a Bluetooth timer or a smart cube.
        </p>
      </div>

      <div className="about-block">
        <h2>Race any WCA event</h2>
        <ul className="event-links">
          {EVENT_PAGES.map((page) => (
            <li key={page.id}>
              <Link to={`/race/${page.slug}`}>
                <EventIcon id={page.id} />
                {page.name}
              </Link>
            </li>
          ))}
        </ul>
        <p className="small muted">
          Mixed rooms let everyone race their own short event: a Pyraminx main against a 2x2 main, Skewb against Clock.
        </p>
      </div>

      <div className="about-block faq">
        <h2>Questions</h2>
        <dl>
          <dt>Is CubeMore free?</dt>
          <dd>Yes. You can race as a guest with just a nickname, or create an account to keep your name and stats.</dd>
          <dt>How do I race my friends?</dt>
          <dd>Create a room, set the event and format, open it and send the link. Private rooms need a PIN; the invite link includes it.</dd>
          <dt>Is it a csTimer alternative?</dt>
          <dd>It's a timer you share: the same scramble and a live race with other cubers, instead of timing alone. Your session ao5 and ao12 are there too.</dd>
          <dt>Can CubeMore analyze my solves?</dt>
          <dd>
            Yes, with a smart cube. The <Link to="/analyze">solve analyzer</Link> times your cross, F2L, OLL and PLL and shows what to practice. Free.
          </dd>
          <dt>Which events can I race?</dt>
          <dd>All 17 WCA events: 3x3, 2x2, 4x4 to 7x7, 3x3 one-handed, blindfolded, Fewest Moves, Megaminx, Pyraminx, Skewb, Square-1 and Clock.</dd>
        </dl>
      </div>

      <div className="about-block" lang="mn">
        <h2>Рубик шоогоор онлайн уралдаарай</h2>
        <p>
          CubeMore бол спидкубинг сонирхогчдод зориулсан үнэгүй онлайн уралдааны сайт. Өрөөнд байгаа бүх хүн ижил холилтоор
          (scramble) шоогоо эвлүүлж, цагаа хэмжинэ. Хэн хурдан байгааг шууд харна. 3x3, 2x2, Пираминкс, Скьюб, Clock болон
          WCA-ийн бүх төрлөөр найзуудтайгаа эсвэл дэлхийн кубикчидтэй уралдаарай.
        </p>
        <dl>
          <dt>Үнэгүй юу?</dt>
          <dd>Тийм. Бүртгэлгүйгээр зочноор уралдаж болно.</dd>
          <dt>Найзуудтайгаа яаж уралдах вэ?</dt>
          <dd>Өрөө үүсгээд холбоосоо найзууддаа илгээгээрэй. Хувийн өрөөнд PIN код хэрэгтэй.</dd>
          <dt>Шийдлээ шинжлүүлж болох уу?</dt>
          <dd>
            Тийм, ухаалаг шоогоор. <Link to="/analyze">Шийдлийн шинжээч</Link> cross, F2L, OLL, PLL-ийн хугацааг хэмжиж, юун дээр дасгал хийхийг
            харуулна. Үнэгүй.
          </dd>
          <dt>Цаг хэмжигч яаж ажилладаг вэ?</dt>
          <dd>Space товчийг (утсан дээр дэлгэцийг) дараад суллахад цаг эхэлнэ, дурын товч дарахад зогсоно. Хугацаагаа гараар оруулж ч болно.</dd>
        </dl>
      </div>
    </section>
  );
}

/** Questions, ideas, bugs: the way to the contact page. */
function ContactCard() {
  return (
    <section className="panel daily-card contact-card" aria-labelledby="contact-card-title">
      <div className="grow">
        <h2 id="contact-card-title">Contact</h2>
        <p className="small muted">Questions, ideas, a bug, or an event to run on CubeMore? Write to us.</p>
      </div>
      <Link to="/contact" className="button-link">
        Write
      </Link>
    </section>
  );
}

/** Today's daily scramble: your status in one line, and a way in. */
function DailyCard({ demo }: { demo?: DailyStatus }) {
  const [daily, setDaily] = useState<DailyStatus | null>(demo ?? null);
  useEffect(() => {
    if (demo) return;
    const load = () =>
      void request(ClientEvents.DAILY_STATUS, { playerId: loadIdentity().playerId }).then((r) => r.ok && setDaily(r.daily));
    socket.on("connect", load);
    if (socket.connected) load();
    return () => void socket.off("connect", load);
  }, [demo]);

  const done = daily?.status === "done" && daily.result;
  return (
    <section className="panel daily-card" aria-labelledby="daily-title">
      <div className="grow">
        <h2 id="daily-title">Daily scramble</h2>
        <p className="small muted">
          {!daily ? (
            "The same 3x3 scramble for everyone, one attempt a day."
          ) : done ? (
            <>
              You: <b className="mono daily-you">{formatResult(daily.result!)}</b>, #{daily.rank} of {daily.total}
            </>
          ) : daily.status === "started" ? (
            "Your attempt is running. Finish it!"
          ) : (
            `One attempt. ${daily.total} finished today.`
          )}
        </p>
      </div>
      <button type="button" onClick={() => navigate("/daily")}>
        {done ? "Leaderboard" : daily?.status === "started" ? "Continue" : "Play"}
      </button>
    </section>
  );
}
