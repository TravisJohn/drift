import { describe, expect, it } from 'vitest';
import { WarningBeat, beatInterval } from '../../src/player/warningBeat';

const SETTINGS = { slowInterval: 0.9, fastInterval: 0.18, flashSeconds: 0.16 };
const DT = 1 / 60;

/** Count beats over `seconds` at a steady strain. */
function beatsIn(seconds: number, strain: number): number {
  const beat = new WarningBeat(SETTINGS);
  let beats = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) if (beat.update(DT, strain)) beats++;
  return beats;
}

describe('WarningBeat (the tether alarm speeds up like a parking sensor)', () => {
  it('stays silent and dark with no strain', () => {
    const beat = new WarningBeat(SETTINGS);
    for (let i = 0; i < 120; i++) expect(beat.update(DT, 0)).toBe(false);
    expect(beat.flash).toBe(0);
  });

  it('beeps the moment strain begins, so the warning is never late', () => {
    const beat = new WarningBeat(SETTINGS);
    expect(beat.update(DT, 0.05)).toBe(true);
    expect(beat.flash).toBe(1);
  });

  it('beeps faster the nearer the drone is to the limit', () => {
    expect(beatsIn(5, 1)).toBeGreaterThan(beatsIn(5, 0.5));
    expect(beatsIn(5, 0.5)).toBeGreaterThan(beatsIn(5, 0.1));
    expect(beatInterval(0, SETTINGS)).toBe(0.9);
    expect(beatInterval(1, SETTINGS)).toBeCloseTo(0.18, 9);
  });

  it('fades each antenna flash out between beats', () => {
    const beat = new WarningBeat(SETTINGS);
    beat.update(DT, 0.2);
    for (let i = 0; i < 12; i++) beat.update(DT, 0.2); // 0.2 s, past flashSeconds
    expect(beat.flash).toBe(0);
  });

  it('starts over when the drone comes back, so the next excursion beeps at once', () => {
    const beat = new WarningBeat(SETTINGS);
    beat.update(DT, 0.5);
    beat.update(DT, 0.5);
    beat.update(DT, 0);
    expect(beat.update(DT, 0.5)).toBe(true);
  });

  it('rejects a fast interval slower than the slow one', () => {
    expect(() => new WarningBeat({ ...SETTINGS, fastInterval: 2 })).toThrow(/fastInterval/);
  });
});
