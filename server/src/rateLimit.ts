/**
 * A "token bucket" rate limiter, one per connection.
 *
 * The bucket holds up to `capacity` tokens and refills at `refillPerSecond`.
 * Every request takes one token. An empty bucket means "too many requests":
 * the request is refused (the client's outbox simply tries again later).
 * Normal players never get close; it only stops a broken or hostile client
 * from flooding a room.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /** Takes a token if there is one. Returns false when the limit is reached. */
  tryTake(now = Date.now()): boolean {
    if (!this.hasToken(now)) return false;
    this.tokens -= 1;
    return true;
  }

  /** True if a token is available, without taking it. */
  hasToken(now = Date.now()): boolean {
    const secondsPassed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + secondsPassed * this.refillPerSecond);
    this.lastRefill = now;
    return this.tokens >= 1;
  }
}
