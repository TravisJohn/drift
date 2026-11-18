import { describe, expect, it } from 'vitest';
import {
  angleBetween,
  intercept,
  segmentDistance,
  turnToward,
  wrapAngle,
} from '../../src/combat/combatMath';
import { add, distance, scale, sub, vec2 } from '../../src/combat/vec2';

describe('intercept: leading a moving target', () => {
  it('a still target is aimed at directly', () => {
    const aim = intercept(vec2(0, 0), vec2(500, 0), vec2(0, 0), 1000);
    expect(aim.x).toBeCloseTo(500);
    expect(aim.y).toBeCloseTo(0);
  });

  it('a shot fired at the aim point arrives where the moving target will be', () => {
    const origin = vec2(0, 0);
    const target = vec2(600, 0);
    const velocity = vec2(0, 200);
    const speed = 1000;
    const aim = intercept(origin, target, velocity, speed);
    // Fly the shot and the target forward together for the shot's flight time.
    const t = distance(origin, aim) / speed;
    const shotAt = add(origin, scale(sub(aim, origin), 1));
    const targetAt = add(target, scale(velocity, t));
    expect(distance(shotAt, targetAt)).toBeLessThan(0.5);
  });

  it('a target faster than the shot never yields a wild aim point', () => {
    const aim = intercept(vec2(0, 0), vec2(300, 0), vec2(2000, 0), 500, 2);
    // Capped lead: at most two seconds of the target's travel.
    expect(aim.x).toBeLessThanOrEqual(300 + 2000 * 2 + 1e-6);
    expect(Number.isFinite(aim.x) && Number.isFinite(aim.y)).toBe(true);
  });
});

describe('segmentDistance: swept hit test', () => {
  it('a point beside the middle of a segment is measured to the segment', () => {
    expect(segmentDistance(vec2(5, 3), vec2(0, 0), vec2(10, 0))).toBeCloseTo(3);
  });

  it('a point past the end is measured to the nearer end', () => {
    expect(segmentDistance(vec2(14, 3), vec2(0, 0), vec2(10, 0))).toBeCloseTo(5);
  });

  it('a fast shot that jumped over a small target still counts as passing through it', () => {
    // The shot moved 100 units in one step; the target sat in between.
    expect(segmentDistance(vec2(50, 2), vec2(0, 0), vec2(100, 0))).toBeLessThan(20);
  });

  it('a zero-length segment is just a point', () => {
    expect(segmentDistance(vec2(3, 4), vec2(0, 0), vec2(0, 0))).toBeCloseTo(5);
  });
});

describe('angles and turning', () => {
  it('wraps any angle into (-pi, pi]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
    expect(wrapAngle(0.4)).toBeCloseTo(0.4);
  });

  it('the turn between two headings is the short way round', () => {
    expect(angleBetween(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
  });

  it('turning is limited per step and lands exactly on the target when close', () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(0, -1, 0.25)).toBeCloseTo(-0.25);
    expect(turnToward(0.9, 1, 0.25)).toBeCloseTo(1);
  });
});
