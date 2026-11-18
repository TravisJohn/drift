import { describe, expect, it } from 'vitest';
import {
  NEAR,
  bearing,
  clipToNear,
  compassDegrees,
  project,
  skyToCamera,
  stickTurn,
  toCamera,
} from '../../src/combat/cockpitCamera';
import { vec2 } from '../../src/combat/vec2';

const NOSE_UP = -Math.PI / 2; // heading of a ship pointing up the tactical map
const cam = { pos: vec2(0, 0), heading: NOSE_UP, eye: 4 };
const frame = { cx: 400, cy: 200, focal: 500 };

describe('cockpit camera: seeing the map from the pilot seat', () => {
  it('something straight ahead on the map lands in the middle of the view, just below the horizon', () => {
    const q = toCamera(cam, vec2(0, -300));
    expect(q.x).toBeCloseTo(0);
    expect(q.z).toBeCloseTo(300);
    const s = project(q, frame);
    expect(s?.x).toBeCloseTo(400);
    expect(s?.y).toBeGreaterThan(200); // the eye sits above the plane
  });

  it('something to the right on the map appears to the right in the cockpit', () => {
    const s = project(toCamera(cam, vec2(100, -300)), frame);
    expect(s?.x).toBeGreaterThan(400);
  });

  it('turning the ship turns the view: after a quarter turn right, what was on the right is ahead', () => {
    const turned = { ...cam, heading: 0 };
    const q = toCamera(turned, vec2(300, 0));
    expect(q.z).toBeCloseTo(300);
    expect(q.x).toBeCloseTo(0);
  });

  it('things behind the pilot are not drawn', () => {
    expect(project(toCamera(cam, vec2(0, 300)), frame)).toBeNull();
  });

  it('the further away, the smaller', () => {
    const near = project(toCamera(cam, vec2(0, -100)), frame);
    const far = project(toCamera(cam, vec2(0, -1000)), frame);
    expect(near?.scale).toBeGreaterThan(far?.scale ?? Infinity);
  });

  it('a bolt starting beside the pilot is cut at the near plane, not dropped', () => {
    const clipped = clipToNear({ x: 10, y: -4, z: 0 }, { x: 0, y: -4, z: 100 });
    expect(clipped?.[0].z).toBeCloseTo(NEAR);
    expect(clipped?.[1].z).toBe(100);
    expect(clipToNear({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 1 })).toBeNull();
  });

  it('bearing: zero ahead, positive to the right, about pi behind', () => {
    expect(bearing(cam, vec2(0, -100))).toBeCloseTo(0);
    expect(bearing(cam, vec2(100, 0))).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(bearing(cam, vec2(0, 100)))).toBeCloseTo(Math.PI);
  });

  it('the sky turns with the ship: a star at the ship’s heading is dead ahead', () => {
    const q = skyToCamera(NOSE_UP, NOSE_UP, 0);
    expect(q.z).toBeCloseTo(1);
    expect(q.x).toBeCloseTo(0);
    expect(skyToCamera(NOSE_UP, NOSE_UP, 0.5).y).toBeGreaterThan(0);
  });

  it('the compass reads 0 when the nose points up the map and 90 when it points right', () => {
    expect(compassDegrees(NOSE_UP)).toBe(0);
    expect(compassDegrees(0)).toBe(90);
    expect(compassDegrees(Math.PI)).toBe(270);
  });
});

describe('mouse as a flight stick', () => {
  it('near the centre the ship flies straight (dead zone)', () => {
    expect(stickTurn(10, 1000)).toBe(0);
  });

  it('right of centre turns right, left turns left, harder the further out', () => {
    const gentle = stickTurn(120, 1000);
    const hard = stickTurn(250, 1000);
    expect(gentle).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(gentle);
    expect(stickTurn(-250, 1000)).toBeCloseTo(-hard);
  });

  it('small stick moves give gentle turns: a quarter of the way out asks for under a tenth of full spin', () => {
    expect(stickTurn(250, 2000)).toBeGreaterThan(0);
    expect(stickTurn(250, 2000)).toBeLessThan(0.1);
  });

  it('the turn never exceeds full rate, however far the pointer goes', () => {
    expect(stickTurn(5000, 1000)).toBe(1);
    expect(stickTurn(-5000, 1000)).toBe(-1);
  });
});
