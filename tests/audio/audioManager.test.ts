import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AudioManager, type AudioElementLike } from '../../src/audio/audioManager';
import { gameConfig } from '../../src/config/gameConfig';
import type { AudioSpec } from '../../src/content/audioManifest';

class FakeElement implements AudioElementLike {
  volume = 0;
  loop = false;
  currentTime = 0;
  playCalls = 0;
  pauseCalls = 0;
  rejectPlay = false;
  private errorListeners: (() => void)[] = [];

  play(): Promise<void> {
    this.playCalls++;
    return this.rejectPlay ? Promise.reject(new Error('no source')) : Promise.resolve();
  }

  pause(): void {
    this.pauseCalls++;
  }

  addEventListener(_type: 'error', listener: () => void): void {
    this.errorListeners.push(listener);
  }

  fireError(): void {
    for (const l of this.errorListeners) l();
  }
}

const MANIFEST: readonly AudioSpec[] = [
  { key: 'hum', files: ['audio/hum.ogg'], loop: true, volume: 0.8, category: 'ambience' },
  { key: 'blip', files: ['audio/blip.ogg'], loop: false, volume: 0.6, category: 'sfx' },
];

const MULTI_FORMAT: readonly AudioSpec[] = [
  {
    key: 'hum',
    files: ['audio/hum.ogg', 'audio/hum.mp3', 'audio/hum.wav'],
    loop: true,
    volume: 0.8,
    category: 'ambience',
  },
  {
    key: 'blip',
    files: ['audio/blip.ogg', 'audio/blip.mp3'],
    loop: false,
    volume: 0.6,
    category: 'sfx',
  },
];

describe('AudioManager', () => {
  let elements: Map<string, FakeElement>;
  let manager: AudioManager;
  let warn: MockInstance<(...args: unknown[]) => void>;

  const make = (manifest: readonly AudioSpec[] = MANIFEST): AudioManager => {
    elements = new Map();
    return new AudioManager(manifest, (url) => {
      const el = new FakeElement();
      elements.set(url, el);
      return el;
    });
  };
  const el = (key: string, ext = 'ogg'): FakeElement => {
    const found = elements.get(`audio/${key}.${ext}`);
    if (!found) throw new Error(`no fake element for ${key}.${ext}`);
    return found;
  };

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    manager = make();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('refuses an invalid manifest (fail loud)', () => {
    expect(() =>
      make([{ key: 'x', files: [''], loop: true, volume: 2, category: 'music' }]),
    ).toThrow(/invalid manifest/);
  });

  it('nothing plays before unlock; requested loops start on unlock', () => {
    manager.playLoop('hum');
    manager.update(1);
    expect(el('hum').playCalls).toBe(0);
    manager.unlock();
    expect(el('hum').playCalls).toBe(1);
  });

  it('a loop fades in to its manifest volume over fadeSeconds', () => {
    manager.unlock();
    manager.playLoop('hum');
    manager.update(gameConfig.audio.fadeSeconds / 2);
    expect(el('hum').volume).toBeCloseTo(0.8 * 0.5, 5);
    manager.update(gameConfig.audio.fadeSeconds);
    expect(el('hum').volume).toBeCloseTo(0.8, 5);
  });

  it('stopLoop fades out and pauses at silence', () => {
    manager.unlock();
    manager.playLoop('hum');
    manager.update(gameConfig.audio.fadeSeconds * 2);
    manager.stopLoop('hum');
    manager.update(gameConfig.audio.fadeSeconds * 2);
    expect(el('hum').volume).toBe(0);
    expect(el('hum').pauseCalls).toBe(1);
  });

  it('setLoopGain scales a loop immediately', () => {
    manager.unlock();
    manager.playLoop('hum');
    manager.update(gameConfig.audio.fadeSeconds * 2);
    manager.setLoopGain('hum', 0.25);
    manager.update(0.001);
    expect(el('hum').volume).toBeCloseTo(0.8 * 0.25, 2);
  });

  it('one-shots are silent before unlock, replay from the start after', () => {
    manager.playOnce('blip');
    expect(el('blip').playCalls).toBe(0);
    manager.unlock();
    el('blip').currentTime = 3;
    manager.playOnce('blip');
    expect(el('blip').currentTime).toBe(0);
    expect(el('blip').playCalls).toBe(1);
    expect(el('blip').volume).toBeCloseTo(0.6, 5);
  });

  it('a missing file warns exactly once and goes silent (PRD)', () => {
    manager.unlock();
    el('hum').fireError();
    el('hum').fireError();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('"hum"');
    manager.playLoop('hum'); // asking again must not retry or re-warn
    expect(el('hum').playCalls).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a rejected play() marks the sound missing with one warning', async () => {
    el('blip').rejectPlay = true;
    manager.unlock();
    manager.playOnce('blip');
    await Promise.resolve(); // let the rejection handler run
    await Promise.resolve();
    expect(warn).toHaveBeenCalledTimes(1);
    manager.playOnce('blip');
    expect(el('blip').playCalls).toBe(1);
  });

  it('wrong-kind and unknown keys are programming errors', () => {
    expect(() => manager.playOnce('hum')).toThrow(/wrong call/);
    expect(() => manager.playLoop('blip')).toThrow(/wrong call/);
    expect(() => manager.playLoop('nope')).toThrow(/unknown audio key/);
  });

  it('dispose pauses everything that was playing', () => {
    manager.unlock();
    manager.playLoop('hum');
    manager.dispose();
    expect(el('hum').pauseCalls).toBeGreaterThan(0);
  });

  describe('format fallback (author may supply ogg, mp3 or wav)', () => {
    beforeEach(() => {
      manager = make(MULTI_FORMAT);
    });

    it('only the preferred format is requested while it loads fine', () => {
      expect([...elements.keys()]).toEqual(['audio/hum.ogg', 'audio/blip.ogg']);
    });

    it('a failed format falls through to the next without warning', () => {
      el('hum').fireError();
      expect(warn).not.toHaveBeenCalled();
      manager.unlock();
      manager.playLoop('hum');
      manager.update(gameConfig.audio.fadeSeconds * 2);
      expect(el('hum', 'mp3').playCalls).toBe(1);
      expect(el('hum', 'mp3').loop).toBe(true);
      expect(el('hum', 'mp3').volume).toBeCloseTo(0.8, 5);
      expect(el('hum').playCalls).toBe(0);
    });

    it('a loop already requested resumes on the fallback file', () => {
      manager.unlock();
      manager.playLoop('hum');
      el('hum').fireError();
      el('hum', 'mp3').fireError();
      expect(el('hum', 'wav').playCalls).toBe(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it('a one-shot plays from the fallback file on its next trigger', () => {
      el('blip').fireError();
      manager.unlock();
      expect(el('blip', 'mp3').playCalls).toBe(0);
      manager.playOnce('blip');
      expect(el('blip', 'mp3').playCalls).toBe(1);
      expect(el('blip', 'mp3').volume).toBeCloseTo(0.6, 5);
    });

    it('warns once, naming every tried file, only after all formats fail', () => {
      el('hum').fireError();
      el('hum', 'mp3').fireError();
      expect(warn).not.toHaveBeenCalled();
      el('hum', 'wav').fireError();
      el('hum', 'wav').fireError();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain(
        'audio/hum.ogg, audio/hum.mp3, audio/hum.wav',
      );
      manager.unlock();
      manager.playLoop('hum');
      expect(el('hum', 'wav').playCalls).toBe(0);
    });

    it('a file that reports failure twice does not skip a format', async () => {
      // A bad source fires an error event and also rejects play().
      el('hum').rejectPlay = true;
      manager.unlock();
      manager.playLoop('hum');
      el('hum').fireError();
      await Promise.resolve();
      await Promise.resolve();
      expect(el('hum', 'mp3').playCalls).toBe(1);
      expect(elements.has('audio/hum.wav')).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
