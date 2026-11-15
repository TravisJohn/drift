/**
 * TrackRotation - which file of a folder plays next.
 *
 * Tracks play in order and wrap around. The list can change at any time
 * (the author adds and deletes files while the game runs), and a track that
 * failed to play is skipped until the list changes it. Pure: no audio here.
 */
export class TrackRotation {
  private tracks: readonly string[] = [];
  private readonly failed = new Set<string>();
  /** Index of the track last handed out; -1 before the first. */
  private cursor = -1;
  private currentUrl: string | null = null;

  /** `random` picks which track a fresh list starts on. */
  constructor(private readonly random: () => number = Math.random) {}

  get count(): number {
    return this.tracks.length;
  }

  get current(): string | null {
    return this.currentUrl;
  }

  has(url: string): boolean {
    return this.tracks.includes(url);
  }

  /** Replace the track list. Returns true when it actually changed. */
  setTracks(next: readonly string[]): boolean {
    const same = next.length === this.tracks.length && next.every((t, i) => t === this.tracks[i]);
    if (same) return false;

    const wasEmpty = this.tracks.length === 0;
    this.tracks = [...next];
    for (const url of this.failed) {
      if (!this.tracks.includes(url)) this.failed.delete(url);
    }

    if (wasEmpty) {
      // A fresh list starts somewhere new each session.
      this.cursor = Math.floor(this.random() * this.tracks.length) - 1;
      this.currentUrl = null;
    } else if (this.currentUrl !== null && this.tracks.includes(this.currentUrl)) {
      this.cursor = this.tracks.indexOf(this.currentUrl);
    } else if (this.currentUrl !== null) {
      // The current track was removed: continue from the slot it left.
      this.cursor -= 1;
      this.currentUrl = null;
    }
    return true;
  }

  /** Move to the next playable track, wrapping. Null when none can play. */
  advance(): string | null {
    const n = this.tracks.length;
    for (let step = 1; step <= n; step++) {
      // +n keeps the index non-negative after a removal moved the cursor.
      const index = (((this.cursor + step) % n) + n) % n;
      const candidate = this.tracks[index];
      if (candidate !== undefined && !this.failed.has(candidate)) {
        this.cursor = index;
        this.currentUrl = candidate;
        return candidate;
      }
    }
    this.currentUrl = null;
    return null;
  }

  /** Skip this track from now on. Returns true the first time. */
  markFailed(url: string): boolean {
    if (this.failed.has(url)) return false;
    this.failed.add(url);
    return true;
  }
}
