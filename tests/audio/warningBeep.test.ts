import { describe, expect, it, vi } from 'vitest';
import { WarningBeep, beepTone } from '../../src/audio/warningBeep';

const SETTINGS = { enabled: true, level: 0.16, lowHz: 1250, highHz: 1650, durationSeconds: 0.08 };

describe('beepTone (the alarm rises in pitch as the strain grows)', () => {
  it('climbs from lowHz to highHz with strain', () => {
    expect(beepTone(0, SETTINGS).frequencyHz).toBe(1250);
    expect(beepTone(1, SETTINGS).frequencyHz).toBe(1650);
    expect(beepTone(0.5, SETTINGS).frequencyHz).toBeGreaterThan(1250);
  });

  it('stays within the configured level', () => {
    expect(beepTone(1, SETTINGS).gain).toBeCloseTo(0.16, 9);
    expect(beepTone(0, SETTINGS).gain).toBeLessThan(0.16);
  });

  it('is silent when disabled', () => {
    expect(beepTone(1, { ...SETTINGS, enabled: false }).gain).toBe(0);
  });
});

describe('WarningBeep without Web Audio', () => {
  it('warns once and stays silent rather than throwing', () => {
    const original = globalThis.AudioContext;
    // @ts-expect-error - simulate a browser without Web Audio
    globalThis.AudioContext = undefined;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const beep = new WarningBeep(SETTINGS);
      beep.resume();
      beep.beep(1);
      beep.beep(1);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      globalThis.AudioContext = original;
    }
  });
});
