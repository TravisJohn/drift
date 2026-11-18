import { describe, expect, it } from 'vitest';
import { applyTether, closestPointOnBox, type TetherBox } from '../../src/physics/tether';
import { vec3 } from '../../src/physics/vec3';

const BOX: TetherBox = { min: vec3(-2, 0, -10), max: vec3(2, 4, 10) };
const SETTINGS = { warnDistance: 5, pullDistance: 8, maxDistance: 12, pullStrength: 3 };
const DT = 1 / 60;

describe('closestPointOnBox', () => {
  it('returns the point itself when inside the box', () => {
    expect(closestPointOnBox(vec3(1, 2, 3), BOX)).toEqual(vec3(1, 2, 3));
  });

  it('clamps each axis to the nearest face when outside', () => {
    expect(closestPointOnBox(vec3(9, -3, 3), BOX)).toEqual(vec3(2, 0, 3));
  });
});

describe('applyTether (a soft limit you feel before you hit it)', () => {
  it('leaves a drone near the ship completely alone, with no strain', () => {
    const p = vec3(2 + 4, 2, 0); // 4 m off the side: inside warnDistance
    const v = vec3(1, 0, 0);
    const r = applyTether(p, v, BOX, SETTINGS, DT);
    expect(r.position).toBe(p);
    expect(r.velocity).toBe(v);
    expect(r.strain).toBe(0);
  });

  it('raises strain from 0 at warnDistance to 1 at maxDistance, so the glow can build', () => {
    const at = (d: number) => applyTether(vec3(2 + d, 2, 0), vec3(), BOX, SETTINGS, DT).strain;
    expect(at(5)).toBe(0);
    expect(at(8.5)).toBeCloseTo(3.5 / 7, 6);
    expect(at(12)).toBe(1);
  });

  it('does not move or slow the drone between warn and pull - the warning comes first', () => {
    const v = vec3(1, 0, 0);
    const r = applyTether(vec3(2 + 7, 2, 0), v, BOX, SETTINGS, DT);
    expect(r.velocity).toBe(v);
  });

  it('pulls back toward the hull past pullDistance, harder the further out', () => {
    const pull = (d: number) =>
      applyTether(vec3(2 + d, 2, 0), vec3(), BOX, SETTINGS, DT).velocity.x;
    expect(pull(9)).toBeLessThan(0);
    expect(pull(11)).toBeLessThan(pull(9));
  });

  it('holds the drone on the hard limit and removes any outward speed', () => {
    const r = applyTether(vec3(2 + 15, 2, 0), vec3(4, 0, 1), BOX, SETTINGS, DT);
    expect(r.position.x).toBeCloseTo(2 + 12, 9);
    expect(r.velocity.x).toBeLessThanOrEqual(0);
    expect(r.velocity.z).toBe(1); // sideways drift along the limit is kept
    expect(r.strain).toBe(1);
  });

  it('measures from the nearest point of the hull, so the margin is the same off the nose', () => {
    const r = applyTether(vec3(0, 2, 10 + 15), vec3(), BOX, SETTINGS, DT);
    expect(r.position.z).toBeCloseTo(10 + 12, 9);
  });

  it('rejects settings whose distances are out of order', () => {
    expect(() => applyTether(vec3(), vec3(), BOX, { ...SETTINGS, pullDistance: 4 }, DT)).toThrow(
      /warnDistance < pullDistance < maxDistance/,
    );
  });
});
