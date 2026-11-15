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
  readonly el: AudioElementLike;
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
    factory: AudioElementFactory = defaultFactory,
  ) {
    const problems = validateAudioManifest(manifest);
    if (problems.length > 0) {
      throw new Error(`AudioManager: invalid manifest:\n- ${problems.join('\n- ')}`);
    }
    for (const spec of manifest) {
      const el = factory(spec.file);
      el.loop = spec.loop;
      el.volume = 0;
      const entry: Entry = {
        spec,
        el,
        missing: false,
        warned: false,
        playing: false,
        target: 0,
        current: 0,
        gain: 1,
      };
      el.addEventListener('error', () => this.markMissing(entry));
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

  private startElement(entry: Entry): void {
    if (entry.missing) return;
    try {
      const result = entry.el.play();
      entry.playing = true;
      if (result && typeof result.catch === 'function') {
        result.catch(() => this.markMissing(entry));
      }
    } catch {
      this.markMissing(entry);
    }
  }

  private markMissing(entry: Entry): void {
    entry.missing = true;
    entry.playing = false;
    if (!entry.warned) {
      entry.warned = true;
      // PRD: run silently, but say so once.
      console.warn(
        `Drift audio: "${entry.spec.key}" not available at ${entry.spec.file} - running silent`,
      );
    }
  }
}
