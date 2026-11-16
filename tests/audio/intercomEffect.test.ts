import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { IntercomEffect, makeSaturationCurve } from '../../src/audio/intercomEffect';
import { gameConfig } from '../../src/config/gameConfig';

describe('makeSaturationCurve (the intercom speaker overdrive)', () => {
  it('passes silence through as silence and stays within full scale', () => {
    const curve = makeSaturationCurve(1.5, 1025);
    expect(curve[512]).toBeCloseTo(0, 6);
    expect(curve[0]).toBeCloseTo(-1, 6);
    expect(curve[1024]).toBeCloseTo(1, 6);
    for (const v of curve) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('never folds back: louder in is never quieter out', () => {
    const curve = makeSaturationCurve(2.5);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i] ?? 0).toBeGreaterThanOrEqual(curve[i - 1] ?? 0);
    }
  });

  it('more drive squashes loud passages harder', () => {
    const half = (drive: number): number => makeSaturationCurve(drive, 1025)[768] ?? 0; // input 0.5
    expect(half(3)).toBeGreaterThan(half(1));
    expect(half(1)).toBeGreaterThan(0.5); // already lifting quieter material
  });

  it('rejects impossible settings (fail loud)', () => {
    expect(() => makeSaturationCurve(0)).toThrow();
    expect(() => makeSaturationCurve(1, 1)).toThrow();
  });
});

describe('IntercomEffect without Web Audio (old browsers, tests)', () => {
  let warn: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('leaves the music playing unprocessed and says so once', () => {
    const effect = new IntercomEffect();
    const a = document.createElement('audio');
    const b = document.createElement('audio');
    expect(() => {
      effect.connect(a);
      effect.connect(b);
      effect.setLevel(1);
      effect.resume();
      effect.dispose();
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all when switched off in the config', () => {
    const effect = new IntercomEffect({ ...gameConfig.audio.intercom, enabled: false });
    effect.connect(document.createElement('audio'));
    expect(warn).not.toHaveBeenCalled();
  });
});
