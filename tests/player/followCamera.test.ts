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

  it('mouse X orbits the camera around the target', () => {
    const cam = new FollowCamera(0, 0);
    // Positive dx turns right: yaw decreases.
    cam.applyLook({ dx: (Math.PI / 2 / cfg.lookSensitivity) * -1, dy: 0 });
    const pose = settle(cam);
    expect(pose.position.x).toBeGreaterThan(1); // orbited onto the +X side
  });

  it('clamps pitch so the camera cannot flip over the top', () => {
    const cam = new FollowCamera(0, 0);
    cam.applyLook({ dx: 0, dy: 1e9 }); // absurd upward drag
    const pose = settle(cam);
    const maxY = cfg.eyeHeight + 1 + Math.sin(cfg.pitchMax) * cfg.distance;
    expect(pose.position.y).toBeLessThanOrEqual(maxY + 1e-6);
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
