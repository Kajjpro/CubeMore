# Testing with friends: checklist

Do this after deploying (or locally with phones on the same Wi-Fi). Best with 3+ people,
at least one on a phone. Everyone can add `?debug=1` to the URL to see the connection,
latency, snapshot version and outbox size in the bottom-left corner.

## 1. Rooms

- [ ] Host: Home -> nickname -> **Create room** -> options appear -> pick ao5, bo3, 3x3x3 -> Create.
- [ ] Host: **Copy link**, send it to friends. Opening the link asks for a nickname, then joins.
- [ ] Someone joins with the 6-character code instead (lowercase works too).
- [ ] Everyone's player list updates instantly; the host has the **Host** badge.
- [ ] Host changes a setting (event, format, time limit): everyone sees it at once.
- [ ] A non-host can't change settings (the fields are greyed out).
- [ ] Set max players below the number of people: "Max players can't be lower than…".

### Public and private rooms

- [ ] Create a **public** room: it appears in "Public rooms" on another phone's home page; Join works in one tap.
- [ ] Create a **private** room: it is NOT in the list. Opening its code without the PIN asks for the PIN;
      a wrong PIN is refused; the right one lets you in. The host's "Copy invite link" opens it directly.
- [ ] Refresh inside a private room: you're back without typing the PIN.
- [ ] The host can change the event in the lobby, but Best of shows as fixed.
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

## 4. Look and feel

- [ ] Look away from the tab during the review: the tab title shows "🔔 New scramble!".
- [ ] Phone: nothing is cut off, no sideways scrolling; the ao12 table scrolls inside its card.
- [ ] Try a few events (Megaminx, Square-1, Clock, 7x7x7): scramble text and picture match.
