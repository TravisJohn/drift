import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/config/gameConfig';
import { boxFromCenterSize } from '../../src/physics/colliders';
import { distance, vec3 } from '../../src/physics/vec3';
import { FollowCamera } from '../../src/player/followCamera';

const DT = 1 / 60;
const cfg = gameConfig.camera;

/** Run updates until smoothing settles. */
function settle(cam: FollowCamera, target = vec3(0, 1, 0), colliders = [] as never[]) {
  let pose = cam.update(DT, target, colliders);
  for (let i = 0; i < 300; i++) pose = cam.update(DT, target, colliders);
  return pose;
}

describe('FollowCamera orbit', () => {
  it('sits at the configured distance behind the look-at point in open space', () => {
    const cam = new FollowCamera(0, 0.3);
    const pose = settle(cam);
    expect(distance(pose.position, pose.lookAt)).toBeCloseTo(cfg.distance, 3);
  });

  it('looks at a point eyeHeight above the target', () => {
    const cam = new FollowCamera(0, 0.3);
    const pose = cam.update(DT, vec3(2, 1, -3), []);
    expect(pose.lookAt).toEqual(vec3(2, 1 + cfg.eyeHeight, -3));
  });

  it('yaw 0 places the camera on the +Z side (behind a drone facing -Z)', () => {
    const cam = new FollowCamera(0, 0);
    const pose = settle(cam);
    expect(pose.position.z).toBeGreaterThan(0);
    expect(Math.abs(pose.position.x)).toBeLessThan(1e-6);
  });

  it('clamps pitch so the camera cannot flip over the top', () => {
    const cam = new FollowCamera(0, 0, 'turn');
    cam.applyLook({ dx: 0, dy: 1e9 }); // absurd downward drag
    const pose = settle(cam);
    const maxY = cfg.eyeHeight + 1 + Math.sin(cfg.pitchMax) * cfg.distance;
    expect(pose.position.y).toBeLessThanOrEqual(maxY + 1e-6);
  });
});

describe('FollowCamera look drag', () => {
  // The drone faces -Z (north) with the camera behind it on +Z. Its left
  // is -X, its right +X. The view looks from the camera toward the drone.
  const QUARTER_TURN = Math.PI / 2 / cfg.lookSensitivity;
  /** Which way the view points, flattened onto the deck. */
  const heading = (cam: FollowCamera): { x: number; z: number } => {
    const pose = settle(cam);
    return { x: pose.lookAt.x - pose.position.x, z: pose.lookAt.z - pose.position.z };
  };
  /** How far the view tips up (+) or down (-), as a height difference. */
  const tilt = (cam: FollowCamera): number => {
    const pose = settle(cam);
    return pose.lookAt.y - pose.position.y;
  };

  it('grabs the scene by default: drag right to see what is on your left', () => {
    expect(cfg.lookStyle).toBe('grab');
    const cam = new FollowCamera(0, 0);
    cam.applyLook({ dx: QUARTER_TURN, dy: 0 });
    expect(heading(cam).x).toBeLessThan(-1); // now looking left (-X)
  });

  it('drag left to see what is on your right', () => {
    const cam = new FollowCamera(0, 0);
    cam.applyLook({ dx: -QUARTER_TURN, dy: 0 });
    expect(heading(cam).x).toBeGreaterThan(1); // now looking right (+X)
  });

  it('two quarter-turn drags the same way show what is behind you', () => {
    const cam = new FollowCamera(0, 0);
    cam.applyLook({ dx: QUARTER_TURN, dy: 0 });
    cam.applyLook({ dx: QUARTER_TURN, dy: 0 });
    const view = heading(cam);
    expect(view.z).toBeGreaterThan(1); // looking +Z: back the way we came
    expect(Math.abs(view.x)).toBeLessThan(1e-6);
  });

  it('drag down to see the ceiling, drag up to see the floor', () => {
    const up = new FollowCamera(0, 0);
    up.applyLook({ dx: 0, dy: 200 });
    expect(tilt(up)).toBeGreaterThan(1); // view tips upward

    const down = new FollowCamera(0, 0);
    down.applyLook({ dx: 0, dy: -200 });
    expect(tilt(down)).toBeLessThan(-1); // view tips downward
  });

  it('can tip far enough up to look at the ceiling overhead, but never flips', () => {
    const cam = new FollowCamera(0, 0);
    cam.applyLook({ dx: 0, dy: 1e9 }); // absurd downward drag
    const pose = settle(cam);
    const rise = pose.lookAt.y - pose.position.y;
    const run = Math.hypot(pose.lookAt.x - pose.position.x, pose.lookAt.z - pose.position.z);
    const angle = Math.atan2(rise, run);
    expect(angle).toBeGreaterThan(1); // steeper than 57 degrees
    expect(angle).toBeLessThan(Math.PI / 2 - 0.2); // short of straight up
  });

  it('the turn style is the opposite: the view follows the mouse', () => {
    const cam = new FollowCamera(0, 0, 'turn');
    cam.applyLook({ dx: QUARTER_TURN, dy: 0 });
    expect(heading(cam).x).toBeGreaterThan(1); // drag right, look right
    const tipped = new FollowCamera(0, 0, 'turn');
    tipped.applyLook({ dx: 0, dy: 200 });
    expect(tilt(tipped)).toBeLessThan(-1); // drag down, look down
  });

  it('a drag of no distance leaves the view where it was', () => {
    const cam = new FollowCamera(0.4, 0.2);
    const before = settle(cam);
    cam.applyLook({ dx: 0, dy: 0 });
    expect(settle(cam)).toEqual(before);
  });
});

describe('FollowCamera wall avoidance', () => {
  it('pulls in front of a wall between the drone and the desired position', () => {
    const cam = new FollowCamera(0, 0); // desired eye on +Z at distance 3.4
    const wall = boxFromCenterSize(vec3(0, 1, 2), vec3(10, 10, 0.4)); // near face z=1.8
    const target = vec3(0, 1, 0);
    const pose = cam.update(DT, target, [wall]);
    // Camera must sit on the near side of the wall, with margin.
    expect(pose.position.z).toBeLessThanOrEqual(1.8 + 1e-6);
    expect(distance(pose.position, pose.lookAt)).toBeLessThan(cfg.distance);
  });

  it('never pulls closer than minDistance even for a wall at the drone', () => {
    const cam = new FollowCamera(0, 0);
    const wall = boxFromCenterSize(vec3(0, 1, 0.7), vec3(10, 10, 0.4));
    const pose = cam.update(DT, vec3(0, 1, 0), [wall]);
    expect(distance(pose.position, pose.lookAt)).toBeGreaterThanOrEqual(cfg.minDistance - 1e-6);
  });

  it('returns to full distance after the wall is no longer blocking', () => {
    const cam = new FollowCamera(0, 0);
    const wall = boxFromCenterSize(vec3(0, 1, 2), vec3(10, 10, 0.4));
    cam.update(DT, vec3(0, 1, 0), [wall]);
    const pose = settle(cam); // no colliders now
    expect(distance(pose.position, pose.lookAt)).toBeCloseTo(cfg.distance, 3);
  });
});
