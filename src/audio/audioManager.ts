/**
 * AudioManager - plays the manifest's sounds, and stays calm when the
 * author has not supplied them yet (PRD: the game must run silently with a
 * logged warning per missing file).
 *
 * Design:
 * - Loops (music, ambience, hover) fade in/out over `fadeSeconds`;
 *   update(dt) moves current volume toward target.
 * - Browsers refuse audio before a user gesture: everything waits for
 *   unlock(), called from the first click. Loops requested earlier start
 *   then.
 * - The element factory is injectable so tests can run without real media.
 * - Each sound has several candidate files (one per accepted format). When
 *   one fails to load, the next is tried; only when all have failed is the
 *   sound marked missing and the single warning logged.
 * - A per-loop gain (0..1) lets gameplay scale a loop live, e.g. the drone
 *   hover following flight speed - gain changes are immediate, fades are
 *   not.
 */
import { gameConfig } from '../config/gameConfig';
import { audioManifest, validateAudioManifest, type AudioSpec } from '../content/audioManifest';

/** The slice of HTMLAudioElement the manager uses (test seam). */
export interface AudioElementLike {
  volume: number;
  loop: boolean;
  currentTime: number;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: 'error', listener: () => void): void;
}

export type AudioElementFactory = (url: string) => AudioElementLike;

const defaultFactory: AudioElementFactory = (url) => {
  const el = new Audio(url);
  el.preload = 'auto';
  return el;
};

interface Entry {
  readonly spec: AudioSpec;
  /** The element for the candidate file currently in use. */
  el: AudioElementLike;
  /** Index into spec.files of the candidate `el` plays. */
  candidate: number;
  missing: boolean;
  warned: boolean;
  playing: boolean;
  /** Fade target as a fraction of spec volume (0 or 1). */
  target: number;
  current: number;
  gain: number;
}

export class AudioManager {
  private readonly entries = new Map<string, Entry>();
  private unlocked = false;

  constructor(
    manifest: readonly AudioSpec[] = audioManifest,
    private readonly factory: AudioElementFactory = defaultFactory,
  ) {
    const problems = validateAudioManifest(manifest);
    if (problems.length > 0) {
      throw new Error(`AudioManager: invalid manifest:\n- ${problems.join('\n- ')}`);
    }
    for (const spec of manifest) {
      const first = spec.files[0];
      if (first === undefined) {
        // Unreachable after validation; kept so the type narrows loudly.
        throw new Error(`AudioManager: "${spec.key}" has no file candidates`);
      }
      const entry: Entry = {
        spec,
        el: this.createElement(spec, first),
        candidate: 0,
        missing: false,
        warned: false,
        playing: false,
        target: 0,
        current: 0,
        gain: 1,
      };
      this.watchForFailure(entry);
      this.entries.set(spec.key, entry);
    }
  }

  /** Call from the first user gesture; audio cannot start before it. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    for (const entry of this.entries.values()) {
      if (entry.target > 0) this.startElement(entry);
    }
  }

  /** Fade a loop in. Throws when the key is not a loop (programming error). */
  playLoop(key: string): void {
    const entry = this.require(key, true);
    entry.target = 1;
    if (this.unlocked && !entry.playing) this.startElement(entry);
  }

  /** Fade a loop out; it pauses when the fade reaches silence. */
  stopLoop(key: string): void {
    this.require(key, true).target = 0;
  }

  /** Scale a playing loop immediately (e.g. hover volume from speed). */
  setLoopGain(key: string, gain: number): void {
    this.require(key, true).gain = Math.min(1, Math.max(0, gain));
  }

  /** Fire a one-shot at its manifest volume. Silent before unlock. */
  playOnce(key: string): void {
    const entry = this.require(key, false);
    if (!this.unlocked || entry.missing) return;
    entry.el.currentTime = 0;
    entry.el.volume = entry.spec.volume;
    this.startElement(entry);
  }

  /** Advance fades; call once per fixed update. */
  update(dt: number): void {
    const step = dt / Math.max(0.01, gameConfig.audio.fadeSeconds);
    for (const entry of this.entries.values()) {
      if (!entry.spec.loop) continue;
      if (entry.current < entry.target) {
        entry.current = Math.min(entry.target, entry.current + step);
      } else if (entry.current > entry.target) {
        entry.current = Math.max(entry.target, entry.current - step);
      }
      if (!entry.missing) {
        entry.el.volume = entry.current * entry.spec.volume * entry.gain;
        if (entry.playing && entry.current === 0 && entry.target === 0) {
          entry.el.pause();
          entry.playing = false;
        }
      }
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.el.pause();
      entry.playing = false;
    }
  }

  private require(key: string, loop: boolean): Entry {
    const entry = this.entries.get(key);
    if (!entry) {
      throw new Error(`AudioManager: unknown audio key "${key}"`);
    }
    if (entry.spec.loop !== loop) {
      throw new Error(
        `AudioManager: "${key}" is ${entry.spec.loop ? 'a loop' : 'a one-shot'}, wrong call used`,
      );
    }
    return entry;
  }

  private createElement(spec: AudioSpec, url: string): AudioElementLike {
    const el = this.factory(url);
    el.loop = spec.loop;
    el.volume = 0;
    return el;
  }

  private watchForFailure(entry: Entry): void {
    const el = entry.el;
    el.addEventListener('error', () => this.handleFailure(entry, el));
  }

  private startElement(entry: Entry): void {
    if (entry.missing) return;
    const el = entry.el;
    try {
      const result = el.play();
      entry.playing = true;
      if (result && typeof result.catch === 'function') {
        result.catch(() => this.handleFailure(entry, el));
      }
    } catch {
      this.handleFailure(entry, el);
    }
  }

  /**
   * A candidate file failed: move to the next format, or give up.
   *
   * One bad file can report twice (an error event and a rejected play()),
   * so only a failure from the element currently in use advances the
   * fallback - a stale report would otherwise skip a candidate.
   */
  private handleFailure(entry: Entry, failed: AudioElementLike): void {
    if (entry.missing || entry.el !== failed) return;
    const nextUrl = entry.spec.files[entry.candidate + 1];
    if (nextUrl === undefined) {
      this.markMissing(entry);
      return;
    }
    entry.candidate += 1;
    entry.playing = false;
    entry.el = this.createElement(entry.spec, nextUrl);
    this.watchForFailure(entry);
    // A loop that should be sounding resumes on the new file. A one-shot
    // is not replayed: a late blip is worse than a skipped one.
    if (this.unlocked && entry.spec.loop && entry.target > 0) this.startElement(entry);
  }

  private markMissing(entry: Entry): void {
    entry.missing = true;
    entry.playing = false;
    if (!entry.warned) {
      entry.warned = true;
      // PRD: run silently, but say so once.
      console.warn(
        `Drift audio: "${entry.spec.key}" not available (tried ${entry.spec.files.join(', ')}) - running silent`,
      );
    }
  }
}
