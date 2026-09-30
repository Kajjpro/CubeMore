# Cube Racing UI design

A tool for cubers glancing at a phone between solves. Dense, precise, quiet.
Reference points: csTimer (timer focus), WCA Live (results tables).

## Tokens

All tokens are CSS custom properties in `client/src/styles.css`.
Theme: dark by default (the race page is designed dark-first); Light and System are in the Menu
(`<html data-theme="light|dark">`, System removes the attribute).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #f7f7f8 | #121316 | page |
| `--surface` | #ffffff | #1a1b1f | panels, table |
| `--surface-2` | #f0f0f2 | #23242a | header rows, current column, inputs |
| `--border` | #e2e2e6 | #262830 | 1 px lines |
| `--text` | #18181b | #ececf0 | main text |
| `--text-2` | #52525b | #b4b4bd | secondary text |
| `--muted` | #6b6b75 | #8f909b | dropped times, spectators, labels (AA on bg) |
| `--accent` | #2459a8 | #7aa7ec | primary buttons, focus ring, own row, links |
| `--accent-soft` | #e8eef8 | #1d2940 | own row background |
| `--green` / `--green-soft` | #1a7f37 / #e6f4ea | #4cc26b / #15291c | timer ready, fastest time |
| `--red` / `--red-soft` | #c4232f / #fbe9ea | #f06b73 / #33191b | DNF, errors, timer holding |
| `--amber` / `--amber-soft` | #8a5700 / #fbf1dd | #e0a940 / #332710 | +2, reconnecting |

Status colours always come with text ("DNF", "+", "reconnecting", "best").
The accent is a restrained blue: never green or red, not indigo/purple.

**Type.** UI uses the system stack. Times, codes and scrambles use JetBrains Mono (self-hosted
via @fontsource) with `tabular-nums` and ligatures off (megaminx `++`/`--` must not merge).
Scale: 12 / 13 / 14 (base) / 16 / 20 / 24 / 32 px. Inputs are 16 px (no iOS zoom).
Timer: `min(22cqi, 38cqh, 10rem)`; "9:59.99" fits a 360 px screen on one line.

**Spacing** 4 / 8 / 12 / 16 / 24. **Radii** 6 px everywhere (`--radius`). Nothing pill-shaped
(the unread badge is the one round thing).
**Elevation**: borders only; the menu dropdown gets one small shadow.
**Motion**: 120 ms colour/transform transitions; the focus-mode fade is 150 ms opacity;
both off with `prefers-reduced-motion`.
**Tap targets**: 44 × 44 px minimum; penalty buttons 56 px tall. Exception: the dense race
layout (header buttons, standings rows, tabs, chat input, penalty chips) uses 28–32 px
controls, marked `data-dense`; the screenshot checker holds those to 28 px.

## Breakpoints

| Name | Rule | Examples |
| --- | --- | --- |
| phone | default | 360×740, 390×844 |
| landscape | `orientation: landscape` and height ≤ 500 | 844×390 |
| wide | width ≥ 768 and height > 500 | 768×1024, 1024×768, 1366×768, 1920×1080 |

Content is capped at 1440 px wide.

## Screens

**Home.** Top-right theme button. Left: one line of what it is, nickname, `Create room`
(one tap: the room is made with the defaults and you're in), `Join with code`, how a race
works. Right (below on phones): **Rooms**, every open room, public and private: event
icon, name, a `PIN` tag for private rooms, then code · event · format · Best of · players
· racing, and `Join`. Private rooms ask for the PIN on the room page.

**Room shell** (all room screens): a 40 px header.
- Left: event badge ("3x3x3", with its WCA icon), room code (tap copies the link, shows
  "Copied"), format "ao5 · Best of 3". Phones (≤ 600 px) show "3x3" and "ao5 · Bo3".
- Right: live status in mono ("3/5 Solved" while solving, "6 players" in the lobby,
  "Set 2 done", "Match over"), connection dot, `Menu`.
- The Menu starts with the room name, code / PIN and `Copy link`, then the preferences.
- Slim banners under the header (reconnecting, server notice, errors); never a modal.

**Lobby**
- phone: one column. Alone: big room code + `Copy link` first. Then players, the room
  chat, then settings (host edits, others see the summary). A bar pinned to the bottom.
- wide: two columns: left = share block + settings, right = players + room chat.
- Host settings: room name, who can join (`Everyone` / `With PIN`, with an editable
  PIN), event, format, Best of (until the first race, then shown as fixed), more options.
- The bottom bar: alone, "Waiting for someone to join" + `Practise alone`; when someone
  joins, "Race starts in 3" (accent) + `Start now` for the host; after a match, `Start`.

**Match** (solving / review / set result / match over)
- Scramble box: full width, 1 px border, surface background, JetBrains Mono. The 2D
  preview sits inside its right corner (88 / 136 / 160 px). Long scrambles (5x5 and up,
  megaminx) put it underneath when the box is under 480 px so the text keeps the width.
- Timer: centred, digits `clamp()`-sized. Hints: "Hold spacebar to ready" (touch: "Hold
  the timer to ready"), "Hold…" (red digits), "Release to start" (green). After a solve:
  `OK` `+2` `DNF` with a thin 5 s bar; it sends as OK when the bar runs out.
- wide: stage on the left; a 320 px sidebar on the right with two panels:
  **Live Standings** (at most 55% of the height, scrolls, header row sticky) above
  **Room Chat** (the rest).
- landscape: stage 2/3, sidebar 1/3 with `Standings | Chat` tabs.
- phone: stage full screen; the sidebar is a bottom sheet behind a `Room (N)` handle with
  the same tabs. The handle shows an unread badge for chat messages from others.
- Focus mode: from holding the timer until the solve ends, the header, scramble, limit
  bar, banners, sidebar and sheet fade to opacity 0 (150 ms). Only the digits, the hold
  hint and a reconnecting dot stay.
- Review / set result / match over replace the timer in the stage; the standings stay.

**Live Standings** (dense table, 30 px rows, mono numbers): `#` (shared ranks by points),
Player, this solve ("Solve 3", or "Time" for single), `ao5`/`ao12`, `Pts`. Your row has
the accent tint and an accent bar. The current-solve cell shows the time, or what the
player is doing (`solving` with a pulsing dot, `offline`, `watching`, `left`, `–`).
Tap a row for that player's whole set: dropped times in parentheses; your own times can
be tapped to change the penalty (only while that set is running).

**Room Chat**: "Room Chat" + "N online". A feed of `14:02 Name text` lines and muted system
notices ("Anu joined the room", "Nomin submitted 9.12", "Set 2 started", "Nomin wins
set 1"), which the server adds by comparing room states. A slim input: Enter or `Send`;
Escape leaves the input so the spacebar works for the timer again. 200 characters per
message, 5 quick messages then one per 2 s; the server keeps the last 100 lines for
people who join later. The feed follows new lines unless you scrolled up.

**Extras**
- Live clocks: an opponent's running time in the "this solve" cell, accent, with a pulsing
  dot and tenths only ("7.4"), so it never reads as a final time.
- Finish line (replaces the solve review): rows are buttons (tap to pick who to react to);
  the track ends in a 2 px finish line; bars run 0.9 s linear to `fastest / time`; the
  time and "+gap" fade in after. Reduced motion: no animation.
- Reactions: 🔥 👏 😮 😂 in a tray (44 px buttons); they float up 26 px from the row for
  1.6 s and appear in the chat as a muted line.
- Handicap: set result adds `pace` and `vs pace` ("−6.1%" green = faster than pace);
  the first set is headed "Pace set done".
- Home: `Race now` (event menu + primary button) first, `Create a room for friends`
  second. Right column: the Daily card (accent border), then Rooms.
- Daily page: one column (max 640 px); new = rules + nickname + `Start my attempt`;
  started = scramble box, "8:42 left to solve", the timer (focus mode like a race);
  done = big result, "#12 of 348 today", `Share my result`; then the leaderboard
  (top 20, your row added at the bottom if you're below).
- Streamer overlay: a 420 px panel on a transparent page, mono rows 34 px.
- Share card: 1200×630, dark theme colours, top 5 with best set result and points.
- Smart cube: a Menu section; a tiny accent 3x3 icon on a solver's row while their cube
  streams; the expanded row shows the live cube (132 px).

## Components

`TopBar`, `Menu` (room, theme, running display, input mode, sound, preview, shortcuts,
leave), `ConfirmButton` (second tap instead of a dialog), `ChatPanel`, `SideTabs`,
`Banner`, `EventIcon`, `EventPicker`, `Segmented`, `SettingsForm`, `ShareBlock`,
`PlayerList`, `ScrambleText`, `ScramblePreview` (2D, tap for 3D, hideable), `Timer`
(digits, hold/ready states, penalty bar, type-in), `ProgressBar`, `Standings` (dense, tap a
row for the set), `WaitingLine`, `SolveReview`, `SetResult`, `MatchOver`, `HostPanel`,
`SessionStats`, `RoomView` (layout; pure props, used by the real room and by `/dev/states`).

## Cuber conventions

`9.87`, `1:02.34`, `+2` shows the total with a plus (`11.87+`), `DNF` with the time on
hover/tap (`DNF (9.87)`). Complete ao5/ao12 rows show the dropped best and worst in
parentheses, muted. Labels: `ao5`, `ao12`, `best`. Moves never break across lines;
long scrambles step the font down; megaminx keeps its 7 lines.
