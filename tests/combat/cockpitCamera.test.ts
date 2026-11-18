import { describe, expect, it } from 'vitest';
import {
  NEAR,
  bearing,
  bearingToScreenX,
  clipToNear,
  project,
  screenBearing,
  skyToCamera,
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
});

describe('aiming the guns from the cockpit with the mouse', () => {
  it('the middle of the view is straight ahead', () => {
    expect(screenBearing(frame.cx, frame)).toBeCloseTo(0);
  });

  it('right of the middle aims right, left aims left', () => {
    expect(screenBearing(frame.cx + 200, frame)).toBeGreaterThan(0);
    expect(screenBearing(frame.cx - 200, frame)).toBeLessThan(0);
  });

  it('a bearing turned into a screen column and back is the same bearing', () => {
    for (const angle of [-0.9, -0.3, 0, 0.5, 1]) {
      expect(screenBearing(bearingToScreenX(angle, frame), frame)).toBeCloseTo(angle);
    }
  });

  it('the aim lands where the raider is drawn: a raider projected on screen is aimed at by its column', () => {
    const raider = vec2(150, -400); // ahead and to the right
    const at = project(toCamera(cam, raider), frame);
    expect(at).not.toBeNull();
    expect(screenBearing(at?.x ?? 0, frame)).toBeCloseTo(bearing(cam, raider));
  });
});
