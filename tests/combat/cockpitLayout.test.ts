import { describe, expect, it } from 'vitest';
import { consoleMapFrame, incomingLabel } from '../../src/combat/cockpitRenderer';
import type { Raider } from '../../src/combat/combatTypes';
import { vec2 } from '../../src/combat/vec2';

/** The lowest line of the target readout, below the view's centre (0.46 of the height). */
const readoutBottom = (height: number) => height * 0.46 + 59;

describe('cockpit: the big holographic map on the console', () => {
  for (const [w, h] of [
    [1280, 720],
    [1920, 1080],
    [800, 504],
  ] as const) {
    it(`at ${w}x${h} it is centred, large, on screen, and clear of the target readout`, () => {
      const m = consoleMapFrame(w, h);
      expect(m.cx).toBe(w / 2);
      expect(m.radius * 2).toBeGreaterThan(h * 0.28); // about a third of the height
      expect(m.cy + m.radius).toBeLessThan(h); // fully on screen
      // Its missile label sits just above the disc; keep that below the readout.
      expect(m.cy - m.radius - 18).toBeGreaterThan(readoutBottom(h));
    });
  }

  it('on a narrow screen it shrinks so it never covers the side windows', () => {
    const m = consoleMapFrame(400, 900);
    expect(m.radius).toBeLessThanOrEqual(400 * 0.2);
  });
});

describe('cockpit: raiders coming in are called out', () => {
  const raider = (attacking: number, dead = false): Raider => ({
    id: 4,
    commander: false,
    radius: 20,
    maxHp: 1,
    pos: vec2(0, -612.4),
    vel: vec2(0, 0),
    heading: Math.PI / 2,
    hp: 1,
    fireIn: 9,
    missileIn: 9,
    attackIn: 9,
    attacking,
    station: 0,
    phase: 0,
    dead,
  });

  it('a raider on an attack run is marked INCOMING with its range', () => {
    expect(incomingLabel(raider(2), vec2(0, 0))).toBe('INCOMING · 612 M');
  });

  it('a raider holding station, or a dead one, is not', () => {
    expect(incomingLabel(raider(0), vec2(0, 0))).toBeNull();
    expect(incomingLabel(raider(2, true), vec2(0, 0))).toBeNull();
  });
});
