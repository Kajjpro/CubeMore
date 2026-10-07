// /race/<event>, e.g. /race/pyraminx: one page per WCA event, for people who
// search for "pyraminx race online". The open rooms for that event, a button
// that makes a room on it, and links to the other events.

import { getCubeEvent, EVENT_PAGES, MIXED_EVENTS, type EventPage as EventPageInfo, type PublicRoomInfo } from "@cube-racing/shared";
import { useRacer, YouBar } from "../components/Racer";
import { RoomCards, useRooms } from "../components/RoomList";
import { Link, SiteFooter, SiteHeader } from "../components/Site";
import { EventIcon, Icon } from "../components/ui";
import { navigate } from "../router";

export function EventPage({ page, demoRooms }: { page: EventPageInfo; demoRooms?: PublicRoomInfo[] }) {
  const event = getCubeEvent(page.id);
  const racer = useRacer();
  const { rooms, connected } = useRooms(demoRooms);
  // This event's rooms, and mixed rooms you could race it in.
  const here = rooms?.filter((room) => (room.mixedEvents ? MIXED_EVENTS.includes(page.id) : room.cubeEvent === page.id)) ?? null;

  function openRoom(code: string): void {
    if (racer.check()) navigate(`/room/${code}`);
  }

  return (
    <div className="home event-page">
      <SiteHeader />
      <main className="home-main">
        <section className="panel rooms-hero" aria-labelledby="event-title">
          <nav className="crumbs small muted" aria-label="Breadcrumb">
            <Link to="/">CubeMore</Link>
            <span aria-hidden>/</span>
            <span>{page.name} race</span>
          </nav>
          <div className="rooms-hero-head">
            <div className="rooms-hero-title">
              <h1 id="event-title">
                <EventIcon id={page.id} /> {page.name} race online
              </h1>
              <p className="small muted event-blurb">{page.blurb}</p>
            </div>
            <div className="rooms-actions">
              <button
                type="button"
                className="primary create-button"
                onClick={() => void racer.createRoom({ cubeEvent: page.id })}
                disabled={racer.creating}
              >
                <Icon name="plus" size={18} />
                {racer.creating ? "Creating…" : `Create a ${page.short} room`}
              </button>
            </div>
          </div>
          <YouBar racer={racer} />
          <h2 className="card-title">Open {page.short} rooms</h2>
          <div className="room-tab-panel">
            <RoomCards
              rooms={here}
              connected={connected}
              onJoin={openRoom}
              empty={{
                title: `No ${page.short} rooms right now.`,
                hint: "Create one: it's listed for everyone, and the race starts as soon as someone joins.",
              }}
            />
          </div>
        </section>

        <section className="about" aria-labelledby="how-title">
          <div className="about-block">
            <h2 id="how-title">How a {page.short} race works</h2>
            <ol className="how-steps">
              <li>Create a room (or join one), and send the link to your friends.</li>
              <li>Everyone gets the same {event.name} scramble. Solve it and stop the timer.</li>
              <li>The best result of each set (a single, ao5 or ao12, as the room is set) wins a point; first to the target wins the match.</li>
            </ol>
          </div>
          <div className="about-block">
            <h2>Other events</h2>
            <ul className="event-links">
              {EVENT_PAGES.filter((other) => other.id !== page.id).map((other) => (
                <li key={other.id}>
                  <Link to={`/race/${other.slug}`}>
                    <EventIcon id={other.id} />
                    {other.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
