# Cube Racing UI design

A tool for cubers glancing at a phone between solves. Dense, precise, quiet.
Reference points: csTimer (timer focus), WCA Live (results tables).

## Tokens

All tokens are CSS custom properties in `client/src/styles.css`.
Theme: follows the system, with a manual override (`<html data-theme="light|dark">`).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #f7f7f8 | #121316 | page |
| `--surface` | #ffffff | #1a1b1f | panels, table |
| `--surface-2` | #f0f0f2 | #23242a | header rows, current column, inputs |
| `--border` | #e2e2e6 | #2e3037 | 1 px lines |
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

**Spacing** 4 / 8 / 12 / 16 / 24. **Radii** 6 px (buttons, inputs), 8 px (panels). Nothing pill-shaped.
**Elevation**: borders only; the menu dropdown gets one small shadow.
**Motion**: 120 ms colour/transform transitions; none during a running solve; off with
`prefers-reduced-motion`.
**Tap targets**: 44 × 44 px minimum; penalty buttons 56 px tall.

## Breakpoints

| Name | Rule | Examples |
| --- | --- | --- |
| phone | default | 360×740, 390×844 |
| landscape | `orientation: landscape` and height ≤ 500 | 844×390 |
| wide | width ≥ 768 and height > 500 | 768×1024, 1024×768, 1366×768, 1920×1080 |

Content is capped at 1440 px wide.

## Screens

**Home** (all widths: one centred column, max 400 px). Top-right theme button. Name, one line
of what it is, nickname, `Create room`, then `Join with code` (code field + Join).
Fits a 360×740 screen without scrolling.

**Create room.** Same column (max 560 px). Event grid with WCA icons (4 per row on phone,
6 on wide), then Format / Win condition / Time limit as segmented controls, Max players.
Defaults 3x3 · ao5 · Best of 3, so one tap on `Create room` is enough.

**Room shell** (all room screens): top bar 48 px: room code (tap copies link, shows
"Copied"), settings summary "3x3 · ao5 · Best of 3", connection dot, `Menu`.
Slim banners under it (reconnecting, server notice, errors); never a modal.

**Lobby**
- phone: one column. Alone: big room code + `Copy link` first. Then players, then
  settings (host edits, others see the summary), then `Start` (host), pinned to the bottom.
- wide: two columns: left = share block + settings, right = players + Start.

**Match** (solving / review / set result / match over)
- phone: stage = scramble (full width, preview below it, collapsible) then the timer
  filling the rest (`100dvh`, safe-area insets). Standings in a bottom sheet behind a
  `Room (N)` handle; the handle hides while the timer runs, and the sheet closes when you
  start holding.
- landscape: stage on the left 2/3, compact standings (name, this solve, average, points)
  on the right 1/3.
- wide: stage on the left; room panel on the right (standings, waiting line, host tools,
  session stats). The panel is 45% of the width (56% from 1000 px, max 580 px), or 884 px
  for ao12 from 1280 px, so the whole table fits on desktop.
- Scramble preview: beside the scramble, at most a third of its width (96 / 200 / 240 px).
  Long scrambles (5x5 and up, megaminx) put it underneath on narrow screens so the text
  keeps the full width.
- Timer running = focus mode: only the digits (and a reconnecting dot) remain visible.
- Review / set result / match over replace the timer in the stage; the standings stay.

## Components

`TopBar`, `Menu`, `ConfirmButton` (second tap instead of a dialog), (theme, running display, input mode, sound, preview, shortcuts, leave),
`Banner`, `EventIcon`, `EventPicker`, `Segmented`, `SettingsForm`, `ShareBlock`,
`PlayerList`, `ScrambleText`, `ScramblePreview` (2D, tap for 3D, hideable), `Timer`
(digits, hold/ready states, penalty bar, type-in), `ProgressBar`, `Standings` (full and
compact), `WaitingLine`, `SolveReview`, `SetResult`, `MatchOver`, `HostPanel`,
`SessionStats`, `RoomView` (layout; pure props, used by the real room and by `/dev/states`).

## Cuber conventions

`9.87`, `1:02.34`, `+2` shows the total with a plus (`11.87+`), `DNF` with the time on
hover/tap (`DNF (9.87)`). Complete ao5/ao12 rows show the dropped best and worst in
parentheses, muted. Labels: `ao5`, `ao12`, `best`. Moves never break across lines;
long scrambles step the font down; megaminx keeps its 7 lines.
