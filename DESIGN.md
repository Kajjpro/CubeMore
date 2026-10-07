# Cubist UI design

A timer for racing other cubers, used on a phone between solves. Plain and quick: the
scramble, a big timer and the standings, nothing decorative. Reference points: csTimer
(timer focus, session stats) and WCA Live (results).

## The idea: calm, and the standings first

Feedback from real users: the old screens felt chaotic and hard to read, and the standings
felt unimportant. So:

- **Mostly black and white.** One accent colour, **blue**, for the one primary action on a
  screen (`Race now`, `Copy link` while alone) and for "you" (your row tint). Everything else
  is text, grey and borders.
- **Colour is only kept where cubers expect it**: the timer is red while you hold and green
  when ready (csTimer convention), and the scramble preview shows sticker colours. Player
  avatars keep their colour so you can tell people apart.
- **No status colours in results.** The fastest time is bold, DNF is grey, `+2` reads from
  its `+`. No gold, silver or bronze: first place is the one solid block (`--gold` is the
  text colour), 2nd and 3rd are grey. Opponents' running clocks are grey.
- **The standings are always on screen** during a race (see Match below).

Status still always comes as text ("DNF", "+", "reconnecting", "offline", "Racing").
No decorative dots, no "·" separators in text (use commas), no gradients or glows.

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

The home page's room cards go two-column from 960 px. Room content is capped at 1600 px; the sidebar is
340 px (360 px from 1440 px).

## Screens

**Home.** Header: logo (back home), "2 racing now" (hidden under 400 px), theme button,
`Sign in` (or the account button). The **open rooms are the hero**: "Open rooms" and one
sentence, `+ Create a room` (the only blue button) and a code box with `Join`; a slim
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
- Slim banners under the header (reconnecting, server notice, errors); never a modal.

**New room.** *Setup* (host only, nothing else can reach it): "Set up your room", the full
settings form, and a bottom bar with `Cancel`, the summary and `Open room` (blue). Then, alone,
the *warm-up*: the invite card (name, summary, Public/Private, code and PIN for private rooms,
`Copy link` / `Share`, "Race settings" folded away), a warm-up scramble ("Warm-up, doesn't count")
and timer, your last warm-up times with ao5 / ao12, and the chat (two columns from 960 px: warm-up
left). Someone joining mid-solve: "Anu joined. The race starts when you stop the timer."
In a mixed room, a newcomer gets a *Pick your event* card over the lobby (the event tiles,
`Ready with Pyra`); everyone else's start bar says "Waiting for Bilguun to pick an event".

**Under the timer** in a race: a slim row with `Timer | Type in` (mini toggle) and `Watch`
(tap twice mid-set: the rest of the set is DNF). On phones, typing a time is one row (box +
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
  300 ms), green when ready. Hints: "Space Hold to get ready" (touch: "Hold the timer
  to get ready"), "Hold…", "Release to start". After a solve the whole room blurs and the
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
- phone: the **standings card sits right under the timer** (up to 36% of the height,
  scrolls), so you always see where you stand. The bottom sheet ("Chat and stats", unread
  badge) holds `Chat | Your stats | Host` tabs. Opening it blurs the stage behind.
- Focus mode: from holding the timer until the solve ends, the header, scramble, limit bar,
  banners, session strip, standings, sidebar and sheet fade to opacity 0 (150 ms), and the pad loses its
  card. Only the digits, the hold bar, the hint and "reconnecting" (when offline) stay.
- Review / set result / match over replace the timer in the stage; the standings stay.
- **Watching** (stepped away, from the Menu): during a solve the stage says "Watching" with a
  blue `Race again`; between solves, a one-line "You're watching" bar on top of the stage
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
player's colour (yours in blue), and muted system notices ("Anu joined the room", "Nomin
submitted 9.12", "Set 2 started", "Nomin wins set 1"). A pill input with a round send button:
Enter or tap; Escape leaves the input so the spacebar works for the timer again. 200
characters per message, 5 quick messages then one per 2 s; the server keeps the last 100
lines for people who join later. The feed follows new lines unless you scrolled up.

**Results**
- **Finish line** (after each solve, when the room has review time): one lane per player:
  rank, avatar and name, a track ending in a **checkered flag**, the bar (dark for the winner,
  blue for you, grey for others, a short grey stub for DNF) with a **runner** in the player's colour
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
