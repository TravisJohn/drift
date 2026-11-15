import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AudioManager, type AudioElementLike } from '../../src/audio/audioManager';
import type { AudioLibrary } from '../../src/audio/audioLibrary';
import { gameConfig } from '../../src/config/gameConfig';
import type { AudioSpec } from '../../src/content/audioManifest';

class FakeElement implements AudioElementLike {
  volume = 0;
  loop = false;
  currentTime = 0;
  playCalls = 0;
  pauseCalls = 0;
  /** Set to make play() reject with an error of this name. */
  rejectPlayWith: string | null = null;
  private listeners: Record<string, (() => void)[]> = {};

  play(): Promise<void> {
    this.playCalls++;
    if (this.rejectPlayWith === null) return Promise.resolve();
    const error = new Error('play failed');
    error.name = this.rejectPlayWith;
    return Promise.reject(error);
  }

  pause(): void {
    this.pauseCalls++;
  }

  addEventListener(type: 'error' | 'ended', listener: () => void): void {
    (this.listeners[type] ??= []).push(listener);
  }

  fire(type: 'error' | 'ended'): void {
    for (const l of this.listeners[type] ?? []) l();
  }
}

const cue = (
  key: string,
  loop: boolean,
  volume: number,
  fallbackFolder: string | null = null,
): AudioSpec => ({ key, folder: key, fallbackFolder, loop, volume, category: 'sfx' });

const MANIFEST: readonly AudioSpec[] = [
  cue('hum', true, 0.8),
  cue('blip', false, 0.6),
  cue('roam', true, 0.5, 'music'),
  cue('cruise', true, 0.5, 'music'),
];

const FADE = gameConfig.audio.fadeSeconds;
const flushRejections = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('AudioManager', () => {
  let elements: Map<string, FakeElement>;
  let manager: AudioManager;
  let warn: MockInstance<(...args: unknown[]) => void>;

  const make = (manifest: readonly AudioSpec[] = MANIFEST): AudioManager => {
    elements = new Map();
    return new AudioManager(
      manifest,
      (url) => {
        const el = new FakeElement();
        elements.set(url, el);
        return el;
      },
      () => 0, // rotations start on their first track
    );
  };
  const el = (url: string): FakeElement => {
    const found = elements.get(url);
    if (!found) throw new Error(`no fake element for ${url}`);
    return found;
  };
  const warnings = (): string[] => warn.mock.calls.map((call) => String(call[0]));

  const BASIC: AudioLibrary = { hum: ['hum/a.mp3'], blip: ['blip/a.wav'] };

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    manager = make();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('refuses an invalid manifest (fail loud)', () => {
    expect(() => make([{ ...cue('x', true, 2) }])).toThrow(/invalid manifest/);
  });

  it('wrong-kind and unknown keys are programming errors', () => {
    expect(() => manager.playOnce('hum')).toThrow(/wrong call/);
    expect(() => manager.playLoop('blip')).toThrow(/wrong call/);
    expect(() => manager.playLoop('nope')).toThrow(/unknown audio key/);
  });

  describe('loops', () => {
    beforeEach(() => manager.setLibrary(BASIC));

    it('nothing plays before unlock; requested loops start on unlock', () => {
      manager.playLoop('hum');
      manager.update(1);
      expect(elements.has('hum/a.mp3')).toBe(false);
      manager.unlock();
      expect(el('hum/a.mp3').playCalls).toBe(1);
    });

    it('a loop fades in to its manifest volume over fadeSeconds', () => {
      manager.unlock();
      manager.playLoop('hum');
      manager.update(FADE / 2);
      expect(el('hum/a.mp3').volume).toBeCloseTo(0.8 * 0.5, 5);
      manager.update(FADE);
      expect(el('hum/a.mp3').volume).toBeCloseTo(0.8, 5);
    });

    it('stopLoop fades out and pauses at silence; playLoop resumes the same file', () => {
      manager.unlock();
      manager.playLoop('hum');
      manager.update(FADE * 2);
      manager.stopLoop('hum');
      manager.update(FADE * 2);
      expect(el('hum/a.mp3').volume).toBe(0);
      expect(el('hum/a.mp3').pauseCalls).toBe(1);
      manager.playLoop('hum');
      expect(el('hum/a.mp3').playCalls).toBe(2);
    });

    it('setLoopGain scales a loop immediately', () => {
      manager.unlock();
      manager.playLoop('hum');
      manager.update(FADE * 2);
      manager.setLoopGain('hum', 0.25);
      manager.update(0.001);
      expect(el('hum/a.mp3').volume).toBeCloseTo(0.8 * 0.25, 2);
    });

    it('a single file loops natively so it repeats without a gap', () => {
      manager.unlock();
      manager.playLoop('hum');
      expect(el('hum/a.mp3').loop).toBe(true);
    });

    it('dispose pauses everything that was playing', () => {
      manager.unlock();
      manager.playLoop('hum');
      manager.dispose();
      expect(el('hum/a.mp3').pauseCalls).toBeGreaterThan(0);
    });
  });

  describe('one-shots', () => {
    it('are silent before unlock, replay from the start after', () => {
      manager.setLibrary(BASIC);
      manager.playOnce('blip');
      expect(el('blip/a.wav').playCalls).toBe(0);
      manager.unlock();
      el('blip/a.wav').currentTime = 3;
      manager.playOnce('blip');
      expect(el('blip/a.wav').currentTime).toBe(0);
      expect(el('blip/a.wav').playCalls).toBe(1);
      expect(el('blip/a.wav').volume).toBeCloseTo(0.6, 5);
    });

    it('load ahead of time so the first trigger is instant', () => {
      manager.setLibrary(BASIC);
      expect(elements.has('blip/a.wav')).toBe(true);
    });

    it('several files in the folder take turns', () => {
      manager.setLibrary({ blip: ['blip/a.wav', 'blip/b.wav'] });
      manager.unlock();
      manager.playOnce('blip');
      manager.playOnce('blip');
      manager.playOnce('blip');
      expect(el('blip/a.wav').playCalls).toBe(2);
      expect(el('blip/b.wav').playCalls).toBe(1);
    });
  });

  describe('missing and broken files (PRD: run silent, say so once)', () => {
    it('warns once per sound whose folder is empty, naming where to put files', () => {
      manager.setLibrary({ hum: ['hum/a.mp3'] });
      manager.setLibrary({ hum: ['hum/a.mp3'] });
      expect(warnings()).toHaveLength(3); // blip, roam, cruise - not hum
      expect(warnings().some((w) => w.includes('"blip"') && w.includes('audio/blip/'))).toBe(true);
      expect(
        warnings().some((w) => w.includes('"roam"') && w.includes('audio/roam/ or audio/music/')),
      ).toBe(true);
    });

    it('does not warn before the first library arrives', () => {
      manager.unlock();
      manager.playLoop('hum');
      manager.update(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it('a sound with no files is silent, not an error', () => {
      manager.setLibrary({});
      manager.unlock();
      manager.playLoop('hum');
      manager.playOnce('blip');
      manager.update(1);
      expect(elements.size).toBe(0);
    });

    it('a file that fails to load is skipped with one warning naming it', () => {
      manager.setLibrary({ hum: ['audio/hum/Bad%20File.mp3?v=1', 'hum/b.mp3'] });
      warn.mockClear();
      manager.unlock();
      manager.playLoop('hum');
      el('audio/hum/Bad%20File.mp3?v=1').fire('error');
      el('audio/hum/Bad%20File.mp3?v=1').fire('error');
      expect(warnings()).toEqual([
        'Drift audio: could not play audio/hum/Bad File.mp3 - skipping it',
      ]);
      expect(el('hum/b.mp3').playCalls).toBe(1);
    });

    it('a rejected play() also skips the file', async () => {
      manager.setLibrary(BASIC);
      warn.mockClear();
      el('blip/a.wav').rejectPlayWith = 'NotSupportedError';
      manager.unlock();
      manager.playOnce('blip');
      await flushRejections();
      expect(warn).toHaveBeenCalledTimes(1);
      manager.playOnce('blip');
      expect(el('blip/a.wav').playCalls).toBe(1);
    });

    it('a play() interrupted by pause() is not treated as a broken file', async () => {
      manager.setLibrary(BASIC);
      warn.mockClear();
      el('blip/a.wav').rejectPlayWith = 'AbortError';
      manager.unlock();
      manager.playOnce('blip');
      await flushRejections();
      expect(warn).not.toHaveBeenCalled();
      manager.playOnce('blip');
      expect(el('blip/a.wav').playCalls).toBe(2);
    });
  });

  describe('playlists (several files in a loop folder)', () => {
    beforeEach(() => {
      manager.setLibrary({ hum: ['hum/a.mp3', 'hum/b.mp3'] });
      manager.unlock();
      manager.playLoop('hum');
    });

    it('plays the files one after another and wraps around', () => {
      expect(el('hum/a.mp3').loop).toBe(false);
      el('hum/a.mp3').fire('ended');
      expect(el('hum/b.mp3').playCalls).toBe(1);
      el('hum/b.mp3').fire('ended');
      expect(el('hum/a.mp3').playCalls).toBe(2);
      expect(el('hum/a.mp3').currentTime).toBe(0);
    });

    it('the next track carries the faded-in volume, with no dip between tracks', () => {
      manager.update(FADE * 2);
      el('hum/a.mp3').fire('ended');
      manager.update(0.001);
      expect(el('hum/b.mp3').volume).toBeCloseTo(0.8, 5);
    });

    it('does not start the next track once the loop was stopped', () => {
      manager.update(FADE * 2);
      manager.stopLoop('hum');
      manager.update(FADE * 2);
      el('hum/a.mp3').fire('ended');
      expect(elements.has('hum/b.mp3')).toBe(false);
    });
  });

  describe('shared folder (one playlist for several moments)', () => {
    const SHARED: AudioLibrary = { music: ['music/a.mp3', 'music/b.mp3'] };

    it('moments without files of their own play from the shared folder', () => {
      manager.setLibrary(SHARED);
      manager.unlock();
      manager.playLoop('roam');
      expect(el('music/a.mp3').playCalls).toBe(1);
      expect(warnings().some((w) => w.includes('"roam"'))).toBe(false);
    });

    it('handing over between two such moments keeps the track and the level', () => {
      manager.setLibrary(SHARED);
      manager.unlock();
      manager.playLoop('roam');
      manager.update(FADE * 2);
      manager.stopLoop('roam');
      manager.playLoop('cruise');
      manager.update(FADE / 2); // mid-handover
      expect(el('music/a.mp3').volume).toBeCloseTo(0.5, 5);
      manager.update(FADE);
      expect(el('music/a.mp3').volume).toBeCloseTo(0.5, 5);
      expect(el('music/a.mp3').playCalls).toBe(1);
      expect(el('music/a.mp3').pauseCalls).toBe(0);
    });

    it("a moment's own folder wins over the shared one", () => {
      manager.setLibrary({ ...SHARED, cruise: ['cruise/x.mp3'] });
      manager.unlock();
      manager.playLoop('cruise');
      expect(el('cruise/x.mp3').playCalls).toBe(1);
      expect(elements.has('music/a.mp3')).toBe(false);
    });
  });

  describe('live changes (files added and deleted while the game runs)', () => {
    it('a file dropped in for a silent, wanted loop starts and fades in', () => {
      manager.setLibrary({});
      manager.unlock();
      manager.playLoop('hum');
      manager.update(FADE * 2);
      manager.setLibrary({ hum: ['hum/new.mp3'] });
      expect(el('hum/new.mp3').playCalls).toBe(1);
      manager.update(FADE / 2);
      expect(el('hum/new.mp3').volume).toBeCloseTo(0.8 * 0.5, 5);
    });

    it('deleting the file that is playing cuts it and fades the next one in', () => {
      manager.setLibrary({ hum: ['hum/a.mp3', 'hum/b.mp3'] });
      manager.unlock();
      manager.playLoop('hum');
      manager.update(FADE * 2);
      manager.setLibrary({ hum: ['hum/b.mp3'] });
      expect(el('hum/a.mp3').pauseCalls).toBe(1);
      expect(el('hum/b.mp3').playCalls).toBe(1);
      manager.update(FADE / 2);
      expect(el('hum/b.mp3').volume).toBeCloseTo(0.8 * 0.5, 5);
    });

    it('changes elsewhere leave the playing track undisturbed', () => {
      manager.setLibrary({ hum: ['hum/a.mp3'] });
      manager.unlock();
      manager.playLoop('hum');
      manager.update(FADE * 2);
      manager.setLibrary({ hum: ['hum/a.mp3', 'hum/b.mp3'], blip: ['blip/a.wav'] });
      manager.update(0.001);
      expect(el('hum/a.mp3').playCalls).toBe(1);
      expect(el('hum/a.mp3').pauseCalls).toBe(0);
      expect(el('hum/a.mp3').volume).toBeCloseTo(0.8, 2);
      // It now has a successor, so it must hand over instead of looping.
      expect(el('hum/a.mp3').loop).toBe(false);
    });

    it('a replaced file (same name, new version) is reloaded', () => {
      manager.setLibrary({ hum: ['hum/a.mp3?v=1'] });
      manager.unlock();
      manager.playLoop('hum');
      manager.setLibrary({ hum: ['hum/a.mp3?v=2'] });
      expect(el('hum/a.mp3?v=1').pauseCalls).toBe(1);
      expect(el('hum/a.mp3?v=2').playCalls).toBe(1);
    });

    it('deleting every file silences the sound and warns again', () => {
      manager.setLibrary({ hum: ['hum/a.mp3'] });
      manager.unlock();
      manager.playLoop('hum');
      warn.mockClear();
      manager.setLibrary({});
      expect(el('hum/a.mp3').pauseCalls).toBe(1);
      expect(warnings().filter((w) => w.includes('"hum"'))).toHaveLength(1);
    });

    it('a late failure report from a deleted file is ignored', () => {
      manager.setLibrary({ hum: ['hum/a.mp3', 'hum/b.mp3'] });
      manager.unlock();
      manager.playLoop('hum');
      const removed = el('hum/a.mp3');
      manager.setLibrary({ hum: ['hum/b.mp3'] });
      warn.mockClear();
      removed.fire('error');
      expect(warn).not.toHaveBeenCalled();
      expect(el('hum/b.mp3').playCalls).toBe(1);
    });

    it('dropping files into a moment folder moves it off the shared playlist', () => {
      manager.setLibrary({ music: ['music/a.mp3'] });
      manager.unlock();
      manager.playLoop('cruise');
      manager.update(FADE * 2);
      manager.setLibrary({ music: ['music/a.mp3'], cruise: ['cruise/x.mp3'] });
      expect(el('cruise/x.mp3').playCalls).toBe(1);
      manager.update(0.001);
      expect(el('music/a.mp3').volume).toBe(0);
      expect(el('music/a.mp3').pauseCalls).toBe(1);
    });
  });
});
