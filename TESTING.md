# Testing with friends: checklist

Do this after deploying (or locally with phones on the same Wi-Fi). Best with 3+ people,
at least one on a phone. Everyone can add `?debug=1` to the URL to see the connection,
latency, snapshot version and outbox size in the bottom-left corner.

## 1. Rooms

- [ ] Host: Home -> nickname -> **Create room**: you're in the room at once ("Waiting for someone to join").
- [ ] Host: **Copy link**, send it to friends. Opening the link asks for a nickname, then joins.
- [ ] Someone joins with the 6-character code instead (lowercase works too).
- [ ] Everyone's player list updates instantly; the host has the **Host** badge.
- [ ] Host changes a setting (event, format, time limit): everyone sees it at once.
- [ ] A non-host can't change settings (the fields are greyed out).
- [ ] Set max players below the number of people: "Max players can't be lower than…".

### Public and private rooms

- [ ] A new room appears in "Rooms" on another phone's home page with its code; Join works in one tap.
- [ ] Host switches **Who can join** to **With PIN**: a PIN appears (editable). The room stays in the list with a
      **PIN** tag; Join asks for the PIN; a wrong PIN is refused; the right one lets you in.
      The host's "Copy invite link" opens it directly.
- [ ] Try 11+ wrong PINs quickly: "Too many wrong PINs for this room".
- [ ] Refresh inside a private room: you're back without typing the PIN.
- [ ] A second player joins the lobby: both see "Race starts in 3", and the race starts by itself.
- [ ] Alone, the host can **Practise alone**; during the countdown **Start now** starts at once.
- [ ] Best of can be changed in the lobby before the first race; after a race it shows as fixed.
- [ ] During a match, host: Host panel > "Change event and restart": everyone gets the new event, points back to 0.
- [ ] After a match, host: pick "Next event" and Rematch.
- [ ] Join a public room that is racing (it says "racing"): you watch, then race from the next set.

## 2. Racing

- [ ] Host presses **Start**: everyone sees the same scramble and picture at the same moment, with a beep.
- [ ] Computer: hold **space**, the time turns red, then green after 0.3 s; let go to start; any key stops.
- [ ] Phone: same with a finger on the big timer area. The page must not scroll or zoom.
- [ ] Letting go before it's green does NOT start the timer.
- [ ] After stopping: **OK / +2 / DNF** (keys 1 / 2 / 3). Doing nothing sends OK after 5 s.
- [ ] While others solve: "Waiting for N players: …", their status shows *solving* / *done*.
- [ ] When everyone is done: 3 s review with everyone's times, then the next scramble.
- [ ] Someone switches to **Type in** and types `12.34`, `1:02.34`, `DNF`; `12.345` or `1:75` is refused.
- [ ] Tap one of your earlier times in the table and change it to +2 / DNF; the average updates at the set end.
- [ ] After 5 solves: averages, the set winner highlighted, points, a 6 s countdown.
- [ ] Check an average by hand: drop best and worst, average the other 3, truncate each time to hundredths.
- [ ] Someone reaches 2 points (bo3) with more points than everyone: **match over**, winner shown.
- [ ] Host: **Rematch** (points back to 0) and **Back to lobby** both work.
- [ ] Chat: a message from a phone shows on the computer at once, and the other way round.
- [ ] Chat notices appear: joins, match start, each submitted time, set and match winners.
- [ ] Phone: a message arrives while the sheet is closed -> an unread badge on `Room (N)`; opening the Chat tab clears it.
- [ ] Computer: type in the chat, press **Escape**, then hold space: the timer works (space in the chat box only types).
- [ ] Holding the timer fades out the header, scramble, standings and chat; they come back after the solve.
- [ ] Tap a player's row in the standings: their whole set shows; tap it again to close.

## 3. Things going wrong (the important part)

- [ ] **Refresh** the page in the middle of a solve: you're back in your seat, same set.
- [ ] Stop the timer, then **refresh before pressing OK**: after the reload your time is still sent
      (it's in the table), not lost.
- [ ] Turn a phone's **Wi-Fi off** for 10 s during a solve, then back on: others see *reconnecting*,
      then you're back; a time you stopped while offline is sent when you reconnect.
- [ ] Someone **closes their tab** mid-set and doesn't come back: after 30 s they're removed,
      their missing solves become DNF, and the room continues (nobody waits forever).
- [ ] The **host leaves** for good: after 30 s the longest-present player becomes host.
- [ ] Someone **joins during a set**: they're a *spectator* and start racing from the next set.
- [ ] Host **skips** an AFK player (Skip in the table): they get a DNF for that solve.
- [ ] Host **kicks** a player: they see "The host removed you" and can't rejoin.
- [ ] Set a **1 min time limit**: someone doesn't solve; after the countdown they get a DNF.
- [ ] Everyone's **snapshot version** (debug panel) ends up the same number.
- [ ] Unlimited mode: host presses **End match**; the point leader wins.
- [ ] A new deploy while people are in a room: everyone sees "The server is restarting…".

## 4. The extras

- [ ] **Race now** on two phones with the same event: the second lands in the first one's room; the race starts 3 s later.
- [ ] While someone solves, their row shows a ticking blue clock; it turns into their time when they stop.
- [ ] After each solve: the finish-line bars race, then the gaps show. Tap a player and send 🔥: it floats on their row and shows in chat.
- [ ] Lobby → Scoring → **Handicap**: set 1 is the pace set (no points); from set 2 the biggest gain over your own pace wins.
- [ ] Menu → **Copy overlay link**, open it in another browser (or OBS): the standings and clocks update live.
- [ ] Match over → **Share result card**: phone opens the share sheet; computer downloads a PNG.
- [ ] Home → **Daily scramble** → Start: the scramble shows, "10:00 left" counts down; solve; your rank shows. Reload: still done.
- [ ] Smart cube (Chrome with Bluetooth): Menu → Connect; scramble the cube to match ("Scrambled…"), first turn starts, solving stops. Another player taps your row and sees your cube turn.
- [ ] No smart cube? Open the room with `?simcube=1` and use Menu → Keyboard cube (test).

## 5. Look and feel

- [ ] Look away from the tab during the review: the tab title shows "🔔 New scramble!".
- [ ] Phone: nothing is cut off, no sideways scrolling; the ao12 table scrolls inside its card.
- [ ] Try a few events (Megaminx, Square-1, Clock, 7x7x7): scramble text and picture match.
