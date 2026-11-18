import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShipHum, humMix, type ShipHumSettings } from '../../src/audio/shipHum';
import { gameConfig } from '../../src/config/gameConfig';
import { flashLevel } from '../../src/rendering/pulse';

const settings: ShipHumSettings = gameConfig.audio.shipHum;

describe('humMix (how the ship sounds at a given moment)', () => {
  it('rumbles harder as the engines work up to cruise', () => {
    const docked = humMix({ engine: 0, nearEngine: 0.5 }, settings);
    const cruising = humMix({ engine: 1, nearEngine: 0.5 }, settings);
    expect(cruising.rumble).toBeGreaterThan(docked.rumble * 2);
    expect(cruising.airCutoffHz).toBeGreaterThan(docked.airCutoffHz);
  });

  it('is louder in the engine room than on the bridge', () => {
    const bridge = humMix({ engine: 0, nearEngine: 0 }, settings);
    const engineering = humMix({ engine: 0, nearEngine: 1 }, settings);
    expect(engineering.electrical).toBeGreaterThan(bridge.electrical);
    expect(engineering.rumble).toBeGreaterThan(bridge.rumble);
  });

  it('is never silent while enabled: a ship always hums', () => {
    const quietest = humMix({ engine: 0, nearEngine: 0 }, settings);
    expect(quietest.electrical).toBeGreaterThan(0);
    expect(quietest.air).toBeGreaterThan(0);
    expect(quietest.rumble).toBeGreaterThan(0);
  });

  it('is only a faint thrum with the drone outside, in vacuum', () => {
    const inside = humMix({ engine: 1, nearEngine: 0.5, outside: false }, settings);
    const outside = humMix({ engine: 1, nearEngine: 0.5, outside: true }, settings);
    expect(outside.rumble).toBeCloseTo(inside.rumble * settings.outsideLevel, 9);
    expect(outside.air).toBeLessThan(inside.air);
  });

  it('is silent when switched off in the config', () => {
    const off = humMix({ engine: 1, nearEngine: 1 }, { ...settings, enabled: false });
    expect(off.electrical + off.air + off.rumble).toBe(0);
  });

  it('clamps out-of-range input instead of blowing up the level', () => {
    const wild = humMix({ engine: 9, nearEngine: -4 }, settings);
    const sane = humMix({ engine: 1, nearEngine: 0 }, settings);
    expect(wild).toEqual(sane);
  });
});

describe('ShipHum without Web Audio', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stays quiet and warns once instead of crashing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = globalThis.AudioContext;
    // jsdom has no Web Audio; make sure of it for this test.
    (globalThis as { AudioContext?: unknown }).AudioContext = undefined;
    try {
      const hum = new ShipHum(settings);
      hum.resume();
      hum.resume();
      hum.update({ engine: 1, nearEngine: 1 });
      hum.dispose();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as { AudioContext?: unknown }).AudioContext = original;
    }
  });
});

describe('flashLevel (shared blink timing for beacons and running lights)', () => {
  it('flashes once per period and is dark otherwise', () => {
    expect(flashLevel(0.05, 2, 0.1)).toBeCloseTo(1, 6);
    expect(flashLevel(0.5, 2, 0.1)).toBe(0);
    expect(flashLevel(2.05, 2, 0.1)).toBeCloseTo(1, 6);
  });

  it('can be offset so lights sharing a period blink out of step', () => {
    expect(flashLevel(0.05, 2, 0.1, 1)).toBe(0);
    expect(flashLevel(1.05, 2, 0.1, 1)).toBeCloseTo(1, 6);
  });
});
