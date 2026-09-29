// The server's clock, as seen from this browser.
//
// Deadlines (time limits, review screens) are server timestamps. If this
// computer's clock is 2 minutes wrong, Date.now() would show wrong countdowns.
// So every snapshot carries `serverTime`, and we remember the difference.

let offsetMs = 0;

/** Called with each snapshot's serverTime. */
export function updateServerOffset(serverTime: number): void {
  offsetMs = serverTime - Date.now();
}

/** "Now" on the server's clock. Use this to compare with deadlines. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function serverOffset(): number {
  return offsetMs;
}
