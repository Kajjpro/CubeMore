# CubeMore UI design

A timer for racing other cubers, used on a phone between solves. Plain and quick: the
scramble, a big timer and the standings, nothing decorative. Reference points: csTimer
(timer focus, session stats) and WCA Live (results).

## The idea: calm, and the standings first

Feedback from real users: the old screens felt chaotic and hard to read, and the standings
felt unimportant. Later: the colours felt generic ("AI-made": blue-tinted dark greys and a
stock blue), some buttons were hard to see, and on phones the timer was too small to hit.
So:

- **Mostly black and white.** Plain greys (no blue tint) and one accent colour from the
  cube, **orange**, for the one primary action on a screen (`Create a room`, `Start`,
  `Rematch`) and for "you" (your row tint, your name in the chat). Orange buttons carry dark
  text (white on orange is hard to read). Everything else is text, grey and borders.
- **Every button looks like one**: a fill and a visible edge (`--btn`, `--btn-border`) on
  every surface, text in the full text colour. Quiet buttons are for close and cancel only.
  A chosen option (segmented controls, tabs) is raised in plain colours; the chosen event is
  the one solid tile. Orange never marks a selection.
- **Colour is only kept where cubers expect it**: the timer is red while you hold and green
  when ready (csTimer convention), and the scramble preview shows sticker colours. Player
  avatars keep their colour so you can tell people apart.
- **No status colours in results.** The fastest time is bold, DNF is grey, `+2` reads from
  its `+`. No gold, silver or bronze: first place is the one solid block (`--gold` is the
  text colour), 2nd and 3rd are grey. Opponents' running clocks are grey.
- **The standings are a tap away on phones, always on screen on bigger screens.** Phones
  get a big timer pad; `Standings` at the bottom shows or hides everyone's times under it
  (your choice, remembered). See Match below.

Status still always comes as text ("DNF", "+", "reconnecting", "offline", "Racing").
No decorative dots, no "·" separators in text (use commas), no gradients, glows or frosted
glass.

## Tokens

All tokens are CSS custom properties at the top of `client/src/styles.css`.
Theme: dark by default (the race page is designed dark-first); Light and System are in the
Menu and the theme button (`<html data-theme="light|dark">`, System removes the attribute).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #f4f3ef | #0c0c0d | page (flat) |
| `--surface` | #ffffff | #151517 | cards, panels |
| `--surface-2` / `-3` | #f0efea / #e6e4de | #1d1d20 / #27272b | inputs, rows, tracks, hover |
| `--btn` / `--btn-border` | #ffffff / #a9a59b | #29292e / #4a4a52 | every button: a fill and an edge you can see |
| `--border` / `-strong` | #dfddd6 / #c3c0b7 | #2a2a2f / #3c3c43 | 1 px lines (inputs use the strong one) |
| `--text` / `--text-2` / `--muted` | #161513 / #46433d / #6b675f | #f4f4f2 / #c6c6cb / #93939b | text (muted is AA on every surface) |
| `--accent` / `--accent-bg` / `--on-accent` | #b83f0a / #ff6b1a / #1a0a00 | #ff8a3d / #ff6b1a / #1a0a00 | orange text and lines / orange fills / the dark text on them (6.8:1) |
| `--green` `--red` `--amber` `--orange` | darker tones | brighter tones | the faces as status; each has a `-soft` background (`--orange` is the accent) |
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

The home page's room cards go two-column from 960 px. Room content is capped at 1600 px; the sidebar is
340 px (360 px from 1440 px).

## Screens

**Home.** Header: logo (back home), "2 racing now" (hidden under 400 px), theme button,
`Sign in` (or the account button). The **open rooms are the hero**: "Open rooms" and one
sentence, `+ Create a room` (the only orange button) and a code box with `Join`; a slim
"Racing as" bar (avatar + nickname box for guests, the username once signed in) with the
guest hint under it; then **Public | Private** tabs, each with a count. Room cards (two
columns from 960 px): event icon, name, `PIN` tag (private rooms also show their code),
event, format, Best of, players and `Racing` or `In lobby`, a plain `Join`. Each tab has its
own empty state. Below: the **Daily** and **Contact** cards side by side, smart cube
racing, a one-line timer hint, and the footer (Daily scramble, Contact, social links, ©).

**Contact** (`/contact`): name, email (to reply), message (10-2000 characters), `Send
message`; a thank-you with `Send another` / `Back to the races`. With an email or social
links in `client/src/site.ts`, they show in a side panel (two columns from 960 px).
**Admin** (`/admin`, the site owner only): the messages, newest first, with `Reply`
(opens an email) and `Delete`.

**Room shell** (all room screens): a frosted header, 48 px (56 px wide).
- Left: logo (wide), event pill ("3x3x3" with its WCA icon; "3x3" on phones), room code
  pill (tap copies the link, shows "Copied"; public rooms show "Link" instead of a code),
  format "ao5, Best of 3".
- Right: live status pill in mono ("3/5 Solved", "6 players", "Set 2 done", "Match over"),
  the word "offline" while disconnected, `Menu`.
- The Menu starts with the room name, code / PIN and `Copy link`, then smart cube, streamer
  overlay, preferences, keyboard shortcuts (as keycaps) and `Leave room`.
- **The call** sits in the header between the format and the status pill: the faces of
  everyone in it (a green ring while they talk, a crossed mic when muted, their team's square
  in a team match), then buttons that always say what they are, by their state: `Mic on` /
  `Muted` (red while muted, so nobody talks into a muted mic; M toggles it), `Camera off` /
  `Camera on` (green while on, so you know they see you), `Everyone` / `Team only` (team
  matches), `Settings` (a gear, always there) and `Leave` (red). Not in the call: "Voice chat"
  (or the faces of who's in it), `Join voice` (orange when someone's waiting) and
  `With camera`. From 1100 px the word sits next to the icon; below that it sits under it,
  small (never an icon alone). Names show from 1200 px. On phones and upright tablets (up to
  900 px) the header wraps and the call is its own full-width row; on phones up to 480 px the
  team button moves into Settings. Like the rest of the header, it fades while you solve.
- **Call settings** (the gear): a panel dropping from the bar (floating over the stage on
  phones): `Microphone` and `Camera` lists (remembered for next time; the camera switches
  live), `Who hears you` (`Everyone | Blue team only`, team matches), `People in the call`
  with `Mute for me` for each (only you stop hearing them), and the M shortcut.
- Slim banners under the header (reconnecting, server notice, errors); never a modal.

**New room.** *Setup* (host only, nothing else can reach it): "Set up your room", the full
settings form, and a bottom bar with `Cancel`, the summary and `Open room` (orange). Then, alone,
the *warm-up*: the invite card (name, summary, Public/Private, code and PIN for private rooms,
`Copy link` / `Share`, "Race settings" folded away), a warm-up scramble ("Warm-up, doesn't count")
and timer, your last warm-up times with ao5 / ao12, and the chat (two columns from 960 px: warm-up
left). Someone joining mid-solve: "Anu joined. The race starts when you stop the timer."
**Team matches.** Blue and Red, the cube's colours, shown only as a small square next to the
team's name (the name is always written). Lobby: a column per team (a 3 px top edge in its
colour; yours has the accent border and a "you" tag), each with `Join`; under them `Just watch`
and, for the host, `Balance teams`. During the match: the score above the standings
("Blue 1 – 0 Red", the leader bold, "Solve 2: Red by 0.61, first to 2 wins"), and the
standings grouped by team: a grey team row (its time for each solve, its average, its points)
above its players. Set result: a team table, then everyone's results. Match over: the two
teams side by side, the winners' card the solid one with "Winner".
In a mixed room, a newcomer gets a *Pick your event* card over the lobby (the event tiles,
`Ready with Pyra`); everyone else's start bar says "Waiting for Bilguun to pick an event".

**Your set** under the timer (solving and review, once you have a time in the set): "YOUR SET"
and a chip per solve (`1 11.87+`, `2 10.42`, a dashed `3 –` for the one you're on; dropped
times of a complete ao5 in brackets; an ao12 scrolls sideways). Your own submitted times are
buttons: tap one for `OK 9.87 | +2 11.87+ | DNF (9.87)` and a close button (one line on phones).
Penalties can change until the set result shows (the server enforces it); times never change.
The same edit is still in your standings row.

**Under the timer** in a race: a slim row with `Timer | Type in` (mini toggle) and `Watch`
with an eye (a real button; tap twice mid-set: the rest of the set is DNF). On phones, typing a time is one row (box +
Submit; the label and help stay for screen readers).

**Lobby**
- phone: one column: share card, racers, chat, settings. A frosted bar pinned to the bottom.
- wide: two columns: left = share card + settings, right = racers + chat. The bottom bar
  floats as a pill.
- Share card: event, room name, summary ("3x3, ao5, Best of 3"), Public/Private tag, the
  room code as six letter tiles and the PIN (**private rooms only**: a public room is on the
  home page, so it shows no code), `Copy link` (primary while alone) and `Share`
  (phones with a share sheet).
- **Racers**: a card per player (avatar, "host" and "you" tags, "reconnecting", Kick for the
  host). Alone, an empty dashed seat says "Waiting for a racer…". In a mixed room, a
  "Your event" tile row (2x2, Pyra, Skewb, Clock) sits above the cards, and every card has
  its player's event tag.
- Settings (host): **Puzzle** (`One event | Mixed`, then the event tile grid and timing for
  one event), **Format** (format, Best of until the first race, scoring), **Room** (name,
  who can join, PIN, more options).
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
  300 ms), green when ready. Hints: "Space Hold to get ready" (touch: "Hold anywhere here
  to get ready"), "Hold…", "Release to start". Starting takes a hold on the pad; **stopping
  takes a touch anywhere on the screen** (the end of a solve is a quick slap, and it often
  lands outside the pad; in a race nothing else is on screen then). The pad has
  `touch-action: none`: a resting finger drifts while it holds, and a browser scroll would
  cancel the touch so the timer never starts. On phones the pad's foot
  shows your session: "best 9.54  ao5 10.59  ao12 –" (hidden while you solve and when the pad
  is under 230 px tall). After a solve the whole room blurs and the
  time sits in the middle over three plain penalty tiles that show what the time becomes
  (`OK 11.87`, `+2 13.87+`, `DNF (11.87)`) with 1 / 2 / 3 keycaps, and "Counts as OK in
  5 s" with a grey bar. A tile only counts a click if the press started on it
  (finger, mouse, or Enter / Space while focused): on phones the tap that stops the timer
  lands where the tiles appear, and must never pick DNF or +2. Repeated keys from a held key
  are ignored too.
- **Session strip** under the pad (wide only): solves, best, ao5, ao12, mean (the current
  ao5 / ao12, like csTimer). A new session best single or ao5 gets a dark border and a "new
  best" badge.
- wide: stage on the left; on the right a **wide standings column** (`clamp(380px, 36vw,
  540px)`, full height) with `Standings | Chat` tabs, Standings open. Rows are 46 px with
  15 px text. The host controls sit under the table.
- landscape: stage 2/3, sidebar 1/3 with the same tabs (plus your session stats).
- phone: the timer pad takes the room, and a **bar at the bottom** holds `Standings` with the
  live count ("2/6", solving and review only), `Chat` (unread badge) and, for the host, `Host`.
  `Standings` shows or hides the standings card under the timer (up to 36% of the height,
  scrolls; the pad keeps at least 160 px); it stays pressed while they're shown, and the
  choice is remembered (`showStandings`, off by default). `Chat` and `Host` open a sheet over
  the stage with `Chat | Your stats | Host` tabs and a round close button; closed, the sheet
  is fully away.
- Focus mode: from holding the timer until the solve ends, the header, scramble, limit bar,
  banners, session strip, standings, sidebar, bottom bar and sheet fade to opacity 0 (150 ms), and the pad loses its
  card. Only the digits, the hold bar, the hint and "reconnecting" (when offline) stay.
- Review / set result / match over replace the timer in the stage; the standings stay.
- **Watching** (stepped away, from the Menu): during a solve the stage says "Watching" with an
  orange `Race again`; between solves, a one-line "You're watching" bar on top of the stage
  with `Race again`. Their standings row says "watching". In the lobby, your card has
  `Just watch` / `Race`, watchers get a grey "watching" tag and a faded avatar, and the
  start bar says "2 racing, 2 watching".

**Live Standings** (table, mono numbers): `#` (plain number; rank 1 is darker once they have
points), Player (avatar, name; in a mixed race their event icon), one column per solve
(`1 2 3 4 5`; "Time" for single), `ao5`/`ao12`, `Pts` (bold; grey at 0). In each solve
column the fastest is bold; once a row is complete its best and worst are grey in brackets.
The current solve's column has a faint tint, and its cell shows the time or what the
player is doing (a grey live clock in tenths, `offline`, `watching`, `left`, `–`); later
solves are empty. Your row has the accent tint and a 3 px accent bar. As many solve columns
show as fit (at most 5; the current solve and the ones before it), measured before paint, so
the table never scrolls sideways: short events show all 5 even at 360 px, 3x3 times 4 there,
and an ao12 always shows a window of 5. To make room, rows with solve columns drop the host
crown and the "more" chevron, and phones (portrait standings, landscape sidebar) drop the
`#` column (your accent bar moves to the name). A "Waiting for…" line above. Tap a row for
that player's whole set: dropped times in parentheses; your own times can be tapped to change
the penalty (only while that set is running).

**Room Chat**: "Room Chat" + "N online". A feed of `14:02 Name text` lines, every name in its
player's colour (yours in orange), and muted system notices ("Anu joined the room", "Nomin
submitted 9.12", "Set 2 started", "Nomin wins set 1"). A pill input with a round send button:
Enter or tap; Escape leaves the input so the spacebar works for the timer again. 200
characters per message, 5 quick messages then one per 2 s; the server keeps the last 100
lines for people who join later. The feed follows new lines unless you scrolled up.

**Results**
- **Finish line** (after each solve, when the room has review time): one lane per player:
  rank, avatar and name, a track ending in a **checkered flag**, the bar (dark for the winner,
  orange for you, grey for others, a short grey stub for DNF) with a **runner** in the player's colour
  at its front, then the time and "+gap". Bars run 0.9 s linear to `fastest / time`, so each
  one moves at its player's speed. Lanes are buttons: tap one to pick who to react to.
- **Set result**: "Set 2 result" + the winner, a small **podium** (2nd, 1st, 3rd; "+1 pt"
  under the winner), then the full table (avatar names).
- **Match over**: "Match over, 2–1", "You win the match!" / "Nomin wins the match", a large
  podium with points and sets won, a card with `Share result card` and the host's `Next
  event` + `Back to lobby` / `Rematch`, then places 4 and below in a table.
- Handicap: set result adds `pace` and `vs pace` ("−6.1%" = faster than pace); the
  first set is headed "Pace set done".

**Extras**
- Reactions: 🔥 👏 😮 😂 in a tray (44 px round buttons); they float up 32 px from the row
  for 1.6 s and appear in the chat as a muted line.
- Daily page: one column (max 680 px), the same header as home. new = rules + avatar and
  nickname + `Start my attempt`; started = scramble card, a "8:42 left to solve" pill
  (yellow under a minute), the timer (focus mode like a race); done = big result, rank badge
  "#4 of 348 today", **Top 2%** and a bar of how many you beat, `Share my result`; then the
  leaderboard (plain ranks, avatars, your row
  added at the bottom if you're below).
- PIN, nickname and "room not found": a centred card with the logo.
- Streamer overlay: a 420 px panel on a transparent page, mono rows 36 px.
- Share card: 1200×630, dark theme colours, the six faces as a stripe on top, winners in
  gold, top 5 with best set result and points.
- Smart cube: a Menu section; a tiny accent 3x3 icon on a solver's row while their cube
  streams; the expanded row shows the live cube (132 px).

**Analyzer** (`/analyze`). Title and one sentence, then tabs **Practice | Your sessions
(signed in) | Top solves**. Practice: a card with the cube connection and `Single | Average
of 5` (an ao5 shows five slots with the times); then the scramble (with the smart cube guide)
and a large timer. A finished solve shows its **report**: the time with moves, turns per
second and a level tag; one stage bar (each stage as wide as its time, the looking part
hatched, labels hidden when a part is too narrow); the replay cube (real timing, a stage
timeline you can tap, Start, Play, 0.5x/1x/2x) beside the stage table (Time, Looking,
Moves, TPS, Typical; slower than typical is bold, never coloured; TPS hidden under 480 px);
"What to practice" (numbered, the time it would save on the right, `Show on the cube`
opens the moves on a small cube); then three cards: Cross, OLL, PLL with their algorithms.
An ao5 adds the average, best/worst/spread, the five times (dropped ones in brackets),
"What to work on" (three items) and the average stage table. The coach card (signed in, and
only with `GEMINI_API_KEY`) comes last: plain sentences, a dash for each point, and a line
saying an AI wrote it. Orange is only the stage being replayed. No emoji anywhere.

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
props, used by the real room and by `/dev/states`). `CallBar`, `CallAudio` (Call.tsx);
`TeamSeats`, `TeamScoreboard`, `TeamSetResult`, `TeamFinal` (Teams.tsx).

## Cuber conventions

`9.87`, `1:02.34`, `+2` shows the total with a plus (`11.87+`), `DNF` with the time on
hover/tap (`DNF (9.87)`). Complete ao5/ao12 rows show the dropped best and worst in
parentheses, muted. Labels: `ao5`, `ao12`, `best`. Short event names where space is tight
(`3x3`, `OH`, `Pyra`, `SQ1`, `3BLD`). Moves never break across lines; long scrambles step
the font down; megaminx keeps its 7 lines.
