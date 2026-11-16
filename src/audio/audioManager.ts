/**
 * AudioManager - plays the manifest's sounds from whatever files the author
 * has dropped in, and stays calm when there are none (PRD: the game must
 * run silently with a logged warning per missing sound).
 *
 * Design:
 * - Game code talks in keys ("music_cruise"). Each key reads from a folder
 *   of files (see audioManifest); the current folder contents arrive via
 *   setLibrary(), which may be called again at any time - files can be
 *   added, replaced and deleted while the game runs.
 * - Loops (music, ambience, hover) fade in/out over `fadeSeconds`;
 *   update(dt) moves current volume toward target. A folder with several
 *   files plays them one after another; a single file loops natively.
 * - Keys that resolve to the same folder share one voice: a shared music
 *   playlist keeps playing across roaming -> cruise instead of restarting.
 * - Browsers refuse audio before a user gesture: everything waits for
 *   unlock(), called from the first click. Loops requested earlier start
 *   then.
 * - The element factory is injectable so tests can run without real media.
 * - A per-loop gain (0..1) lets gameplay scale a loop live, e.g. the drone
 *   hover following flight speed - gain changes are immediate, fades are
 *   not. A per-loop rate does the same for speed and pitch (the engine).
 * - Each element is offered to an optional hook as it is created, which is
 *   how music gets its intercom treatment without the manager knowing.
 */
import { gameConfig } from '../config/gameConfig';
import {
  audioFolders,
  audioManifest,
  validateAudioManifest,
  type AudioCategory,
  type AudioSpec,
} from '../content/audioManifest';
import { type AudioLibrary, resolveFolder, trackLabel } from './audioLibrary';
import { TrackRotation } from './trackRotation';

/** The slice of HTMLAudioElement the manager uses (test seam). */
export interface AudioElementLike {
  volume: number;
  loop: boolean;
  currentTime: number;
  /** Speed and pitch, 1 = as recorded. Absent on minimal test doubles. */
  playbackRate?: number;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: 'error' | 'ended', listener: () => void): void;
}

export type AudioElementFactory = (url: string) => AudioElementLike;

/**
 * Called once for each element the manager creates, so the caller can
 * route it through an effect (the intercom treatment of music).
 */
export type AudioElementHook = (element: AudioElementLike, category: AudioCategory) => void;

const defaultFactory: AudioElementFactory = (url) => {
  const el = new Audio(url);
  el.preload = 'auto';
  // Let a rate change shift pitch too: an engine spooling up should rise.
  el.preservesPitch = false;
  return el;
};

/** One sound the game can ask for. */
interface Cue {
  readonly spec: AudioSpec;
  /** Folder it plays from right now; null while it has no files. */
  folder: string | null;
  /** Fade target as a fraction of spec volume (0 or 1). Loops only. */
  target: number;
  current: number;
  gain: number;
  /** Playback speed and pitch for this loop, 1 = as recorded. */
  rate: number;
  warnedSilent: boolean;
}

/** The files of one folder and what is playing from them. */
interface Bank {
  readonly folder: string;
  readonly loop: boolean;
  readonly category: AudioCategory;
  readonly rotation: TrackRotation;
  readonly elements: Map<string, AudioElementLike>;
  /** Loop banks: the element sounding (or paused mid-track). */
  el: AudioElementLike | null;
  playing: boolean;
}

/** pause() during a pending play() rejects it; that is not a broken file. */
function isInterruptedPlay(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

export class AudioManager {
  private readonly cues = new Map<string, Cue>();
  private readonly banks = new Map<string, Bank>();
  private unlocked = false;
  /** Nothing is "missing" until the first library has arrived. */
  private libraryLoaded = false;

  constructor(
    manifest: readonly AudioSpec[] = audioManifest,
    private readonly factory: AudioElementFactory = defaultFactory,
    random: () => number = Math.random,
    private readonly onElement: AudioElementHook = () => undefined,
  ) {
    const problems = validateAudioManifest(manifest);
    if (problems.length > 0) {
      throw new Error(`AudioManager: invalid manifest:\n- ${problems.join('\n- ')}`);
    }
    for (const spec of manifest) {
      this.cues.set(spec.key, {
        spec,
        folder: null,
        target: 0,
        current: 0,
        gain: 1,
        rate: 1,
        warnedSilent: false,
      });
    }
    for (const folder of audioFolders(manifest)) {
      const feeders = manifest.filter((s) => s.folder === folder || s.fallbackFolder === folder);
      this.banks.set(folder, {
        folder,
        loop: feeders.some((s) => s.loop),
        category: feeders[0]?.category ?? 'sfx',
        rotation: new TrackRotation(random),
        elements: new Map(),
        el: null,
        playing: false,
      });
    }
  }

  /**
   * Tell the manager which files exist now. Safe to call repeatedly: only
   * folders whose contents changed are touched, and a track that is still
   * there keeps playing undisturbed.
   */
  setLibrary(library: AudioLibrary): void {
    this.libraryLoaded = true;
    const restarted = new Set<string>();

    for (const bank of this.banks.values()) {
      const tracks = library[bank.folder] ?? [];
      const playingUrl = bank.el === null ? null : bank.rotation.current;
      if (!bank.rotation.setTracks(tracks)) continue;

      for (const [url, el] of bank.elements) {
        if (bank.rotation.has(url)) continue;
        el.pause();
        bank.elements.delete(url);
      }
      if (playingUrl !== null && !bank.rotation.has(playingUrl)) {
        // The file that was sounding is gone: cut it, fade the next one in.
        bank.el = null;
        bank.playing = false;
        restarted.add(bank.folder);
      }
      if (bank.el !== null) bank.el.loop = bank.rotation.count === 1;
      // One-shots must fire instantly, so their files load ahead of time.
      if (!bank.loop) for (const url of tracks) this.elementFor(bank, url);
    }

    for (const cue of this.cues.values()) {
      const folder = resolveFolder(cue.spec, library);
      const moved = folder !== cue.folder;
      cue.folder = folder;
      // A new source fades in rather than popping in at full volume.
      if (cue.spec.loop && (moved || (folder !== null && restarted.has(folder)))) cue.current = 0;
      this.warnIfSilent(cue);
    }

    for (const bank of this.banks.values()) this.startIfWanted(bank);
  }

  /** Call from the first user gesture; audio cannot start before it. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    for (const bank of this.banks.values()) this.startIfWanted(bank);
  }

  /** Fade a loop in. Throws when the key is not a loop (programming error). */
  playLoop(key: string): void {
    const cue = this.require(key, true);
    cue.target = 1;
    const bank = this.bankOf(cue);
    if (bank) this.startIfWanted(bank);
  }

  /** Fade a loop out; it pauses when the fade reaches silence. */
  stopLoop(key: string): void {
    this.require(key, true).target = 0;
  }

  /** Scale a playing loop immediately (e.g. hover volume from speed). */
  setLoopGain(key: string, gain: number): void {
    this.require(key, true).gain = Math.min(1, Math.max(0, gain));
  }

  /**
   * Change a loop's speed and pitch immediately (e.g. the engine rising
   * as the ship gathers way). 1 = as recorded.
   */
  setLoopRate(key: string, rate: number): void {
    this.require(key, true).rate = Math.min(4, Math.max(0.25, rate));
  }

  /**
   * How loud a whole category is right now, 0..1 of its faded-in level.
   * Silent sounds (no files) do not count.
   */
  categoryLevel(category: AudioCategory): number {
    let level = 0;
    for (const cue of this.cues.values()) {
      if (cue.spec.loop && cue.spec.category === category && cue.folder !== null) {
        level += cue.current;
      }
    }
    return Math.min(1, level);
  }

  /** Fire a one-shot at its manifest volume. Silent before unlock. */
  playOnce(key: string): void {
    const cue = this.require(key, false);
    const bank = this.bankOf(cue);
    if (!this.unlocked || !bank) return;
    const url = bank.rotation.advance();
    if (url === null) return;
    const el = this.elementFor(bank, url);
    el.currentTime = 0;
    el.volume = cue.spec.volume;
    this.play(bank, url, el);
  }

  /** Advance fades; call once per fixed update. */
  update(dt: number): void {
    const step = dt / Math.max(0.01, gameConfig.audio.fadeSeconds);
    /** Per folder: summed volume, and whether any cue is still audible. */
    const mix = new Map<string, { volume: number; active: boolean; rate: number }>();

    for (const cue of this.cues.values()) {
      if (!cue.spec.loop) continue;
      if (cue.current < cue.target) {
        cue.current = Math.min(cue.target, cue.current + step);
      } else if (cue.current > cue.target) {
        cue.current = Math.max(cue.target, cue.current - step);
      }
      if (cue.folder === null) continue;
      const entry = mix.get(cue.folder) ?? { volume: 0, active: false, rate: cue.rate };
      // Summing lets two keys on one voice hand over without a dip: while
      // one fades out and the other fades in, the total stays level.
      entry.volume += cue.current * cue.spec.volume * cue.gain;
      entry.active ||= cue.current > 0 || cue.target > 0;
      mix.set(cue.folder, entry);
    }

    for (const bank of this.banks.values()) {
      if (!bank.loop || bank.el === null) continue;
      const entry = mix.get(bank.folder);
      bank.el.volume = Math.min(1, entry?.volume ?? 0);
      if (entry && bank.el.playbackRate !== undefined) bank.el.playbackRate = entry.rate;
      if (bank.playing && !(entry?.active ?? false)) {
        bank.el.pause();
        bank.playing = false;
      }
    }
  }

  dispose(): void {
    for (const bank of this.banks.values()) {
      for (const el of bank.elements.values()) el.pause();
      bank.playing = false;
    }
  }

  private require(key: string, loop: boolean): Cue {
    const cue = this.cues.get(key);
    if (!cue) {
      throw new Error(`AudioManager: unknown audio key "${key}"`);
    }
    if (cue.spec.loop !== loop) {
      throw new Error(
        `AudioManager: "${key}" is ${cue.spec.loop ? 'a loop' : 'a one-shot'}, wrong call used`,
      );
    }
    return cue;
  }

  private bankOf(cue: Cue): Bank | null {
    return cue.folder === null ? null : (this.banks.get(cue.folder) ?? null);
  }

  private isWanted(bank: Bank): boolean {
    for (const cue of this.cues.values()) {
      if (cue.folder === bank.folder && cue.target > 0) return true;
    }
    return false;
  }

  /** Start (or resume) a loop bank some cue wants to hear. */
  private startIfWanted(bank: Bank): void {
    if (!bank.loop || !this.unlocked || bank.playing || !this.isWanted(bank)) return;
    if (bank.el === null) {
      const url = bank.rotation.advance();
      if (url === null) return;
      bank.el = this.elementFor(bank, url);
      bank.el.currentTime = 0;
    }
    const url = bank.rotation.current;
    if (url === null) return;
    // One file loops natively (no gap); several hand over on 'ended'.
    bank.el.loop = bank.rotation.count === 1;
    this.play(bank, url, bank.el);
  }

  private elementFor(bank: Bank, url: string): AudioElementLike {
    const cached = bank.elements.get(url);
    if (cached) return cached;
    const el = this.factory(url);
    el.loop = false;
    el.volume = 0;
    this.onElement(el, bank.category);
    el.addEventListener('error', () => this.handleFailure(bank, url, el));
    el.addEventListener('ended', () => this.handleEnded(bank, el));
    bank.elements.set(url, el);
    return el;
  }

  private play(bank: Bank, url: string, el: AudioElementLike): void {
    const onRejected = (error: unknown): void => {
      if (!isInterruptedPlay(error)) this.handleFailure(bank, url, el);
    };
    try {
      const result = el.play();
      if (bank.loop) bank.playing = true;
      if (result && typeof result.catch === 'function') result.catch(onRejected);
    } catch (error) {
      onRejected(error);
    }
  }

  /** A playlist track finished: hand over to the next one. */
  private handleEnded(bank: Bank, el: AudioElementLike): void {
    if (!bank.loop || bank.el !== el) return;
    bank.el = null;
    bank.playing = false;
    this.startIfWanted(bank);
  }

  /**
   * A file could not be played: skip it and move on.
   *
   * One bad file can report twice (an error event and a rejected play()),
   * and a deleted file can report late, so only the element still
   * registered for that track counts.
   */
  private handleFailure(bank: Bank, url: string, el: AudioElementLike): void {
    if (bank.elements.get(url) !== el) return;
    if (bank.rotation.markFailed(url)) {
      console.warn(`Drift audio: could not play ${trackLabel(url)} - skipping it`);
    }
    if (bank.el === el) {
      bank.el = null;
      bank.playing = false;
      this.startIfWanted(bank);
    }
  }

  /** PRD: run silently, but say so once per sound that has no files. */
  private warnIfSilent(cue: Cue): void {
    if (!this.libraryLoaded) return;
    if (cue.folder !== null) {
      cue.warnedSilent = false; // warn again if its files are later removed
      return;
    }
    if (cue.warnedSilent) return;
    cue.warnedSilent = true;
    const { key, folder, fallbackFolder } = cue.spec;
    const where =
      fallbackFolder === null ? `audio/${folder}/` : `audio/${folder}/ or audio/${fallbackFolder}/`;
    console.warn(`Drift audio: "${key}" has no files in ${where} - running silent`);
  }
}
