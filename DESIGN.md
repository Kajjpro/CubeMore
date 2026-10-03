# Cube Racing UI design

A timer for racing other cubers, used on a phone between solves. Plain and quick: the
scramble, a big timer and the standings, nothing decorative. Reference points: csTimer
(timer focus, session stats) and WCA Live (results).

## The idea: six faces

Every colour in the interface is a face of the cube, and every face has one job:

| Face | Job | Examples |
| --- | --- | --- |
| **Blue** | you, primary actions, links | your row, `Race now`, focus ring, points |
| **Green** | ready, fastest, connected | timer "release to start", fastest time, OK, new best |
| **Red** | holding, DNF, errors | timer "hold…", DNF, kick confirm |
| **Yellow** | +2, reconnecting, warnings, private rooms | `11.87+`, PIN tag |
| **Orange** | live | racing rooms, opponents' running clocks, the 3-2-1 countdown |
| **White** | text | |

Status colours always come with text ("DNF", "+", "reconnecting", "offline", "Racing").
No decorative dots: no status dots, pulsing dots or progress pips, and no "·" separators in
text (use commas or separate labels). No gradients, glows or rainbow stripes.
Gold, silver and bronze are used only for ranks 1–3 (podium, rank badges, daily leaderboard).

## Tokens

All tokens are CSS custom properties at the top of `client/src/styles.css`.
Theme: dark by default (the race page is designed dark-first); Light and System are in the
Menu and the theme button (`<html data-theme="light|dark">`, System removes the attribute).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #f3f5fa | #07090d | page (flat) |
| `--surface` | #ffffff | #0f1218 | cards, panels |
| `--surface-2` / `-3` | #f2f4f9 / #e8ebf3 | #161a22 / #1e232d | buttons, inputs, rows, hover |
| `--border` / `-strong` | #e1e5ee / #cbd2df | #222835 / #2f3747 | 1 px lines |
| `--text` / `--text-2` / `--muted` | #0d1220 / #434c61 / #5f687d | #eef1f7 / #aeb6c8 / #7e879c | text (muted is AA on every surface) |
| `--accent` / `--accent-bg` | #1f5fe0 / #2563eb | #6ea2ff / #2f6bf0 | blue text / blue fills (white text on it) |
| `--green` `--red` `--amber` `--orange` | darker tones | brighter tones | the faces as status; each has a `-soft` background |
| `--sticker-0…5` | fixed | fixed | white, yellow, red, orange, blue, green: avatars and the logo |
| `--ink-0…5` | | | player colours as readable text (chat names) |

**Player colours.** Every player gets a face from their public id (`playerColor()` in
`components/ui.tsx`), the same in the standings, chat, finish line, podium and lobby. The home
page works out your public id like the server does (SHA-256), so your colour doesn't change
when you enter a room.

**Type.** Interface: Space Grotesk (variable, self-hosted via @fontsource). Times, codes and
scrambles: JetBrains Mono with `tabular-nums` and ligatures off (megaminx `++`/`--` must not
merge); the timer digits are 700. Base 15 px; inputs 16 px (no iOS zoom). Timer: `clamp(2.5rem, min(21cqi,
40cqh), 10.5rem)`; "9:59.99" fits a 360 px screen on one line.

**Shape.** Radii 6 / 8 / 12 / 18 / 24 px (`--r-*`); chips, tags and the floating start bar
are pills. Cards are `--surface` with a 1 px border, a hairline highlight and a small shadow.
**Spacing** 4 / 8 / 12 / 16 / 24.
**Motion**: 140 ms transitions; the penalty tiles and the podium rise in once. The
focus-mode fade is 150 ms. With `prefers-reduced-motion`: no countdown burst or bar races;
colours still change.
**Tap targets**: 44 × 44 px minimum; penalty tiles 64 px. Exception: the dense race layout
(header buttons, standings rows, tabs, chat input, penalty chips, the scramble's Reset) uses
28–36 px controls, marked `data-dense`; the screenshot checker holds those to 28 px.

## Breakpoints

| Name | Rule | Examples |
| --- | --- | --- |
| phone | default | 360×740, 390×844 |
| landscape | `orientation: landscape` and height ≤ 500 | 844×390 |
| wide | width ≥ 768 and height > 500 | 768×1024, 1024×768, 1366×768, 1920×1080 |

The home page goes two-column from 960 px. Room content is capped at 1600 px; the sidebar is
340 px (360 px from 1440 px).

## Screens

**Home.** Header: logo, "2 racing now", theme button. Then straight to racing: the **race
card**: your avatar + nickname, **Pick your puzzle** (all 17 events as tiles in a sideways
strip, arrow keys work), `Race 3x3 now` (big blue), then `Create a room for friends` and a
code box with `Join`. Right column (below on phones): the **Daily** card, then **Open
rooms**: cards with the event, name, `PIN` tag, code and event, format, Best of, players and
`Racing` (orange, with an orange left edge) or `In lobby`. A one-line timer hint in the footer.

**Room shell** (all room screens): a frosted header, 48 px (56 px wide).
- Left: logo (wide), event pill ("3x3x3" with its WCA icon; "3x3" on phones), room code
  pill (tap copies the link, shows "Copied" in green), format "ao5, Best of 3".
- Right: live status pill in mono ("3/5 Solved", "6 players", "Set 2 done", "Match over"),
  the word "offline" while disconnected, `Menu`.
- The Menu starts with the room name, code / PIN and `Copy link`, then smart cube, streamer
  overlay, preferences, keyboard shortcuts (as keycaps) and `Leave room`.
- Slim banners under the header (reconnecting, server notice, errors); never a modal.

**Lobby**
- phone: one column: share card, racers, chat, settings. A frosted bar pinned to the bottom.
- wide: two columns: left = share card + settings, right = racers + chat. The bottom bar
  floats as a pill.
- Share card: event, room name, summary ("3x3, ao5, Best of 3"), Public/Private tag, the
  **room code as six letter tiles** (large while you're alone), the PIN, `Copy link` (primary while alone) and `Share`
  (phones with a share sheet).
- **Racers**: a card per player (avatar, "host" and "you" tags, "reconnecting", Kick for the
  host). Alone, an empty dashed seat says "Waiting for a racer…".
- Settings (host): **Puzzle** (the event tile grid), **Format** (format, Best of until the
  first race, scoring), **Room** (name, who can join, PIN, more options).
- The bottom bar: alone, "Waiting for someone to join" + `Practise alone`;
  when someone joins, an orange ring with the seconds, "Race starts in 3" and `Start now`
  for the host, while a big **3, 2, 1, GO** shows in the middle of the screen (it never
  takes taps); after a match, `Start`.

**Match** (solving / review / set result / match over)
- **Scramble card**: header "Scramble 20 moves" and the round on the right ("Set 2, solve 3
  of 5"). The 2D preview sits in its right corner (92 / 140 / 168 px). Long scrambles (5x5 and up,
  megaminx) put it underneath when the card is under 480 px wide.
- **Keep your place**: tap a move to tick off everything up to it while you scramble (ticked
  moves dim, the next one is highlighted; "8/20" and `Reset` in the header). A new scramble
  starts at 0.
- **Timer pad**: a plain card with the digits: red while you hold (a bar under them fills in
  300 ms), green when ready. Hints: "Space Hold to get ready" (touch: "Hold the timer
  to get ready"), "Hold…", "Release to start". After a solve: three penalty tiles that show
  what the time becomes (`OK 11.87`, `+2 13.87+`, `DNF (11.87)`) with 1 / 2 / 3 keycaps,
  and "Sends as OK in 5 s" with a bar. A tile only counts a click if the press started on it
  (finger, mouse, or Enter / Space while focused): on phones the tap that stops the timer
  lands where the tiles appear, and must never pick DNF or +2. Repeated keys from a held key
  are ignored too.
- **Session strip** under the pad: solves, best, ao5, ao12, mean (the current ao5 / ao12,
  like csTimer). A new session best single or ao5 turns its cell green with a "new best"
  badge. Landscape phones have no room: the stats are in the sidebar there.
- wide: stage on the left; the sidebar on the right with **Live Standings** (at most 58% of
  the height, scrolls, header row sticky) above **Room Chat** (the rest).
- landscape: stage 2/3, sidebar 1/3 with `Standings | Chat` tabs.
- phone: stage full screen; the sidebar is a bottom sheet (grabber, "Room (6)", summary,
  unread badge) with the same tabs. Opening it blurs the stage behind; tap there to close.
- Focus mode: from holding the timer until the solve ends, the header, scramble, limit bar,
  banners, session strip, sidebar and sheet fade to opacity 0 (150 ms), and the pad loses its
  card. Only the digits, the hold bar, the hint and "reconnecting" (when offline) stay.
- Review / set result / match over replace the timer in the stage; the standings stay.

**Live Standings** (dense table, 38 px rows, mono numbers): `#` (rank badge; gold, silver,
bronze once they have points), Player (avatar, name, crown icon for the host), this solve
("Solve 3", or "Time" for single), `ao5`/`ao12`, `Pts` (a blue pill once above 0). Your row
has the accent tint and a 3 px accent bar. The current-solve cell shows the time, or what the
player is doing (an orange live clock in tenths, `offline`, `watching`, `left`, `–`). A
"Waiting for…" line above. Tap a row for that player's whole set: dropped times in parentheses;
your own times can be tapped to change the penalty (only while that set is running).

**Room Chat**: "Room Chat" + "N online". A feed of `14:02 Name text` lines, every name in its
player's colour (yours in blue), and muted system notices ("Anu joined the room", "Nomin
submitted 9.12", "Set 2 started", "Nomin wins set 1"). A pill input with a round send button:
Enter or tap; Escape leaves the input so the spacebar works for the timer again. 200
characters per message, 5 quick messages then one per 2 s; the server keeps the last 100
lines for people who join later. The feed follows new lines unless you scrolled up.

**Results**
- **Finish line** (after each solve): one lane per player: rank (gold for the winner),
  avatar and name, a track ending in a **checkered flag**, the bar (green for the winner,
  blue for you, grey for others, a red stub for DNF) with a **runner** in the player's colour
  at its front, then the time and "+gap". Bars run 0.9 s linear to `fastest / time`, so each
  one moves at its player's speed. Lanes are buttons: tap one to pick who to react to.
- **Set result**: "Set 2 result" + the winner, a small **podium** (2nd, 1st, 3rd; "+1 pt"
  under the winner), then the full table (avatar names).
- **Match over**: "Match over, 2–1", "You win the match!" / "Nomin wins the match", a large
  podium with points and sets won, a card with `Share result card` and the host's `Next
  event` + `Back to lobby` / `Rematch`, then places 4 and below in a table.
- Handicap: set result adds `pace` and `vs pace` ("−6.1%" green = faster than pace); the
  first set is headed "Pace set done".

**Extras**
- Reactions: 🔥 👏 😮 😂 in a tray (44 px round buttons); they float up 32 px from the row
  for 1.6 s and appear in the chat as a muted line.
- Daily page: one column (max 680 px), the same header as home. new = rules + avatar and
  nickname + `Start my attempt`; started = scramble card, a "8:42 left to solve" pill
  (yellow under a minute), the timer (focus mode like a race); done = big result, rank badge
  "#4 of 348 today", **Top 2%** and a bar of how many you beat, `Share my result`; then the
  leaderboard (medals for the top 3, avatars, your row
  added at the bottom if you're below).
- PIN, nickname and "room not found": a centred card with the logo.
- Streamer overlay: a 420 px panel on a transparent page, mono rows 36 px.
- Share card: 1200×630, dark theme colours, the six faces as a stripe on top, winners in
  gold, top 5 with best set result and points.
- Smart cube: a Menu section; a tiny accent 3x3 icon on a solver's row while their cube
  streams; the expanded row shows the live cube (132 px).

## Components

`ui.tsx`: `Icon` (inline line icons, used sparingly on buttons), `Avatar`, `LogoMark`,
`Brand`, `ThemeButton`, `EventIcon`, `Segmented`, `ProgressBar`.
`TopBar`, `Menu`, `ConfirmButton` (second tap instead of a dialog; turns red when armed),
`ChatPanel`, `SideTabs`, `EventPicker` (tiles: strip or grid), `EventSelect` (compact menu),
`SettingsForm`, `PlayerList` (seats or a compact list), `ScrambleText` / `ScrambleBlock`
(move tracking), `ScramblePreview` (2D, tap for 3D, hideable), `Timer` (digits, hold
meter, `PenaltyChoices`, type-in), `Standings`, `RoundPips` (the "Set 2, solve 3 of 5"
label), `SessionStrip`, `FinishLine`,
`Podium`, `SetResult`, `MatchOver`, `HostPanel`, `SessionPanel`, `RoomView` (layout; pure
props, used by the real room and by `/dev/states`).

## Cuber conventions

`9.87`, `1:02.34`, `+2` shows the total with a plus (`11.87+`), `DNF` with the time on
hover/tap (`DNF (9.87)`). Complete ao5/ao12 rows show the dropped best and worst in
parentheses, muted. Labels: `ao5`, `ao12`, `best`. Short event names where space is tight
(`3x3`, `OH`, `Pyra`, `SQ1`, `3BLD`). Moves never break across lines; long scrambles step
the font down; megaminx keeps its 7 lines.
