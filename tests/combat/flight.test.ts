import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/config/gameConfig';
import {
  AHEAD,
  STARBOARD,
  approachVelocity,
  engineAccel,
  setVelocity,
  sideOf,
  stepStrafe,
  stepThrottle,
} from '../../src/combat/flight';
import { length, vec2 } from '../../src/combat/vec2';

const ship = gameConfig.combat.ship;
const top = ship.forwardSpeeds.length - 1;

describe('forward flight: the notches the pilot sets', () => {
  it('the hull points up the map, and starboard is to its right', () => {
    expect(AHEAD.x).toBeCloseTo(0);
    expect(AHEAD.y).toBeCloseTo(-1);
    expect(STARBOARD.x).toBeCloseTo(1);
    expect(STARBOARD.y).toBeCloseTo(0);
  });

  it('W taps step the throttle up and stop at the top notch', () => {
    expect(stepThrottle(0, 1, ship)).toBe(1);
    expect(stepThrottle(top, 1, ship)).toBe(top);
  });

  it('S taps step the throttle down but never below slow: the ship never stops', () => {
    expect(stepThrottle(top, -10, ship)).toBe(0);
    expect(ship.forwardSpeeds[0]).toBeGreaterThan(0);
  });

  it('A and D step the drift each way, up to the notch limit', () => {
    expect(stepStrafe(0, -1, ship)).toBe(-1);
    expect(stepStrafe(0, 9, ship)).toBe(ship.strafeNotches);
    expect(stepStrafe(0, -9, ship)).toBe(-ship.strafeNotches);
  });

  it('the set motion is the notch speed forward plus the drift sideways', () => {
    const v = setVelocity(1, -2, false, ship);
    expect(v.y).toBeCloseTo(-(ship.forwardSpeeds[1] ?? 0));
    expect(v.x).toBeCloseTo(-2 * ship.strafeStep);
  });

  it('with no drift set, boost adds forward speed on top of the notch', () => {
    const plain = setVelocity(2, 0, false, ship);
    const boosted = setVelocity(2, 0, true, ship);
    expect(length(boosted) - length(plain)).toBeCloseTo(ship.boostExtra);
  });

  it('with a drift set, boost throws the ship hard that way (a dodge), not forward', () => {
    const left = setVelocity(1, -1, true, ship);
    expect(left.x).toBeCloseTo(-(ship.strafeStep + ship.boostSide));
    expect(left.y).toBeCloseTo(-(ship.forwardSpeeds[1] ?? 0)); // forward speed unchanged
    const right = setVelocity(1, 2, true, ship);
    expect(right.x).toBeCloseTo(2 * ship.strafeStep + ship.boostSide);
  });

  it('the engines answer a boost faster than a notch change, so a dodge is sharp', () => {
    expect(engineAccel(true, ship)).toBeGreaterThan(engineAccel(false, ship));
  });
});

describe('forward flight: the engines bring the motion round', () => {
  it('a change is limited per step, so it takes a moment', () => {
    const next = approachVelocity(vec2(0, 0), vec2(0, -1000), 240, 0.1);
    expect(length(next)).toBeCloseTo(24);
  });

  it('close enough, the motion lands exactly on the setting', () => {
    expect(approachVelocity(vec2(0, -99), vec2(0, -100), 240, 0.1)).toEqual(vec2(0, -100));
  });
});

describe('which side of the ship something is on', () => {
  const ship0 = vec2(0, 0);
  it('ahead is up the map, behind is down', () => {
    expect(sideOf(vec2(10, -100), ship0)).toBe('ahead');
    expect(sideOf(vec2(-10, 100), ship0)).toBe('behind');
  });

  it('left and right are as the pilot sees them, facing up the map', () => {
    expect(sideOf(vec2(100, -10), ship0)).toBe('right');
    expect(sideOf(vec2(-100, 30), ship0)).toBe('left');
  });
});
